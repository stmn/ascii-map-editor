# v2.3 Stage C: Undo/Redo + Legend Remap + Dual Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Undo/redo (spec Etap C) + trzy prosby usera: zmiana znaku wpisu legendy (z przemapowaniem komorek), odstep scrollbara w sidebarze, lewy sidebar z drag & drop sekcji.

**Architecture:** `core/history.ts` - stos komend z inwersjami (czysty, TDD). `core/remap.ts` - przemapowanie znaku na poziomie (czysty, TDD). Integracja w UI przez istniejace hooki panelowe; gest malowania dostaje granice stroke'a w InputController. Layout sidebarow: dwa kontenery + HTML5 DnD na summary, persystencja w localStorage.

**Tech Stack:** jak dotad - Vite + TS strict + Vitest, zero runtime deps.

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote/PR. Commity lokalne, angielskie, jednolinijkowe, bez Co-Authored-By.
- Zero runtime dependencies. UI po angielsku; komentarze PL bez diakrytykow; NIGDY dlugich myslnikow.
- Stylistyka v1; confirmy/prompty przez modale; toasty jak dotad.
- Historia: sesyjna, per poziom (przelaczenie poziomu/projektu CZYSCI historie), cap 100 wpisow, redo czyszczone przy nowej akcji. Operacje na projektach/workspace POZA historia.
- Po kazdym undo/redo: bumpContent + markDirty + scheduleSave + odswiezenie paneli Layers/Legend.
- Weryfikacje przegladarkowe: JEDNA krotka sesja CDP per task UI (C3/C4), kill + dowod ps.
- Branch: `v23-undo-ui` od `main`. Po ukonczeniu: lokalny merge.

## File Structure

```
src/core/history.ts      # NOWY: Command, History (push/undo/redo/clear/canUndo/canRedo, cap)
src/core/remap.ts        # NOWY: remapChar(level, from, to) -> RemapResult (komorki per warstwa)
src/ui/panels/history.ts # NOWY: przyciski Undo/Redo w karcie Draw + skroty + spiecie komend
src/ui/layout.ts         # NOWY: dwa sidebary, DnD sekcji, persystencja ukladu
src/ui/panels/legend.ts  # MOD: edycja znaku wpisu (remap + komenda historii)
src/ui/input.ts          # MOD: callback strokeEnd() na koncu gestu
src/ui/panels/*.ts       # MOD: mutacje pchaja komendy do historii
src/app.ts, index.html, src/styles.css  # MOD: lewy sidebar, centrowanie, gap scrollbara
tests/history.test.ts    # NOWY  tests/remap.test.ts  # NOWY
```

Zadania: C1 historia (TDD), C2 remap (TDD) + UI legendy, C3 integracja undo/redo, C4 sidebary, C5 docs+2.3.0.

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v23-undo-ui`

---

### Task 1: Rdzen historii (core/history.ts) - TDD

**Files:**
- Create: `src/core/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Command { label: string; undo(): void; redo(): void }
export class History {
  constructor(cap?: number)          // domyslnie 100
  push(cmd: Command): void           // NIE wykonuje redo (caller juz zastosowal zmiane); czysci stos redo; przycina do cap (najstarsze wypadaja)
  undo(): Command | null             // zdejmuje z undo, wola cmd.undo(), przenosi na redo; null gdy pusto
  redo(): Command | null             // odwrotnie
  clear(): void
  canUndo(): boolean; canRedo(): boolean
  onChange?: () => void              // wolane po kazdym push/undo/redo/clear (do odswiezania przyciskow)
}
```

- [ ] **Step 1: Failing test**

```ts
// tests/history.test.ts
import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';
import type { Command } from '../src/core/history';

function cmd(log: string[], name: string): Command {
  return { label: name, undo: () => log.push(`undo:${name}`), redo: () => log.push(`redo:${name}`) };
}

