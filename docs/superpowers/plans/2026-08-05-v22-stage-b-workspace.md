# v2.2 Stage B: Projects + Levels (IndexedDB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zarzadzanie projektami i poziomami (drzewko projekt -> poziomy, miniatury, przelaczanie, duplikowanie) z trwalym zapisem w IndexedDB, fallbackiem localStorage, migracja obecnego autosave i backupem workspace - wg Etapu B specu `docs/superpowers/specs/2026-08-05-v21-layers-workspace-undo-design.md`. Po drodze: backlog z finalnego review etapu A (parked bug Godot, cache flatten, split panels.ts, a11y, testy tolerancji).

**Architecture:** Interfejs `WorkspaceStore` z dwiema implementacjami: `IndexedDbStore` (produkcyjna, weryfikowana w przegladarce) i `KvJsonStore` (JSON w localStorage - fallback ORAZ nosnik testow, bo node nie ma IndexedDB; wstrzykiwane getItem/setItem czynia ja czysta i TDD-owalna). Cala logika workspace (migracja, backup merge-add, operacje CRUD wyzszego rzedu) to czyste funkcje na interfejsie - testowane na KvJsonStore. UI: nowa karta Project; panels.ts rozbity na moduly PRZED dobudowa.

**Tech Stack:** jak dotad - Vite + TypeScript strict + Vitest, zero runtime dependencies (IndexedDB i localStorage to API przegladarki).

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote/PR. Commity tylko lokalne, angielskie, jednolinijkowe, bez Co-Authored-By.
- Zero runtime dependencies; devDependencies bez zmian. Zadnych fake-indexeddb - testy przez KvJsonStore.
- UI po angielsku; komentarze PL bez diakrytykow; NIGDY dlugich myslnikow - tylko "-".
- Stylistyka v1 (biale karty, ramki 4px, przyciski niebieski/zielony/czerwony, Press Start 2P, bez gradientow/shadow).
- Confirmy przez `confirmModal` (nigdy natywny confirm).
- Id: `crypto.randomUUID()`. Czas: `Date.now()` (w kodzie appki, nie w testach snapshotowych).
- Branch roboczy: `v22-workspace` od `main`. Po ukonczeniu: lokalny merge do main.

## File Structure

```
src/core/store.ts        # NOWY: typy ProjectMeta/LevelRecord, interfejs WorkspaceStore,
                         #       KvJsonStore (wstrzykiwane KV), logika: ensureSeed, migrateLegacy,
                         #       exportWorkspace/importWorkspace (merge-add), nextName
src/core/idb.ts          # NOWY: IndexedDbStore implements WorkspaceStore (browser-only, bez testow node)
src/core/editorState.ts  # NOWY (refaktor): PanelsState -> EditorState, activeGrid, clampedActive,
                         #       contentRev (cache flatten)
src/ui/panels/           # NOWY katalog (refaktor split z panels.ts):
  context.ts             #   PanelsCtx (state, markDirty, centerOnPaper, onMutate hooks), toast, pop
  draw.ts legend.ts layers.ts generate.ts exportModal.ts importModal.ts project.ts
src/ui/panels.ts         # MOD: cienki initPanels skladajacy moduly (public API bez zmian dla app.ts)
src/ui/thumb.ts          # NOWY: renderThumb(level): string|null (offscreen canvas ~120x80 dataURL)
src/ui/renderer.ts       # MOD: cache flatten po contentRev
src/export/godot.ts      # MOD: dedupe po EMITOWANYM kluczu (parked bug)
src/export/tiled.ts, rexpaint.ts, text.ts  # MOD: bounds sanity cap
src/app.ts               # MOD: boot przez WorkspaceStore, migracja, wskaznik biezacego poziomu
index.html               # MOD: karta Project na gorze sidebara (#panel-project)
tests/store.test.ts      # NOWY  tests/{godot,tiled,rexpaint,project,level}.test.ts  # MOD/rozszerzenia
```

Zadania: 1 = backlog/parked fixes (TDD), 2 = refaktor bez zmian zachowania, 3 = rdzen workspace (TDD),
4 = boot/autosave na store, 5 = karta Project UI, 6 = a11y, 7 = docs + 2.2.0 + zip.

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v22-workspace`

---

### Task 1: Backlog fixes z finalnego review A (TDD)

**Files:**
- Modify: `src/export/godot.ts`, `src/export/tiled.ts`, `src/export/rexpaint.ts`, `src/export/text.ts`
- Test: `tests/godot.test.ts`, `tests/tiled.test.ts`, `tests/rexpaint.test.ts`, `tests/project.test.ts`, `tests/level.test.ts`

**Interfaces:**
- Produces:
  - godot: dedupe kluczy LEVELS po EMITOWANYM kluczu (seen-set emitowanych; przy kolizji bump sufiksu az do unikalnosci) - naprawia parked case `['dup','dup','dup (2)'] -> ['dup','dup (2)','dup (3)']`
  - `MAX_EXPORT_CELLS = 4_000_000` (eksport w `src/core/level.ts`); exportTmx, buildXpBytes i Grid-eksporty tekstowe rzucaja `Error('Map bounds too large to export')` gdy (w * h) union bounds przekracza cap (UI juz pokazuje Error.message czerwonym toastem)
  - testy tolerancji v3 parsera: brak name -> "layer N" (numeracja po pominieciach), visible: "yes" (nie-bool) -> true, origin: ["x", null] -> [0,0]
  - test levelUsedChars z niewidoczna warstwa (znaki ukrytej warstwy TEZ w wyniku)

- [ ] **Step 1: Failing testy** - dopisz do istniejacych plikow:

```ts
// tests/godot.test.ts - dodatkowy test
  it('dedupe kluczy dziala tez przy literalnej nazwie rownej sufiksowi', () => {
    const lv = createLevel();
    lv.layers[0]!.name = 'dup';
    lv.layers[0]!.grid = Grid.fromLines(['#']);
    lv.layers.push(makeLayer('dup', Grid.fromLines(['#'])));
    lv.layers.push(makeLayer('dup (2)', Grid.fromLines(['#'])));
    lv.legend.syncWith(['#']);
    const out = exportGodot(lv);
    expect(out).toContain('"dup":');
    expect(out).toContain('"dup (2)":');
    expect(out).toContain('"dup (3)":');
    expect(out.match(/"dup \(2\)":/g)).toHaveLength(1);
  });
```

```ts
// tests/tiled.test.ts - dodatkowy test
  it('rzuca czytelny blad przy absurdalnych bounds', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    lv.layers[0]!.grid.set(999999, 999999, '#');
    lv.legend.syncWith(['#']);
    expect(() => exportTmx(lv)).toThrow('Map bounds too large to export');
  });
```

```ts
// tests/rexpaint.test.ts - dodatkowy test (analogiczny)
  it('rzuca czytelny blad przy absurdalnych bounds', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    lv.layers[0]!.grid.set(999999, 999999, '#');
    lv.legend.syncWith(['#']);
    expect(() => buildXpBytes(lv)).toThrow('Map bounds too large to export');
  });
```

```ts
// tests/project.test.ts - dodatkowe testy tolerancji v3
  it('toleruje snieciete pola warstw v3', () => {
    const back = parseProject(JSON.stringify({
      app: 'ascii-level-editor', version: 3, legend: [],
      layers: [
        { lines: ['#'], visible: 'yes', origin: ['x', null] },
        { lines: 123 },
        { lines: ['@'] },
      ],
    }));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('layer 1');
    expect(back.layers[0]!.visible).toBe(true);
    expect(back.layers[0]!.grid.get(0, 0)).toBe('#');
    expect(back.layers[1]!.name).toBe('layer 2');
  });