describe('History', () => {
  it('undo/redo w kolejnosci LIFO, redo czyszczone przy push', () => {
    const log: string[] = [];
    const h = new History();
    h.push(cmd(log, 'a'));
    h.push(cmd(log, 'b'));
    expect(h.canUndo()).toBe(true);
    expect(h.undo()!.label).toBe('b');
    expect(h.undo()!.label).toBe('a');
    expect(h.canUndo()).toBe(false);
    expect(h.redo()!.label).toBe('a');
    h.push(cmd(log, 'c'));            // czysci redo ('b')
    expect(h.canRedo()).toBe(false);
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a']);
  });

  it('cap wyrzuca najstarsze', () => {
    const log: string[] = [];
    const h = new History(2);
    h.push(cmd(log, '1')); h.push(cmd(log, '2')); h.push(cmd(log, '3'));
    expect(h.undo()!.label).toBe('3');
    expect(h.undo()!.label).toBe('2');
    expect(h.undo()).toBeNull();
  });

  it('clear i onChange', () => {
    let ticks = 0;
    const h = new History();
    h.onChange = () => { ticks++; };
    h.push(cmd([], 'x'));   // 1
    h.undo();               // 2
    h.redo();               // 3
    h.clear();              // 4
    expect(ticks).toBe(4);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('undo/redo na pustych stosach nie wola onChange', () => {
    let ticks = 0;
    const h = new History();
    h.onChange = () => { ticks++; };
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(ticks).toBe(0);
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/history.test.ts`
- [ ] **Step 3: Implementacja**

```ts
// src/core/history.ts
// Sesyjna historia komend: caller stosuje zmiane, potem push(cmd) z inwersja.
export interface Command { label: string; undo(): void; redo(): void }

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  onChange?: () => void;

  constructor(private cap = 100) {}

  private changed(): void { this.onChange?.(); }

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    this.redoStack = [];
    this.changed();
  }

  undo(): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.changed();
    return cmd;
  }

  redo(): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    this.changed();
    return cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
}
```

- [ ] **Step 4: PASS.** `npm test` + `npm run build` zielone.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add session command history core"`

---

### Task 2: Remap znaku legendy (core/remap.ts) + UI edycji literki

**Files:**
- Create: `src/core/remap.ts`
- Modify: `src/ui/panels/legend.ts`, `src/styles.css` (male pole znaku edytowalne)
- Test: `tests/remap.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RemapResult { cells: { layerId: string; x: number; y: number }[] }
// Przemapowuje WSZYSTKIE komorki `from` -> `to` na wszystkich warstwach oraz wpis legendy
// (zachowuje name/color/pozycje wpisu). Rzuca Error('Character already in use') gdy `to`
// jest w legendzie lub na mapie; Error('Invalid character') gdy to nie pojedynczy znak
// drukowalny (to.length !== 1 lub to === ' '). Zwraca liste przemapowanych komorek
// (do komendy historii - inwersja robi remap w druga strone).
export function remapChar(level: Level, from: string, to: string): RemapResult
```

- [ ] **Step 1: Failing test**

```ts
// tests/remap.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { remapChar } from '../src/core/remap';

describe('remapChar', () => {
  function lvl() {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#.#']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['#'], 0, 1)));
    lv.legend.syncWith(['#', '.']);
    return lv;
  }

  it('przemapowuje komorki na wszystkich warstwach i wpis legendy', () => {
    const lv = lvl();
    const res = remapChar(lv, '#', 'X');
    expect(lv.layers[0]!.grid.toLines()).toEqual(['X.X']);
    expect(lv.layers[1]!.grid.get(0, 1)).toBe('X');
    expect(lv.legend.get('#')).toBeNull();
    expect(lv.legend.get('X')!.name).toBe('wall');
    expect(lv.legend.entries()[0]!.ch).toBe('X'); // pozycja wpisu zachowana
    expect(res.cells).toHaveLength(3);
    expect(res.cells.filter((c) => c.layerId === lv.layers[1]!.id)).toHaveLength(1);
  });

  it('odrzuca kolizje i zle znaki', () => {
    const lv = lvl();
    expect(() => remapChar(lv, '#', '.')).toThrow('Character already in use');
    expect(() => remapChar(lv, '#', 'XX')).toThrow('Invalid character');
    expect(() => remapChar(lv, '#', ' ')).toThrow('Invalid character');
  });

  it('kolizja ze znakiem obecnym tylko na mapie (bez legendy) tez odrzucona', () => {
    const lv = lvl();
    lv.layers[0]!.grid.set(9, 9, 'Z');
    expect(() => remapChar(lv, '#', 'Z')).toThrow('Character already in use');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/remap.test.ts`
- [ ] **Step 3: Implementacja**

```ts
// src/core/remap.ts
// Zmiana znaku wpisu legendy = przemapowanie komorek na wszystkich warstwach.
import { Level, levelUsedChars } from './level';
import { LegendEntry } from './legend';
import { Legend } from './legend';

export interface RemapResult { cells: { layerId: string; x: number; y: number }[] }

export function remapChar(level: Level, from: string, to: string): RemapResult {
  if (to.length !== 1 || to === ' ') throw new Error('Invalid character');
  if (to === from) return { cells: [] };
  if (level.legend.get(to) || levelUsedChars(level).includes(to)) {
    throw new Error('Character already in use');
  }
  const cells: RemapResult['cells'] = [];
  for (const layer of level.layers) {
    for (const { x, y, ch } of [...layer.grid.cells()]) {
      if (ch !== from) continue;
      layer.grid.set(x, y, to);
      cells.push({ layerId: layer.id, x, y });
    }
  }
  // wpis legendy: podmiana klucza z zachowaniem pozycji i danych
  const entries = level.legend.entries();
  const rebuilt = entries.map((e): LegendEntry => (e.ch === from ? { ...e, ch: to } : e));
  const fresh = Legend.from(rebuilt);
  level.legend = fresh as never; // legend jest polem Level - podmiana referencji
  return { cells };
}
```

UWAGA implementacyjna: `level.legend = fresh` wymaga, by pole `legend` w `Level` nie bylo readonly (nie jest). Cast `as never` NIE jest potrzebny, jesli typy sie zgadzaja - usun go, jesli tsc nie protestuje (preferowane). Jesli podmiana referencji psuje konsumentow trzymajacych stara referencje (renderer czyta z level.legend przy kazdym draw - OK), alternatywa: metoda mutujaca w Legend (`replaceChar(from, to)`), wybierz czystsza przy implementacji i odnotuj w raporcie.

- [ ] **Step 4: PASS.** `npm test` + `npm run build` zielone (build moze wymagac drobnej korekty typu - patrz uwaga).
- [ ] **Step 5: UI w karcie Legend:** znak wpisu (obecnie statyczny chip) dostaje maly przycisk edycji albo staje sie klikalny -> promptModal('Change character', obecny znak) -> `remapChar` w try/catch (blad -> czerwony toast); sukces -> bumpContent + markDirty + scheduleSave + refresh legendy/warstw + pop + KOMENDA do historii (jesli Task 3 juz scalil historie - jesli ten task idzie przed integracja, zostaw TODO-hook: wywolaj `ctx.hooks.pushHistory?.(cmd)` opcjonalnie; Task 3 go podepnie).
- [ ] **Step 6: Weryfikacja:** testy + build; UI sprawdzi CDP w Tasku 3/4 (bez osobnej sesji tutaj).
- [ ] **Step 7: Commit.** `git add -A && git commit -m "Add legend character remap with collision guard"`

---

### Task 3: Integracja undo/redo

**Files:**
- Create: `src/ui/panels/history.ts`
- Modify: `src/ui/input.ts` (callback `strokeEnd()`), `src/app.ts`, `src/ui/panels/{context,draw,layers,legend,generate,importModal}.ts`, `src/ui/panels.ts`, `src/styles.css`

**Zachowanie:**
- **Stroke:** InputController dostaje `strokeEnd()` w callbackach, wolane przy pointerup/pointercancel konczacym gest malowania/gumki. app.ts zbiera w trakcie gestu `{layerId, x, y, before, after}` (tylko realne zmiany: before !== after; before czytane PRZED set) i na strokeEnd pcha StrokeCommand (undo: set before wszystkich komorek od konca; redo: set after). Pojedynczy klik = gest.
- **ReplaceCommand** (snapshot celego poziomu przez serializeProject/parseProject): dla generate, clear layer, import poziomu. Undo/redo = podmiana state.level przez wspolna sciezke applyLevelToState/applyLevelToPanels (activeLayer 0). Label: 'Generate maze'/'Generate dungeon'/'Clear layer'/'Import'.
- **LayerOpCommand:** add/remove (inwersja: remove/add na tym samym indeksie z tym samym obiektem warstwy), move (swap z powrotem), visibility (toggle), rename warstwy (before/after stringi; push na blur/change, nie per keystroke). Aktywna warstwa po undo: indeks warstwy dotknietej operacja (clamp).
- **LegendEditCommand:** zmiany name (push na change/blur) i color (push na change) wpisu legendy; RemapCommand z Taska 2 (undo = remapChar(to->from), redo = remapChar(from->to) - przez te sama funkcje, inwersja symetryczna).
- **Rejestr:** jedna instancja History w panels/history.ts; hook `pushHistory(cmd)` w PanelsCtx.hooks; `clear()` przy setCurrentLevel (przelaczenie poziomu/projektu/import workspace) - wpiac w context.setCurrentLevel.
- **UI:** rzad dwoch przyciskow Undo/Redo (biale, disabled wg canUndo/canRedo, odswiezane przez History.onChange) NAD chipami w karcie Draw. Skroty: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z i Ctrl/Cmd+Y = redo - w istniejacym globalnym handlerze klawiatury panels (guard: isTypingTarget + isModalOpen), preventDefault.
- **Po kazdym undo/redo:** bumpContent + markDirty + scheduleSave + refresh Layers/Legend (hooki) + pop NIE gra (za czeste).
- Operacje NIE-historyczne (level switch, project CRUD, workspace import/export) nie pchaja komend; import POZIOMU pcha ReplaceCommand.

- [ ] **Step 1:** input.ts strokeEnd + app.ts zbieranie stroke'a.
- [ ] **Step 2:** panels/history.ts (instancja, przyciski, skroty, hook, clear przy switch).
- [ ] **Step 3:** komendy we wszystkich punktach mutacji (lista wyzej) - kazdy punkt wymieniony w raporcie z miejscem push.
- [ ] **Step 4:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: namaluj 3 komorki jednym gestem -> Ctrl+Z cofa caly gest -> Ctrl+Shift+Z przywraca; generate -> undo przywraca poprzednia mape; add layer -> undo usuwa; rename warstwy -> undo; zmiana koloru legendy -> undo; remap literki -> undo; przyciski disabled na swiezym poziomie; przelaczenie poziomu czysci (przyciski disabled); zero bledow konsoli; kill + ps.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add undo redo with command history across editor mutations"`

---

### Task 4: Dwa sidebary + drag & drop + gap scrollbara

**Files:**
- Create: `src/ui/layout.ts`
- Modify: `index.html`, `src/styles.css`, `src/app.ts` (centrowanie), `src/ui/panels.ts` (init layout)

**Zachowanie:**
- **Gap (prosba #3):** odstep miedzy scrollbarem kontenera a kartami: `scrollbar-gutter: stable` + `padding-right: 8px` na kontenerze sidebara (i lustrzanie `padding-left` na lewym). Scrollbar nie moze nachodzic na ramki kart.
- **Lewy sidebar:** `#sidebar-left` (kolumna jak prawy, `left: 12px`, ten sam styl przezroczystego kontenera). Domyslnie pusty.
- **DnD:** kazda sekcja (`details.card`) przeciagalna za naglowek (summary; `draggable="true"` na summary, dragstart ustawia dataTransfer z id sekcji; klik dalej toggle'uje - dragstart nie blokuje click). Dropzone: oba kontenery; wskaznik wstawienia (2px czarna linia miedzy kartami w miejscu upuszczenia); upuszczenie przenosi sekcje na pozycje. Podczas przeciagania pusty kontener pokazuje kreskowana strefe (`outline dashed`), na co dzien pusty kontener nie zajmuje interakcji (pointer-events wylaczone poza dragiem).
- **Persystencja:** localStorage `ascii-level-editor-layout` = `{ left: string[], right: string[] }` (id sekcji: project/draw/layers/legend/generate/export/import). Przy bootcie layout stosowany przed initPanels (przenoszenie elementow `<details>` miedzy kontenerami wg listy; nieznane/nowe sekcje trafiaja na koniec prawego). Uklad domyslny = obecny (wszystko po prawej).
- **Centrowanie mapy:** `centerOnPaper` liczy wolny obszar: `window.innerWidth - widthRight - widthLeft` i przesuwa srodek o `(widthLeft - widthRight)/2` wzgledem srodka okna (szerokosci mierzone `getBoundingClientRect().width` kontenerow, 0 gdy pusty). Resize/drop -> recenter NIE jest wymagany automatycznie (user moze reczniej centrowac przez istniejace sciezki; jesli latwo - przelicz przy drop).
- **Modale/toasty:** bez zmian (fixed, niezalezne od sidebarow).

- [ ] **Step 1:** layout.ts + index.html + style (gap, lewy kontener, wskaznik wstawienia, drag-strefa).
- [ ] **Step 2:** persystencja + aplikacja przy bootcie + centrowanie.
- [ ] **Step 3:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: gap widoczny (screenshot), przeciagnij Legend do lewego sidebara (HTML5 DnD przez CDP Input.dispatchDragEvent lub fallback: wywolaj funkcje przenoszaca bezposrednio + zasymuluj dragstart/drop eventami syntetycznymi - odnotuj metode), reload -> uklad przywrocony, mapa wycentrowana z uwzglednieniem obu kolumn, sekcje dzialaja po przeniesieniu (klik w przyciski), zero bledow konsoli; screenshoty; kill + ps.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add dual sidebar layout with drag and drop sections"`

---

### Task 5: Docs + wersja 2.3.0 + pakowanie

**Files:**
- Modify: `README.md` (sekcje: Undo/redo - zakres komend i skroty, historia per poziom; Legend - zmiana znaku z remapem; Layout - dwa sidebary + DnD + persystencja), `itch-page.md` (features + changelog "v2.3: undo/redo, legend character remap, customizable dual-sidebar layout"), `package.json` (`"version": "2.3.0"`)

- [ ] **Step 1:** Docs (ASCII, bez dlugich myslnikow) + wersja.
- [ ] **Step 2:** `npm run zip`; `unzip -l`; standalone.html file:// headless check (jedna sesja, kill + ps).
- [ ] **Step 3:** `npm test` + `npm run build` zielone.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Document undo redo and layout, bump version to 2.3.0"`

---

## Self-Review (wykonany)

- **Prosby usera pokryte:** undo/redo (C1+C3), zmiana literki (C2), gap scrollbara (C4 Step 1), lewy sidebar + DnD (C4). Odpowiedzi na pytania 2 i 5 udzielone poza planem.
- **Spec Etap C pokryty:** komendy Stroke/Replace/LayerOp/LegendEdit + Remap, cap 100, sesyjna per poziom, skroty i przyciski, syncy po undo (C3).
- **Placeholdery:** brak; C3/C4 behawioralne wg konwencji poprzednich planow, C1/C2 z pelnym kodem.
- **Spojnosc typow:** Command/History z C1 uzywane w C2 (hook opcjonalny) i C3; RemapResult z C2 w komendzie C3; strokeEnd dodany w C3 tam gdzie zdefiniowany.
- **Ryzyko:** podmiana referencji legend w remapChar - jawnie opisana z alternatywa; DnD w CDP - dopuszczony fallback syntetyczny z adnotacja.