```

```ts
// tests/level.test.ts - dodatkowy test
  it('levelUsedChars obejmuje niewidoczne warstwy', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    const ukryta = makeLayer('u', Grid.fromLines(['@']));
    ukryta.visible = false;
    lv.layers.push(ukryta);
    expect(levelUsedChars(lv)).toEqual(['#', '@']);
  });
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/godot.test.ts tests/tiled.test.ts tests/rexpaint.test.ts tests/project.test.ts tests/level.test.ts` (czesc przejdzie od razu - tolerancje v3 i levelUsedChars moga juz dzialac; to OK, dokumentuja kontrakt; bounds-cap i godot MUSZA failowac)

- [ ] **Step 3: Implementacja**

godot.ts - zastap dedupeKeys wersja po emitowanym kluczu:

```ts
// dedupe po EMITOWANYM kluczu: kolizje (takze z literalnymi nazwami w stylu "x (2)") bumpuja sufiks
function dedupeKeys(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let key = name;
    for (let n = 2; used.has(key); n++) key = `${name} (${n})`;
    used.add(key);
    return key;
  });
}
```

level.ts - dodaj:

```ts
export const MAX_EXPORT_CELLS = 4_000_000;

export function assertExportableBounds(b: Bounds | null): void {
  if (!b) return;
  const cells = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
  if (cells > MAX_EXPORT_CELLS) throw new Error('Map bounds too large to export');
}
```

Wywolaj `assertExportableBounds(unionBounds(level.layers))` na poczatku exportTmx, buildXpBytes, exportKaplay, exportGodot; w text.ts `assertExportableBounds(bounds ?? grid.bounds())` w exportTxt/exportCsv; w legacy.ts analogicznie.

- [ ] **Step 4: PASS.** `npm test` + `npm run build` zielone.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Fix godot key dedupe edge and add export bounds cap"`

---

### Task 2: Refaktor - split panels.ts, editorState, cache flatten (bez zmian zachowania)

**Files:**
- Create: `src/core/editorState.ts`, `src/ui/panels/context.ts`, `src/ui/panels/{draw,legend,layers,generate,exportModal,importModal}.ts`
- Modify: `src/ui/panels.ts` (cienki kompozytor), `src/app.ts` (importy), `src/ui/renderer.ts` (cache)

**Interfaces:**
- Produces:
  - `src/core/editorState.ts`: `interface EditorState { level: Level; activeLayer: number; view: View; brush: string; contentRev: number }` + `activeGrid(state)`, `clampedActive(state)`, `bumpContent(state)` (`contentRev++`). PanelsState pozostaje jako alias typu re-eksportowany z panels.ts (zgodnosc).
  - `src/ui/panels/context.ts`: `interface PanelsCtx { state, markDirty(), centerOnPaper(), onMutate() }` + toast/playPop/el-helpers wspoldzielone (przeniesione, nie skopiowane); STORAGE_KEY i logika autosave zostaja tu tymczasowo (Task 4 przenosi na store).
  - Kazdy modul panelu: `initX(ctx, container): { refresh?() }`. panels.ts sklada je i eksportuje dotychczasowe API (`initPanels(ctx)` zwracajace `onMutate`), wiec app.ts zmienia tylko sciezki importow typow.
  - renderer: `draw(level, view, contentRev)` cache'uje flatten - przelicza tylko gdy `contentRev` sie zmienil (pan/zoom nie inwaliduja). app.ts przekazuje `state.contentRev`; wszystkie mutacje ida przez `bumpContent` (paint/erase/layer ops/generate/import/clear/restore).
- KRYTERIUM: zero zmian zachowania. `npm test` 40+ zielone bez modyfikacji testow; CDP smoke: malowanie, warstwy, modale, autosave dzialaja jak przed refaktorem.

- [ ] **Step 1:** editorState.ts + przeniesienie typow/helperow; bumpContent wpiety we wszystkie mutacje.
- [ ] **Step 2:** split modulow per plik wg obecnych sekcji panels.ts; context.ts z toast/pop/el.
- [ ] **Step 3:** renderer cache (pole `cachedFlat: {rev, grid} | null`).
- [ ] **Step 4:** Weryfikacja: `npm run build`, `npm test`, CDP smoke (paint/pan/zoom/layers/modale/reload-restore), porownanie zachowania.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Split panels into modules and cache flattened level"`

---

### Task 3: Rdzen workspace (core/store.ts + core/idb.ts) - TDD

**Files:**
- Create: `src/core/store.ts`, `src/core/idb.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Produces (store.ts):

```ts
export interface ProjectMeta { id: string; name: string; createdAt: number; updatedAt: number }
export interface LevelRecord {
  id: string; projectId: string; name: string; order: number;
  data: string;            // JSON v3 (serializeProject)
  thumb: string | null;    // dataURL albo null
  updatedAt: number;
}
export interface WorkspaceStore {
  listProjects(): Promise<ProjectMeta[]>;
  putProject(p: ProjectMeta): Promise<void>;
  deleteProject(id: string): Promise<void>;      // kasuje tez poziomy projektu
  listLevels(projectId: string): Promise<LevelRecord[]>;  // rosnaco po order
  getLevel(id: string): Promise<LevelRecord | null>;
  putLevel(l: LevelRecord): Promise<void>;
  deleteLevel(id: string): Promise<void>;
}
export interface Kv { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class KvJsonStore implements WorkspaceStore { constructor(kv: Kv, key?: string) }  // caly workspace jako jeden JSON pod kluczem 'ascii-level-editor-workspace'
export function nextName(base: string, existing: string[]): string  // 'Level' -> pierwszy wolny 'Level N'
export async function ensureSeed(store: WorkspaceStore, now: number, legacyJson: string | null):
  Promise<{ projectId: string; levelId: string; migrated: boolean }>
  // pusty store: tworzy 'My project'/'Level 1'; legacyJson (stary autosave v2/v3) laduje do data poziomu i migrated=true
export async function exportWorkspace(store: WorkspaceStore): Promise<string>
  // { app: 'ascii-level-editor-workspace', version: 1, projects, levels } (bez thumb - thumb: null przy eksporcie, odchudza plik)
export async function importWorkspace(store: WorkspaceStore, json: string, now: number): Promise<{ projects: number; levels: number }>
  // merge-add: WSZYSTKO dostaje nowe id (remap projectId w poziomach), nazwy projektow kolidujace -> nextName; rzuca Error('Unrecognized workspace file') gdy format obcy
```

- Produces (idb.ts): `openIdbStore(): Promise<WorkspaceStore>` - baza `ascii-level-editor` v1, store `projects` (keyPath id), store `levels` (keyPath id, index `projectId`); operacje w transakcjach; deleteProject kasuje poziomy przez indeks. Odrzucenie/blad otwarcia -> reject (caller decyduje o fallbacku). Bez testow jednostkowych (brak IndexedDB w node) - weryfikacja przegladarkowa w Tasku 4; logika wspolna (nextName itd.) zyje w store.ts.

- [ ] **Step 1: Failing testy** (KvJsonStore na stubie Kv - mapa w pamieci):

```ts
// tests/store.test.ts
import { describe, expect, it } from 'vitest';
import { KvJsonStore, ensureSeed, exportWorkspace, importWorkspace, nextName } from '../src/core/store';
import type { Kv } from '../src/core/store';

function memKv(): Kv {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('workspace store', () => {
  it('CRUD projektow i poziomow, poziomy sortowane po order', async () => {
    const s = new KvJsonStore(memKv());
    await s.putProject({ id: 'p1', name: 'P', createdAt: 1, updatedAt: 1 });
    await s.putLevel({ id: 'l2', projectId: 'p1', name: 'B', order: 2, data: '{}', thumb: null, updatedAt: 1 });
    await s.putLevel({ id: 'l1', projectId: 'p1', name: 'A', order: 1, data: '{}', thumb: null, updatedAt: 1 });
    expect((await s.listLevels('p1')).map((l) => l.id)).toEqual(['l1', 'l2']);
    await s.deleteProject('p1');
    expect(await s.listProjects()).toEqual([]);
    expect(await s.listLevels('p1')).toEqual([]);
  });

  it('nextName znajduje pierwszy wolny numer', () => {
    expect(nextName('Level', [])).toBe('Level 1');
    expect(nextName('Level', ['Level 1', 'Level 3'])).toBe('Level 2');
  });

  it('ensureSeed: pusty store tworzy My project/Level 1; legacy autosave migruje', async () => {
    const s = new KvJsonStore(memKv());
    const seeded = await ensureSeed(s, 42, '{"app":"ascii-level-editor","version":2,"origin":[0,0],"lines":["#"],"legend":[]}');
    expect(seeded.migrated).toBe(true);
    const lvl = await s.getLevel(seeded.levelId);
    expect(lvl!.data).toContain('"#"');
    const again = await ensureSeed(s, 43, null);
    expect(again.projectId).toBe(seeded.projectId);
    expect(again.migrated).toBe(false);
  });

  it('export/import workspace: merge-add z nowymi id i remapem', async () => {
    const a = new KvJsonStore(memKv());
    await a.putProject({ id: 'p1', name: 'World', createdAt: 1, updatedAt: 1 });
    await a.putLevel({ id: 'l1', projectId: 'p1', name: 'L1', order: 1, data: '{"x":1}', thumb: 'data:...', updatedAt: 1 });
    const json = await exportWorkspace(a);
    expect(json).toContain('"ascii-level-editor-workspace"');
    expect(json).not.toContain('data:...');

    const b = new KvJsonStore(memKv());
    await b.putProject({ id: 'z', name: 'World', createdAt: 1, updatedAt: 1 });
    const res = await importWorkspace(b, json, 99);
    expect(res).toEqual({ projects: 1, levels: 1 });
    const projs = await b.listProjects();
    expect(projs).toHaveLength(2);
    const imported = projs.find((p) => p.id !== 'z')!;
    expect(imported.name).toBe('World 2');
    expect(imported.id).not.toBe('p1');
    const lvls = await b.listLevels(imported.id);
    expect(lvls).toHaveLength(1);
    expect(lvls[0]!.data).toBe('{"x":1}');
    expect(await b.listLevels('p1')).toEqual([]);
  });

  it('importWorkspace odrzuca obcy format', async () => {
    const s = new KvJsonStore(memKv());
    await expect(importWorkspace(s, '{"foo":1}', 1)).rejects.toThrow('Unrecognized workspace file');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/store.test.ts`
- [ ] **Step 3: Implementacja store.ts** wg Interfaces (KvJsonStore: odczyt/zapis calego workspace `{projects: [], levels: []}` pod jednym kluczem przy kazdej operacji - prostota > wydajnosc, fallback path; ensureSeed: parsuje legacyJson przez parseProject i re-serializuje serializeProject dla normalizacji do v3 - importy z core/project; katch bledow legacy -> ignoruj, migrated=false, seed pusty).
- [ ] **Step 4: Implementacja idb.ts** wg Interfaces (promisyfikacja request -> Promise; upgrade w onupgradeneeded).
- [ ] **Step 5: PASS.** `npm test` + `npm run build` zielone.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add workspace store core with IndexedDB and KV implementations"`

---

### Task 4: Boot i autosave na WorkspaceStore + migracja + fallback

**Files:**
- Modify: `src/app.ts`, `src/ui/panels/context.ts` (autosave), `src/ui/panels/importModal.ts` (bez zmian logiki importu poziomu)

**Zachowanie:**
- Boot: `openIdbStore()` -> sukces: store IDB; blad -> `KvJsonStore(localStorage)` + zolty (info) toast "Storage fallback: browser storage limited".
- `ensureSeed(store, Date.now(), localStorage.getItem('ascii-level-editor-v2'))`; gdy `migrated`, przemianuj stary klucz na `ascii-level-editor-v2-backup` (nie kasuj) i pokaz toast "Migrated your map to My project / Level 1".
- Wskaznik biezacego: localStorage `ascii-level-editor-current` = `{"projectId":"...","levelId":"..."}`; przy bootcie laduj wskazany poziom (fallback: pierwszy poziom pierwszego projektu; brak -> seed).
- Autosave (debounce 500ms + flush jak dotad) pisze `putLevel({ ...rec, data: serializeProject(state.level), thumb: renderThumb(state.level), updatedAt: Date.now() })` biezacego rekordu. `renderThumb` z `src/ui/thumb.ts` (NOWY): offscreen canvas 120x80, tlo kremowe, flatten w skali dopasowanej do union bounds, kolory legendy; zwraca dataURL (jpeg quality 0.6) albo null przy pustym poziomie. Throttle miniatur: przy kazdym save (tanio przy 120x80).
- Stary mechanizm zapisu poziomu do localStorage znika (klucz zostaje tylko jako backup migracji).
- KRYTERIUM: reload przywraca dokladnie ostatni stan; migracja jednorazowa; fallback dziala (CDP: zablokuj indexedDB przez `Object.defineProperty` w init skrypcie i sprawdz toast + dzialanie).

- [ ] **Step 1:** thumb.ts + wpiecie store w app.ts (async boot przed initPanels; loader nie jest potrzebny - boot < 50ms).
- [ ] **Step 2:** autosave na putLevel; usun stary zapis localStorage.
- [ ] **Step 3:** Weryfikacja CDP: paint -> reload -> stan wraca (z IDB); migracja z istniejacym starym kluczem; fallback z zablokowanym IDB; brak bledow konsoli.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Persist current level in workspace store with migration and fallback"`

---

### Task 5: Karta Project (UI)

**Files:**
- Create: `src/ui/panels/project.ts`
- Modify: `index.html` (sekcja "Project" NAD Draw, `#panel-project`), `src/styles.css`, `src/ui/panels.ts` (kompozycja)

**Zachowanie:**
- Naglowek karty: select projektow + przyciski w rzedzie: New (niebieski), Rename (bialy), Delete (czerwony X, confirmModal "Delete project ... and all its levels?"; nie mozna usunac ostatniego projektu - disabled).
  New project: prompt-modal (maly modal z inputem + OK/Cancel - dodaj `promptModal(title, initial): Promise<string | null>` do src/ui/modal.ts, stylistyka jak confirmModal) -> nazwa domyslna `nextName('Project', ...)`; tworzy projekt + pusty "Level 1" i przelacza.
  Rename: promptModal z obecna nazwa.
- Lista poziomow biezacego projektu: wiersz = miniatura (48x32, obramowana; placeholder szare tlo gdy null) + nazwa (inline input jak warstwy) + przyciski: Duplicate (bialy), Delete (czerwony X; confirmModal; ostatniego poziomu projektu nie mozna usunac - disabled). Klik w wiersz (poza kontrolkami) = przelaczenie poziomu: flushSave biezacego -> load wybranego (parseProject z data; blad -> czerwony toast, zostajemy) -> centerOnPaper, markDirty, aktualizacja wskaznika current. Aktywny poziom podswietlony jak aktywna warstwa (niebieskie tlo nazwy).
- Przycisk "New level" (niebieski, full width): nowy pusty poziom `nextName('Level', ...)` na koncu (order = max+1), przelacza.
- Duplicate: kopia data/thumb z nazwa `nextName(oryginalna_nazwa, ...)`, order za oryginalem, przelacza na kopie.
- Footer karty: dwa przyciski w rzedzie: "Export workspace" (bialy; pobiera `workspace.json` przez exportWorkspace + istniejacy helper download) i "Import workspace" (bialy; file input .json -> importWorkspace -> toast "Imported P projects, L levels" -> refresh listy; blad -> czerwony toast).
- Zmiany nazw projektow/poziomow zapisywane od razu (putProject/putLevel) z updatedAt.
- KRYTERIUM: pelny scenariusz CDP: nowy projekt, 2 poziomy, malowanie w kazdym, przelaczanie tam i z powrotem (stany wracaja z miniaturami), duplicate, delete z confirmem, export workspace -> import workspace (przybywa "Project 2" z poziomami), reload przywraca ostatni aktywny poziom.

- [ ] **Step 1:** promptModal w modal.ts (reuse mount/stack - bez duplikacji).
- [ ] **Step 2:** project.ts wg zachowania + style + index.html.
- [ ] **Step 3:** Weryfikacja CDP scenariuszem + screenshoty do scratchpada.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add project panel with level management and workspace backup"`

---

### Task 6: Pakiet a11y (backlog A)

**Files:**
- Modify: `src/ui/modal.ts`, `src/styles.css`

**Zachowanie:**
- Karta modala: `role="dialog"`, `aria-modal="true"`, `aria-label` = tytul; confirm/prompt: `role="alertdialog"`.
- Focus trap: Tab/Shift+Tab cyklicznie w obrebie NAJWYZSZEGO modala (capture keydown w istniejacym handlerze Esc); przy zamknieciu focus wraca do elementu sprzed otwarcia.
- Disabled contrast: tekst `#6b7280` na `#e5e7eb` (poprawa z ~2:1 do ~4:1), bez zmian palety aktywnych stanow.
- focusFirst: pseudo-klasa `:not(:disabled)` mapowana na KAZDY selektor listy (naprawa latent buga).
- KRYTERIUM: CDP - Tab w otwartym Export modalu nie ucieka do tla; Esc dziala jak dotad; axe-core NIE dodajemy (zero deps) - wystarczy manualna weryfikacja atrybutow w DOM.

- [ ] **Step 1:** Implementacja + weryfikacja CDP (dump atrybutow, sekwencja Tab).
- [ ] **Step 2: Commit.** `git add -A && git commit -m "Add dialog a11y attributes, focus trap and contrast fixes"`

---

### Task 7: Docs + wersja 2.2.0 + pakowanie

**Files:**
- Modify: `README.md` (sekcja Projects and levels: model workspace, IndexedDB + fallback, migracja, backup JSON, miniatury, multi-tab last-writer-wins), `itch-page.md` (features + changelog "v2.2: projects and levels with thumbnails, IndexedDB persistence, workspace backup"), `package.json` (`"version": "2.2.0"`)

- [ ] **Step 1:** Docs (czysty ASCII, bez dlugich myslnikow) + wersja.
- [ ] **Step 2:** `npm run zip`; `unzip -l` (index, standalone, LICENSES, assets); standalone.html przez file:// headless - dziala z IDB (albo fallback) bez bledow konsoli.
- [ ] **Step 3:** `npm test` + `npm run build` zielone.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Document workspace and bump version to 2.2.0"`

---

## Self-Review (wykonany)

- **Pokrycie Etapu B specu:** IndexedDB + schema (T3), karta Project z CRUD/miniaturami/przelaczaniem (T5), autosave debounce do store + migracja localStorage + fallback (T4), backup workspace merge-add (T3+T5), multi-tab note (T7). Rozszerzenia wzgledem specu: promptModal (potrzebny dla nazw - spec zakladal inline, modal jest spójniejszy z nowym UI), thumb w jpeg (rozmiar).
- **Backlog A pokryty:** parked godot dedupe (T1), bounds cap (T1), testy tolerancji (T1), split panels + inwersja warstw STORAGE_KEY/activeGrid (T2 - autosave przenosi sie do context.ts, potem T4 na store; activeGrid do core/editorState), flatten cache (T2), a11y + focusFirst (T6).
- **Placeholdery:** brak; T2/T4/T5/T6 to specyfikacje zachowania wg konwencji planow v2.0/v2.1 (rdzen logiki w T1/T3 z pelnym kodem testow).
- **Spojnosc typow:** WorkspaceStore/LevelRecord zdefiniowane w T3, konsumowane w T4/T5; EditorState/bumpContent w T2, uzywane dalej; assertExportableBounds w level.ts (T1) wolane przez eksportery.
- **Ryzyko sekwencji:** T2 (refaktor) przed T4/T5 celowo - nowa karta Project powstaje od razu w docelowej strukturze modulow.
