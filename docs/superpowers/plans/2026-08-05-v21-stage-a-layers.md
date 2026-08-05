# v2.1 Stage A: Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nazwane warstwy mapy (do 8, Tiled-style) z formatem projektu v3, multi-warstwowymi eksportami (TMX/Godot/KaPlay/.xp) i panelem Layers, zgodnie ze specem `docs/superpowers/specs/2026-08-05-v21-layers-workspace-undo-design.md`.

**Architecture:** Nowy modul `core/level.ts` (Layer/Level, union bounds, flatten) jako jedyne zrodlo modelu warstw. `Grid` bez zmian poza opcjonalnym `toLines(bounds)`. Eksportery przechodza z `(grid, legend)` na `(level)`. UI: stan trzyma `level + activeLayer`, renderer rysuje splaszczenie widocznych warstw, nowa karta Layers w sidebarze.

**Tech Stack:** jak v2.0 - Vite + TypeScript strict + Vitest, zero runtime dependencies.

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote/PR - repo nie ma i nie bedzie mialo remote. Commity tylko lokalne.
- Zero runtime dependencies; devDependencies bez zmian (vite, typescript, vitest).
- 100% client-side; dziala w iframe itch (base './') i w standalone.html (file://).
- UI po angielsku; komentarze w kodzie po polsku bez diakrytykow; NIGDY dlugich myslnikow - tylko "-".
- Commity: angielskie, jedna linia, bez Co-Authored-By.
- Stylistyka v1 (kremowy papier #F0EAD2, tlo #665A4F, siatka #ADC178, Press Start 2P, biale karty z ramka 4px, przyciski: niebieski akcja / zielony load / czerwony destrukcja).
- Limit warstw: 8 (MAX_LAYERS). Jedna wspolna legenda na poziom. Wspolrzedne wspolne dla wszystkich warstw; eksporty na union bounds (pliki per warstwa pokrywaja sie pozycyjnie).
- Kompatybilnosc importu: v3 ORAZ v2 ORAZ wszystkie warianty v1 (te ostatnie -> jedna warstwa "main").
- Branch roboczy: `v21-layers` od `main`. Po ukonczeniu: lokalny merge do main (bez pytania o push).

## File Structure

```
src/core/level.ts        # NOWY: Layer, Level, MAX_LAYERS, makeLayer, createLevel,
                         #       unionBounds, flattenLayers, levelUsedChars
src/core/grid.ts         # MOD: toLines(bounds?) - jawny prostokat bez trimu
src/core/project.ts      # MOD: serializeProject(level) v3, parseProject -> Level
src/export/text.ts       # MOD: exportTxt/exportCsv(grid, bounds?)
src/export/kaplay.ts     # MOD: exportKaplay(level) - addLevel per widoczna warstwa
src/export/godot.ts      # MOD: exportGodot(level) - LEVELS dict + load_layer
src/export/tiled.ts      # MOD: exportTmx(level, tileSize?) - <layer> per warstwa
src/export/rexpaint.ts   # MOD: multi-layer build/parse/export/import
src/ui/renderer.ts       # MOD: draw(level, view), paper na union bounds
src/ui/panels.ts         # MOD: karta Layers, scope dropdown, import/generate/clear per model warstw
src/ui/modal.ts          # NOWY (Task 9): infrastruktura modali + confirmModal
src/export/legacy.ts     # NOWY (Task 9): eksport formatow v1 (text / array-text / array-array)
src/app.ts               # MOD: stan {level, activeLayer, view, brush}
tests/level.test.ts      # NOWY
tests/legacy.test.ts     # NOWY (Task 9)
tests/{grid,project,text,kaplay,godot,tiled,rexpaint}.test.ts  # MOD
```

Zadania 1-6: czysta logika TDD. Zadania 7-9: UI (Task 9 = modale, dodany na prosbe usera w trakcie realizacji). Zadanie 10: docs + pakowanie.

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v21-layers`

(Zaden commit; branch to calosc kroku. Kolejne taski commituja na tym branchu.)

---

### Task 1: Model warstw (core/level.ts) + Grid.toLines(bounds)

**Files:**
- Create: `src/core/level.ts`
- Modify: `src/core/grid.ts` (tylko metoda `toLines`)
- Test: `tests/level.test.ts`, dopisek w `tests/grid.test.ts`

**Interfaces:**
- Produces:
  - `interface Layer { id: string; name: string; visible: boolean; grid: Grid }`
  - `interface Level { layers: Layer[]; legend: Legend }`
  - `const MAX_LAYERS = 8`
  - `makeLayer(name: string, grid?: Grid): Layer` (id = `crypto.randomUUID()`)
  - `createLevel(): Level` (jedna warstwa "main", pusta legenda)
  - `unionBounds(layers: Layer[]): Bounds | null` (unia bounds WSZYSTKICH warstw, takze niewidocznych; null gdy wszystkie puste)
  - `flattenLayers(layers: Layer[]): Grid` (tylko WIDOCZNE warstwy, najwyzsza wygrywa w komorce)
  - `levelUsedChars(level: Level): string[]` (unia usedChars wszystkich warstw, posortowana)
  - `Grid.toLines(bounds?: Bounds): string[]` - z jawnym bounds: dokladny prostokat, BEZ trimu trailing spaces (potrzebne do paddingu KaPlay); bez argumentu: dotychczasowe zachowanie (wlasne bounds + trim)

- [ ] **Step 1: Failing testy**

```ts
// tests/level.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { MAX_LAYERS, createLevel, flattenLayers, levelUsedChars, makeLayer, unionBounds } from '../src/core/level';

describe('Level', () => {
  it('createLevel ma jedna widoczna warstwe main', () => {
    const lv = createLevel();
    expect(lv.layers).toHaveLength(1);
    expect(lv.layers[0]!.name).toBe('main');
    expect(lv.layers[0]!.visible).toBe(true);
    expect(lv.layers[0]!.grid.isEmpty()).toBe(true);
    expect(MAX_LAYERS).toBe(8);
  });

  it('unionBounds obejmuje wszystkie warstwy, takze niewidoczne', () => {
    const a = makeLayer('a', Grid.fromLines(['#'], 0, 0));
    const b = makeLayer('b', Grid.fromLines(['@'], 5, 3));
    b.visible = false;
    expect(unionBounds([a, b])).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 3 });
    expect(unionBounds([makeLayer('pusta')])).toBeNull();
  });

  it('flattenLayers: gorna widoczna wygrywa, niewidoczne pomijane', () => {
    const dol = makeLayer('dol', Grid.fromLines(['ab']));
    const gora = makeLayer('gora', Grid.fromLines(['X']));
    const ukryta = makeLayer('ukryta', Grid.fromLines(['ZZZ']));
    ukryta.visible = false;
    const flat = flattenLayers([dol, gora, ukryta]);
    expect(flat.get(0, 0)).toBe('X');
    expect(flat.get(1, 0)).toBe('b');
    expect(flat.get(2, 0)).toBeNull();
  });

  it('levelUsedChars sumuje warstwy', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    lv.layers.push(makeLayer('l2', Grid.fromLines(['@'])));
    expect(levelUsedChars(lv)).toEqual(['#', '@']);
  });
});
```

Dopisz do `tests/grid.test.ts`:

```ts
  it('toLines z jawnym bounds: dokladny prostokat bez trimu', () => {
    const g = Grid.fromLines(['#']);
    expect(g.toLines({ minX: 0, minY: 0, maxX: 2, maxY: 1 })).toEqual(['#  ', '   ']);
  });
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/level.test.ts tests/grid.test.ts`

- [ ] **Step 3: Implementacja**

W `src/core/grid.ts` zamien metode `toLines()` na:

```ts
  toLines(bounds?: Bounds): string[] {
    const b = bounds ?? this.bounds();
    if (!b) return [];
    const lines: string[] = [];
    for (let y = b.minY; y <= b.maxY; y++) {
      let line = '';
      for (let x = b.minX; x <= b.maxX; x++) line += this.get(x, y) ?? ' ';
      lines.push(bounds ? line : line.replace(/ +$/, ''));
    }
    return lines;
  }
```

```ts
// src/core/level.ts
// Model warstw: poziom = lista warstw + wspolna legenda. Wspolny uklad wspolrzednych.
import { Bounds, Grid } from './grid';
import { Legend } from './legend';

export interface Layer { id: string; name: string; visible: boolean; grid: Grid }
export interface Level { layers: Layer[]; legend: Legend }

export const MAX_LAYERS = 8;

export function makeLayer(name: string, grid: Grid = new Grid()): Layer {
  return { id: crypto.randomUUID(), name, visible: true, grid };
}

export function createLevel(): Level {
  return { layers: [makeLayer('main')], legend: new Legend() };
}

export function unionBounds(layers: Layer[]): Bounds | null {
  let out: Bounds | null = null;
  for (const l of layers) {
    const b = l.grid.bounds();
    if (!b) continue;
    out = out
      ? {
          minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY),
          maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY),
        }
      : { ...b };
  }
  return out;
}

// splaszczenie widocznych warstw: iterujemy od dolu, gorne nadpisuja
export function flattenLayers(layers: Layer[]): Grid {
  const flat = new Grid();
  for (const l of layers) {
    if (!l.visible) continue;
    for (const { x, y, ch } of l.grid.cells()) flat.set(x, y, ch);
  }
  return flat;
}

export function levelUsedChars(level: Level): string[] {
  const set = new Set<string>();
  for (const l of level.layers) for (const ch of l.grid.usedChars()) set.add(ch);
  return [...set].sort();
}
```

- [ ] **Step 4: PASS.** `npm test` (wszystkie dotychczasowe tez zielone - toLines bez argumentu bez zmian)

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add layer model with union bounds and flatten"`

---

### Task 2: Format v3 (core/project.ts)

**Files:**
- Modify: `src/core/project.ts` (cala zawartosc ponizej), `tests/project.test.ts`

**Interfaces:**
- Consumes: `Level`, `makeLayer`, `Legend.from`
- Produces:
  - `serializeProject(level: Level): string` - JSON `{app, version: 3, legend, layers: [{name, visible, origin: [x,y], lines}]}`
  - `parseProject(json: string): Level` - czyta v3; v2 `{lines, origin, legend}` -> warstwa "main" + legenda; wszystkie warianty v1 (gola tablica, array-array, map/data/rows, tiles-string, cells, surowy tekst) -> warstwa "main" bez legendy. Rzuca `Error('Unrecognized map format')` jak dotad.

- [ ] **Step 1: Przepisz `tests/project.test.ts` na ponizsze (istniejace przypadki zachowane, asercje na Level)**

```ts
// tests/project.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { parseProject, serializeProject } from '../src/core/project';

describe('project', () => {
  it('roundtrip v3: warstwy, widocznosc, origin, legenda', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(5, 7, '#');
    lv.legend.upsert('#', { name: 'wall', color: '#112233' });
    const l2 = makeLayer('deco', Grid.fromLines(['@'], 1, 1));
    l2.visible = false;
    lv.layers.push(l2);
    const back = parseProject(serializeProject(lv));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('main');
    expect(back.layers[0]!.grid.get(5, 7)).toBe('#');
    expect(back.layers[1]!.name).toBe('deco');
    expect(back.layers[1]!.visible).toBe(false);
    expect(back.layers[1]!.grid.get(1, 1)).toBe('@');
    expect(back.legend.get('#')!.name).toBe('wall');
  });

  it('importuje v2 jako jedna warstwe main z legenda', () => {
    const v2 = JSON.stringify({
      app: 'ascii-level-editor', version: 2, origin: [5, 7], lines: ['#@'],
      legend: [{ ch: '#', name: 'wall', color: '#888888' }],
    });
    const back = parseProject(v2);
    expect(back.layers).toHaveLength(1);
    expect(back.layers[0]!.name).toBe('main');
    expect(back.layers[0]!.grid.get(5, 7)).toBe('#');
    expect(back.layers[0]!.grid.get(6, 7)).toBe('@');
    expect(back.legend.get('#')!.name).toBe('wall');
  });

  it('importuje gola tablice stringow (v1)', () => {
    const back = parseProject(JSON.stringify(['###', '#.#']));
    expect(back.layers[0]!.grid.toLines()).toEqual(['###', '#.#']);
    expect(back.legend.entries()).toEqual([]);
  });

  it('importuje array-array (v1), pierwszy znak komorki', () => {
    const back = parseProject(JSON.stringify([['XX', ' '], ['.', '#']]));
    expect(back.layers[0]!.grid.toLines()).toEqual(['X', '.#']);
  });

  it('importuje {cells:[{x,y,c}]}', () => {
    const back = parseProject(JSON.stringify({ cells: [{ x: 0, y: 0, c: '#' }] }));
    expect(back.layers[0]!.grid.get(0, 0)).toBe('#');
  });

  it('importuje {map}/{data}/{rows}/{tiles}', () => {
    for (const key of ['map', 'data', 'rows']) {
      expect(parseProject(JSON.stringify({ [key]: ['#'] })).layers[0]!.grid.get(0, 0)).toBe('#');
    }
    expect(parseProject(JSON.stringify({ tiles: '#\n.' })).layers[0]!.grid.get(0, 1)).toBe('.');
  });

  it('importuje surowy tekst (v1 text)', () => {
    expect(parseProject('###\n#.#').layers[0]!.grid.toLines()).toEqual(['###', '#.#']);
  });

  it('odrzuca smieci i pusty string', () => {
    expect(() => parseProject('{"foo": 1}')).toThrow('Unrecognized map format');
    expect(() => parseProject('')).toThrow('Unrecognized map format');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/project.test.ts`

- [ ] **Step 3: Implementacja - przepisz `src/core/project.ts`**

```ts
// src/core/project.ts
import { Grid } from './grid';
import { Legend } from './legend';
import type { LegendEntry } from './legend';
import { Layer, Level, makeLayer } from './level';

export type { LegendEntry };

export function serializeProject(level: Level): string {
  return JSON.stringify({
    app: 'ascii-level-editor',
    version: 3,
    legend: level.legend.entries(),
    layers: level.layers.map((l) => {
      const b = l.grid.bounds();
      return {
        name: l.name,
        visible: l.visible,
        origin: b ? [b.minX, b.minY] : [0, 0],
        lines: l.grid.toLines(),
      };
    }),
  }, null, 2);
}

function levelOf(layers: Layer[], legend: LegendEntry[]): Level {
  return { layers, legend: Legend.from(legend) };
}

function single(grid: Grid, legend: LegendEntry[] = []): Level {
  return levelOf([{ ...makeLayer('main'), grid }], legend);
}

// tolerancyjny odczyt: v3 + v2 + znane warianty v1/obce
export function parseProject(json: string): Level {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    // format tekstowy v1: surowy tekst z liniami oddzielonymi newline
    if (json.trim().length === 0) {
      throw new Error('Unrecognized map format');
    }
    const lines = json.split('\n').map((line) => line.replace(/\r$/, ''));
    return single(Grid.fromLines(lines, 0, 0));
  }

  if (Array.isArray(data) && data.every((l) => typeof l === 'string')) {
    return single(Grid.fromLines(data as string[]));
  }

  // format array-array v1: tablica tablic znakow
  if (Array.isArray(data) && data.every((row) => Array.isArray(row) && (row as unknown[]).every((cell) => typeof cell === 'string'))) {
    const lines = (data as string[][]).map((row) => row.map((cell) => (cell || ' ')[0]).join(''));
    return single(Grid.fromLines(lines));
  }

  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    const legend = Array.isArray(o.legend) ? (o.legend as LegendEntry[]) : [];

    // v3: warstwy
    if (Array.isArray(o.layers)) {
      const layers: Layer[] = [];
      for (const raw of o.layers as Record<string, unknown>[]) {
        if (!Array.isArray(raw.lines)) continue;
        const origin = Array.isArray(raw.origin) ? (raw.origin as number[]) : [0, 0];
        const layer = makeLayer(typeof raw.name === 'string' ? raw.name : `layer ${layers.length + 1}`);
        layer.visible = raw.visible !== false;
        layer.grid = Grid.fromLines(raw.lines as string[], Number(origin[0]) || 0, Number(origin[1]) || 0);
        layers.push(layer);
      }
      if (layers.length) return levelOf(layers, legend);
    }

    // v2: pojedyncza mapa
    if (Array.isArray(o.lines)) {
      const origin = Array.isArray(o.origin) ? (o.origin as number[]) : [0, 0];
      return single(Grid.fromLines(o.lines as string[], Number(origin[0]) || 0, Number(origin[1]) || 0), legend);
    }
    for (const key of ['map', 'data', 'rows']) {
      if (Array.isArray(o[key]) && (o[key] as unknown[]).every((l) => typeof l === 'string')) {
        return single(Grid.fromLines(o[key] as string[]));
      }
    }
    if (typeof o.tiles === 'string') return single(Grid.fromLines((o.tiles as string).split('\n')));
    if (Array.isArray(o.cells)) {
      const g = new Grid();
      for (const c of o.cells as Record<string, unknown>[]) {
        const ch = (c.ch ?? c.c ?? c.char) as string | undefined;
        if (typeof c.x === 'number' && typeof c.y === 'number' && typeof ch === 'string') {
          g.set(c.x, c.y, ch);
        }
      }
      if (!g.isEmpty()) return single(g);
    }
  }
  throw new Error('Unrecognized map format');
}
```

Uwaga: `single()` nadpisuje pole `grid` obiektu z `makeLayer` przez spread - tak jest celowo (id/visible z makeLayer, grid wstrzykniety).

- [ ] **Step 4: PASS.** `npm test` - UWAGA: `src/ui/panels.ts` i `src/app.ts` na tym etapie NIE kompiluja sie z nowym parseProject; to oczekiwane az do Taska 7-8. `npm test` (vitest) przechodzi, ale `npm run build` (tsc) NIE - dlatego w Taskach 2-6 weryfikujemy TYLKO `npm test` + `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "src/ui\|src/app"` (bledy wylacznie w src/ui/src/app sa dopuszczalne przejsciowo). Jesli grep pokazuje bledy w core/export/tests - napraw przed commitem.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add project format v3 with layers"`

---

### Task 3: TXT/CSV z jawnym bounds (export/text.ts)

**Files:**
- Modify: `src/export/text.ts`, `tests/text.test.ts`

**Interfaces:**
- Produces: `exportTxt(grid: Grid, bounds?: Bounds): string`, `exportCsv(grid: Grid, bounds?: Bounds): string` - z jawnym bounds renderuja dokladnie ten prostokat (TXT trymuje trailing spaces per linia; CSV zostawia puste kolumny), bez bounds: jak dotad.

- [ ] **Step 1: Dopisz do `tests/text.test.ts`**

```ts
  it('txt i csv z jawnym bounds (wyrownanie miedzy warstwami)', () => {
    const g = Grid.fromLines(['#'], 1, 0);
    const b = { minX: 0, minY: 0, maxX: 2, maxY: 1 };
    expect(exportTxt(g, b)).toBe(' #\n\n');
    expect(exportCsv(g, b)).toBe(',#,\n,,\n');
  });
```

(dodaj import `Bounds` nie jest potrzebny w tescie - literal wystarcza)

- [ ] **Step 2: FAIL.** `npx vitest run tests/text.test.ts`

- [ ] **Step 3: Implementacja - przepisz `src/export/text.ts`**

```ts
import { Bounds, Grid } from '../core/grid';

export function exportTxt(grid: Grid, bounds?: Bounds): string {
  return grid.toLines(bounds).map((l) => l.replace(/ +$/, '') + '\n').join('');
}

export function exportCsv(grid: Grid, bounds?: Bounds): string {
  const b = bounds ?? grid.bounds();
  if (!b) return '';
  const rows: string[] = [];
  for (let y = b.minY; y <= b.maxY; y++) {
    const cols: string[] = [];
    for (let x = b.minX; x <= b.maxX; x++) {
      const ch = grid.get(x, y) ?? '';
      cols.push(ch === ',' || ch === '"' ? `"${ch.replace('"', '""')}"` : ch);
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n') + '\n';
}
```

- [ ] **Step 4: PASS.** `npm test` (stare testy txt/csv bez zmian - brak bounds = stare zachowanie; dodatkowy trim w exportTxt jest no-opem dla bezargumentowego toLines)

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Support explicit bounds in TXT and CSV exporters"`

---

### Task 4: KaPlay + Godot na Level (export/kaplay.ts, export/godot.ts)

**Files:**
- Modify: `src/export/kaplay.ts`, `src/export/godot.ts`, `tests/kaplay.test.ts`, `tests/godot.test.ts`

**Interfaces:**
- Consumes: `Level`, `unionBounds`
- Produces:
  - `exportKaplay(level: Level): string` - wspolny `const tiles = {...}` + jeden `addLevel([...], {...tiles})` per WIDOCZNA warstwa (komentarz `// layer: <name>` nad kazdym); linie padowane do union bounds (dokladna szerokosc, bez trimu)
  - `exportGodot(level: Level): string` - naglowek jak dotad, `const LEVELS = { "<name>": [...], ... }` (WSZYSTKIE warstwy), wspolne `const TILES`, `func load_layer(tile_map: TileMapLayer, layer_name: String, source_id: int = 0)`

- [ ] **Step 1: Przepisz oba testy**

```ts
// tests/kaplay.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportKaplay } from '../src/export/kaplay';

describe('kaplay export', () => {
  it('addLevel per widoczna warstwa, linie padowane do union bounds', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 2, 0)));
    const ukryta = makeLayer('ukryta', Grid.fromLines(['Z']));
    ukryta.visible = false;
    lv.layers.push(ukryta);
    lv.legend.syncWith(['#', '@', '~', 'Z']);
    const out = exportKaplay(lv);
    expect(out).toContain('const tiles = {');
    expect(out).toContain('"#": () => [sprite("wall")]');
    expect(out).toContain('// layer: main');
    expect(out).toContain('"#@ "');
    expect(out).toContain('// layer: deco');
    expect(out).toContain('"  ~"');
    expect(out).not.toContain('ukryta');
    expect((out.match(/addLevel\(/g) ?? []).length).toBe(2);
  });
});
```

```ts
// tests/godot.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportGodot } from '../src/export/godot';

describe('godot export', () => {
  it('LEVELS per warstwa, wspolne TILES, load_layer', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 2, 0)));
    lv.legend.syncWith(['#', '@', '~']);
    const out = exportGodot(lv);
    expect(out).toContain('const LEVELS = {');
    expect(out).toContain('"main": [');
    expect(out).toContain('"deco": [');
    expect(out).toContain('"#@ "');
    expect(out).toContain('"  ~"');
    expect(out).toContain('"#": Vector2i(0, 0)');
    expect(out).toContain('func load_layer(tile_map: TileMapLayer, layer_name: String, source_id: int = 0) -> void:');
    expect(out).toContain('set_cell(Vector2i(x, y), source_id, TILES[ch])');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/kaplay.test.ts tests/godot.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/export/kaplay.ts
import { Level, unionBounds } from '../core/level';

// snippet dla KaPlay (kaplayjs.com): wspolne tiles + addLevel per widoczna warstwa;
// linie padowane do union bounds, zeby warstwy pokrywaly sie pozycyjnie
export function exportKaplay(level: Level): string {
  const b = unionBounds(level.layers);
  const tiles = level.legend.entries()
    .map((e) => `  ${JSON.stringify(e.ch)}: () => [sprite(${JSON.stringify(e.name)})],`)
    .join('\n');
  const blocks = level.layers.filter((l) => l.visible).map((l) => {
    const lines = (b ? l.grid.toLines(b) : []).map((s) => `  ${JSON.stringify(s)},`).join('\n');
    return `// layer: ${l.name}\naddLevel([\n${lines}\n], {\n  tileWidth: 16,\n  tileHeight: 16,\n  tiles,\n});\n`;
  }).join('\n');
  return `const tiles = {\n${tiles}\n};\n\n${blocks}`;
}
```

```ts
// src/export/godot.ts
import { Level, unionBounds } from '../core/level';

// GDScript dla Godot 4.x: LEVELS per warstwa (uzytkownik podpina osobne TileMapLayer),
// wspolne TILES -> atlas coords wg kolejnosci legendy
export function exportGodot(level: Level): string {
  const b = unionBounds(level.layers);
  const levels = level.layers.map((l) => {
    const lines = (b ? l.grid.toLines(b) : []).map((s) => `\t\t${JSON.stringify(s)},`).join('\n');
    return `\t${JSON.stringify(l.name)}: [\n${lines}\n\t],`;
  }).join('\n');
  const tiles = level.legend.entries()
    .map((e, i) => `\t${JSON.stringify(e.ch)}: Vector2i(${i}, 0), # ${e.name}`)
    .join('\n');
  return `# generated by ASCII Level Editor
const LEVELS = {
${levels}
}

const TILES = {
${tiles}
}

func load_layer(tile_map: TileMapLayer, layer_name: String, source_id: int = 0) -> void:
\tvar level = LEVELS[layer_name]
\tfor y in level.size():
\t\tfor x in level[y].length():
\t\t\tvar ch := level[y][x]
\t\t\tif TILES.has(ch):
\t\t\t\ttile_map.set_cell(Vector2i(x, y), source_id, TILES[ch])
`;
}
```

- [ ] **Step 4: PASS.** `npm test` + tsc-check jak w Task 2 Step 4

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Export KaPlay and Godot per layer"`

---

### Task 5: TMX multi-layer (export/tiled.ts)

**Files:**
- Modify: `src/export/tiled.ts`, `tests/tiled.test.ts`

**Interfaces:**
- Produces: `exportTmx(level: Level, tileSize = 16): string` - wymiary z union bounds; jedna `<layer id="<i+1>" name="<esc(name)>" ...>` per warstwa (WSZYSTKIE, niewidoczne z atrybutem ` visible="0"`); tileset/gid ze wspolnej legendy jak dotad.

- [ ] **Step 1: Przepisz `tests/tiled.test.ts`**

```ts
// tests/tiled.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportTmx } from '../src/export/tiled';

describe('tmx export', () => {
  it('dwie warstwy, wspolne wymiary, visible=0 dla ukrytej', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@', '# ']);
    const deco = makeLayer('deco', Grid.fromLines(['~'], 1, 1));
    deco.visible = false;
    lv.layers.push(deco);
    lv.legend.syncWith(['#', '@', '~']); // '#'=gid1, '@'=gid2, '~'=gid3
    const xml = exportTmx(lv);
    expect(xml).toContain('<map version="1.10"');
    expect(xml).toContain('width="2" height="2"');
    expect(xml).toContain('tilecount="3"');
    expect(xml).toContain('<layer id="1" name="main" width="2" height="2">');
    expect(xml).toContain('<layer id="2" name="deco" width="2" height="2" visible="0">');
    const norm = xml.replace(/\s+/g, ' ');
    expect(norm).toContain('1,2, 1,0'); // main
    expect(norm).toContain('0,0, 0,3'); // deco: ~ na (1,1)
    expect(xml).toContain('value="wall"');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/tiled.test.ts`

- [ ] **Step 3: Implementacja - przepisz `src/export/tiled.ts`**

```ts
import { Level, unionBounds } from '../core/level';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function exportTmx(level: Level, tileSize = 16): string {
  const b = unionBounds(level.layers);
  const w = b ? b.maxX - b.minX + 1 : 0;
  const h = b ? b.maxY - b.minY + 1 : 0;
  const entries = level.legend.entries();
  const gidOf = new Map(entries.map((e, i) => [e.ch, i + 1]));

  const layerXml = level.layers.map((layer, li) => {
    const rows: string[] = [];
    if (b) {
      for (let y = b.minY; y <= b.maxY; y++) {
        const row: number[] = [];
        for (let x = b.minX; x <= b.maxX; x++) {
          const ch = layer.grid.get(x, y);
          row.push(ch ? gidOf.get(ch) ?? 0 : 0);
        }
        rows.push(row.join(',') + ',');
      }
    }
    const csv = rows.join('\n').replace(/,$/, '');
    const vis = layer.visible ? '' : ' visible="0"';
    return ` <layer id="${li + 1}" name="${esc(layer.name)}" width="${w}" height="${h}"${vis}>
  <data encoding="csv">
${csv}
  </data>
 </layer>`;
  }).join('\n');

  const tiles = entries.map((e, i) =>
    `  <tile id="${i}"><properties><property name="name" value="${esc(e.name)}"/>` +
    `<property name="char" value="${esc(e.ch)}"/></properties></tile>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="${w}" height="${h}" tilewidth="${tileSize}" tileheight="${tileSize}" infinite="0">
 <tileset firstgid="1" name="legend" tilewidth="${tileSize}" tileheight="${tileSize}" tilecount="${entries.length}" columns="${entries.length}">
  <image source="tileset.png" width="${tileSize * Math.max(1, entries.length)}" height="${tileSize}"/>
${tiles}
 </tileset>
${layerXml}
</map>
`;
}
```

- [ ] **Step 4: PASS.** `npm test` + tsc-check jak w Task 2 Step 4. Zapisz przyklad do pliku tymczasowego w scratchpadzie i przepusc przez `xmllint --noout` jesli dostepny.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Export TMX with one layer element per map layer"`

---

### Task 6: REXPaint .xp multi-layer (export/rexpaint.ts)

**Files:**
- Modify: `src/export/rexpaint.ts`, `tests/rexpaint.test.ts`

**Interfaces:**
- Produces:
  - `buildXpBytes(level: Level): Uint8Array` - `int32LE version=-1`, `int32LE layerCount=level.layers.length (min 1)`, potem PER WARSTWA (kolejnosc = kolejnosc w level, warstwa 0 = najnizsza, zgodnie z REXPaint): `int32LE w`, `int32LE h` (wymiary z union bounds, wspolne dla wszystkich warstw; 1x1 gdy poziom pusty), komorki kolumnami po 10 bajtow jak dotad (fg z legendy, pusta = kod 32 + bg magenta)
  - `parseXpBytes(bytes): { layers: { name: string; grid: Grid }[]; colors: Map<string, string> }` - walidacja: dlugosc >= 8, `1 <= layerCount <= 9`, per warstwa naglowek+komorki mieszcza sie w buforze, w/h > 0; inaczej `Error('Not a valid .xp file')`. Nazwy warstw: `layer 1..N` (format .xp nie przechowuje nazw). Kolory: first-wins globalnie.
  - `exportXp(level): Promise<Uint8Array>`, `importXp(gzipped): Promise<{layers, colors}>` - gzip bez zmian

- [ ] **Step 1: Przepisz `tests/rexpaint.test.ts`**

```ts
// tests/rexpaint.test.ts
import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { buildXpBytes, parseXpBytes } from '../src/export/rexpaint';

function level1(lines: string[], color?: string) {
  const lv = createLevel();
  lv.layers[0]!.grid = Grid.fromLines(lines);
  if (color) lv.legend.upsert(lines.join('').trim()[0]!, { color });
  lv.legend.syncWith(lv.layers[0]!.grid.usedChars());
  return lv;
}

describe('rexpaint xp', () => {
  it('roundtrip 2 warstwy: siatki, wspolne wymiary, kolory', () => {
    const lv = level1(['#@', ' .'], '#ff0000');
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 1, 1)));
    lv.legend.syncWith(['~']);
    const back = parseXpBytes(buildXpBytes(lv));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('layer 1');
    expect(back.layers[0]!.grid.toLines()).toEqual(['#@', ' .']);
    expect(back.layers[1]!.grid.get(1, 1)).toBe('~');
    expect(back.colors.get('#')).toBe('#ff0000');
  });

  it('layout binarny: naglowek i layerCount', () => {
    const lv = level1(['#']);
    lv.layers.push(makeLayer('b', Grid.fromLines(['@'])));
    const bytes = buildXpBytes(lv);
    const v = new DataView(bytes.buffer);
    expect(v.getInt32(0, true)).toBe(-1);              // version
    expect(v.getInt32(4, true)).toBe(2);               // layers
    expect(v.getInt32(8, true)).toBe(1);               // w warstwy 1
    expect(v.getInt32(12, true)).toBe(1);              // h warstwy 1
    expect(v.getInt32(16, true)).toBe('#'.charCodeAt(0));
    expect(v.getInt32(26, true)).toBe(1);              // w warstwy 2 (offset 16+10)
    expect(bytes.byteLength).toBe(8 + 2 * (8 + 10));
  });

  it('gzip roundtrip przez node zlib', () => {
    const lv = level1(['#']);
    const back = parseXpBytes(new Uint8Array(gunzipSync(gzipSync(buildXpBytes(lv)))));
    expect(back.layers[0]!.grid.toLines()).toEqual(['#']);
  });

  it('odrzuca uszkodzone pliki', () => {
    expect(() => parseXpBytes(new Uint8Array(4))).toThrow('Not a valid .xp file');
    const bad = new Uint8Array(8 + 8);
    const v = new DataView(bad.buffer);
    v.setInt32(0, -1, true); v.setInt32(4, 99, true);  // absurdalny layerCount
    expect(() => parseXpBytes(bad)).toThrow('Not a valid .xp file');
    const trunc = new Uint8Array(8 + 8);
    const v2 = new DataView(trunc.buffer);
    v2.setInt32(0, -1, true); v2.setInt32(4, 1, true);
    v2.setInt32(8, 1000, true); v2.setInt32(12, 1000, true); // deklaruje wiecej niz bufor
    expect(() => parseXpBytes(trunc)).toThrow('Not a valid .xp file');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/rexpaint.test.ts`

- [ ] **Step 3: Implementacja - przepisz `src/export/rexpaint.ts`**

```ts
// Format REXPaint .xp: gzip nad binarnym layoutem
// int32 version(-1), int32 layerCount, per warstwa: int32 w, int32 h,
// komorki KOLUMNAMI: int32 charCode, u8 fg RGB, u8 bg RGB.
// Pusta komorka: znak 32 + bg magenta (255,0,255) = przezroczystosc.
// Warstwa 0 = najnizsza (kolejnosc jak w REXPaint).
import { Grid } from '../core/grid';
import { Level, unionBounds } from '../core/level';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildXpBytes(level: Level): Uint8Array {
  const b = unionBounds(level.layers);
  const w = b ? b.maxX - b.minX + 1 : 1;
  const h = b ? b.maxY - b.minY + 1 : 1;
  const count = Math.max(1, level.layers.length);
  const out = new Uint8Array(8 + count * (8 + w * h * 10));
  const v = new DataView(out.buffer);
  v.setInt32(0, -1, true);
  v.setInt32(4, count, true);
  let p = 8;
  for (let li = 0; li < count; li++) {
    const grid = level.layers[li]?.grid ?? new Grid();
    v.setInt32(p, w, true);
    v.setInt32(p + 4, h, true);
    p += 8;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const ch = b ? grid.get(b.minX + x, b.minY + y) : null;
        const [fr, fg2, fb] = ch ? hexToRgb(level.legend.get(ch)?.color ?? '#ffffff') : [0, 0, 0];
        const [br, bg2, bb] = ch ? [0, 0, 0] : [255, 0, 255];
        v.setInt32(p, ch ? ch.charCodeAt(0) : 32, true);
        out[p + 4] = fr; out[p + 5] = fg2; out[p + 6] = fb;
        out[p + 7] = br; out[p + 8] = bg2; out[p + 9] = bb;
        p += 10;
      }
    }
  }
  return out;
}

export function parseXpBytes(bytes: Uint8Array): { layers: { name: string; grid: Grid }[]; colors: Map<string, string> } {
  // walidacja przed alokacja: uszkodzony plik moze deklarowac miliardy komorek i zawiesic karte
  if (bytes.byteLength < 8) throw new Error('Not a valid .xp file');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getInt32(4, true);
  if (count < 1 || count > 9) throw new Error('Not a valid .xp file');
  const layers: { name: string; grid: Grid }[] = [];
  const colors = new Map<string, string>();
  let p = 8;
  for (let li = 0; li < count; li++) {
    if (p + 8 > bytes.byteLength) throw new Error('Not a valid .xp file');
    const w = v.getInt32(p, true);
    const h = v.getInt32(p + 4, true);
    p += 8;
    if (w <= 0 || h <= 0) throw new Error('Not a valid .xp file');
    if (p + w * h * 10 > bytes.byteLength) throw new Error('Not a valid .xp file');
    const grid = new Grid();
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const code = v.getInt32(p, true);
        const isTransparent = bytes[p + 7] === 255 && bytes[p + 8] === 0 && bytes[p + 9] === 255;
        if (code !== 32 || !isTransparent) {
          const ch = String.fromCharCode(code);
          if (ch !== ' ') {
            grid.set(x, y, ch);
            const hex = '#' + [bytes[p + 4], bytes[p + 5], bytes[p + 6]]
              .map((c) => c.toString(16).padStart(2, '0')).join('');
            if (!colors.has(ch)) colors.set(ch, hex);
          }
        }
        p += 10;
      }
    }
    layers.push({ name: `layer ${li + 1}`, grid });
  }
  return { layers, colors };
}

export async function exportXp(level: Level): Promise<Uint8Array> {
  const bytes = buildXpBytes(level);
  const stream = new Blob([bytes.slice()]).stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function importXp(gzipped: Uint8Array): Promise<{ layers: { name: string; grid: Grid }[]; colors: Map<string, string> }> {
  const stream = new Blob([gzipped.slice()]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return parseXpBytes(new Uint8Array(await new Response(stream).arrayBuffer()));
}
```

- [ ] **Step 4: PASS.** `npm test` + tsc-check jak w Task 2 Step 4

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Support multiple layers in REXPaint xp format"`

---

### Task 7: Stan + renderer na Level (src/app.ts, src/ui/renderer.ts, src/ui/panels.ts - tylko typ stanu)

**Files:**
- Modify: `src/ui/panels.ts` (interfejs `PanelsState` + wszystkie odwolania do `state.grid`/`state.legend`), `src/app.ts`, `src/ui/renderer.ts`

**Interfaces:**
- Produces:
  - `PanelsState { level: Level; activeLayer: number; view: View; brush: string }` (w panels.ts; app.ts importuje type-only jak dotad)
  - helper w panels.ts lub level.ts: `activeGrid(state)` => `state.level.layers[state.activeLayer]!.grid` (jesli wygodniej - inline; bez duplikowania logiki w wielu miejscach: JEDEN helper)
  - `Renderer.draw(level: Level, view: View)` - rysuje `flattenLayers(level.layers)`; papier = `unionBounds(level.layers)` + 1 padding lub domyslny prostokat (0,0)-(23,15); hover/eraseHover bez zmian
  - `paperRect(level: Level): Bounds` (dostosowanie istniejacej funkcji)
  - app.ts: `state.level = createLevel()`; paint/erase pisza do `activeGrid`; `legend.syncWith(levelUsedChars(state.level))` z dotychczasowym guardem na brush; restore z localStorage przez `parseProject` -> Level (guard: string musi zaczynac sie od '{' i po parsowaniu miec `app === 'ascii-level-editor'` - inaczej ignoruj zapis); autosave odlozony do Taska 8 (chwilowo moze nie kompilowac panels - patrz nizej)

**Kolejnosc pracy (wazne):** panels.ts dotknij w tym tasku TYLKO na tyle, zeby typy sie spinaly (PanelsState, activeGrid, podmiana `state.grid` -> `activeGrid(state)` i `state.legend` -> `state.level.legend`, wywolania eksporterow na `state.level`, import/generate/clear per specyfikacja z Taska 8 moga na razie zostac w wersji "dziala jak dotad na aktywnej warstwie"). Pelna funkcjonalnosc warstw w UI to Task 8. Po tym tasku `npm run build` MUSI byc zielony (koniec przejsciowego stanu z Taskow 2-6).

- [ ] **Step 1: Renderer** - w `src/ui/renderer.ts`: zmien sygnatury `paperRect` i `draw` na `Level`; w draw: `const flat = flattenLayers(level.layers);` i dotychczasowa petla po `flat.cells()` z kolorami z `level.legend`; union bounds zamiast `grid.bounds()` w paperRect. Reszta (siatka, hover, resize, screenToCell, centerView) bez zmian.

- [ ] **Step 2: app.ts** - stan wg Interfaces; `centerOnPaper` bez zmian logicznych (paperRect przyjmuje level). Restore: guard jak wyzej, `state.level = parseProject(saved)`, `state.activeLayer = 0`.

- [ ] **Step 3: panels.ts** - minimalna adaptacja typow (jak w "Kolejnosc pracy").

- [ ] **Step 4: Weryfikacja.** `npm run build` zielony; `npm test` zielony; `npm run dev` + szybki smoke (malowanie, pan, zoom, generate, eksporty TXT dzialaja jak w v2.0 - wciaz jedna warstwa "main").

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Move editor state and renderer to layered level model"`

---

### Task 8: Karta Layers + pelna integracja UI (src/ui/panels.ts, src/styles.css, index.html)

**Files:**
- Modify: `src/ui/panels.ts`, `src/styles.css`, `index.html` (nowa sekcja `<details>` "Layers" MIEDZY Draw a Legend, z `#panel-layers`)

**Zachowanie (specyfikacja - kod UI bez testow jednostkowych, logika juz przetestowana w Taskach 1-6):**

- **Karta Layers:** wiersz per warstwa, od GORY listy = najwyzsza warstwa (odwrotnie niz w tablicy - jak w Tiled). W wierszu: przycisk oka (toggle visible; przekreslone/wyszarzone gdy ukryta), input nazwy (inline), strzalki gora/dol (reorder), przycisk usun (czerwony X; `confirm()` gdy warstwa niepusta; ostatniej warstwy nie mozna usunac - przycisk disabled). Klik w wiersz = aktywna warstwa (podswietlenie niebieskie jak aktywny chip). Przycisk "Add layer" (niebieski, disabled przy MAX_LAYERS): nowa warstwa "layer N" NAD aktywna, staje sie aktywna.
- **Malowanie/gumka/Clear/Generate:** dzialaja na aktywnej warstwie. Clear: label "Clear layer", confirm `Clear layer "<name>"?`, czysci tylko aktywna warstwe (legenda zostaje). Generate: confirm gdy AKTYWNA warstwa niepusta; zastepuje TYLKO aktywna warstwe.
- **Legend:** liczniki uzyc sumowane po WSZYSTKICH warstwach; syncWith na `levelUsedChars`.
- **Export:** dropdown "Scope" (select, opcje: `Active layer` / `Flattened`) nad przyciskami Copy TXT/Copy CSV; TXT/CSV: `exportTxt(scopeGrid, unionBounds(level.layers) ?? undefined)` gdzie scopeGrid = `activeGrid(state)` albo `flattenLayers(level.layers)`. KaPlay/Godot/TMX/.xp/.json zawsze caly level (nowe sygnatury). Nazwy plikow bez zmian.
- **Import:** `.json`/`.txt` -> `parseProject` -> CALY level zastapiony (activeLayer=0, syncWith levelUsedChars); `.xp` -> `importXp` -> level z warstwami z pliku (nazwy "layer N", wspolna swieza legenda + kolory z pliku przez upsert, syncWith). Toast: "Imported N cells" liczy komorki wszystkich warstw. Bledy jak dotad (czerwony toast).
- **Autosave:** `serializeProject(state.level)` (v3) w dotychczasowym mechanizmie debounce+flush; restore juz w Tasku 7. Kazda operacja na warstwach (add/remove/reorder/rename/visibility/aktywacja NIE - aktywacja to stan sesji) -> `markDirty` + `scheduleSave` + re-render karty.
- **Styl:** wiersze warstw jak wiersze legendy (biale, ramki 2px); aktywny wiersz: tlo `#3b82f6`, bialy tekst. Zadnych gradientow/shadow.

- [ ] **Step 1: Implementacja wg specyfikacji powyzej.**

- [ ] **Step 2: Weryfikacja manualna scenariuszem:**
  1. Add layer, namaluj `#` na main i `~` na layer 2, przelaczaj aktywna - pedzel trafia we wlasciwa warstwe.
  2. Ukryj layer 2 - znaki znikaja z canvasa; Export TMX - obie warstwy w pliku, ukryta z `visible="0"`.
  3. Reorder - kolejnosc nadpisywania na canvasie sie zmienia.
  4. Download .xp, zaimportuj - warstwy i kolory wracaja.
  5. Download .json (v3), odswiez strone - autosave przywraca; zaimportuj plik v2 z wczesniejszej wersji - jedna warstwa main, legenda zachowana.
  6. Clear layer czysci tylko aktywna.
- [ ] **Step 3: Headless smoke (CDP, jak w v2.0):** załaduj dev server, klik Add layer, sprawdz 2 wiersze w #panel-layers, brak bledow konsoli.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add layers panel with per-layer editing and export scope"`

---

### Task 9: Modale - custom confirm, Export modal z Legacy v1, Import modal (user request)

**Files:**
- Create: `src/ui/modal.ts`, `src/export/legacy.ts`
- Modify: `src/ui/panels.ts` (karty Export/Import -> pojedyncze przyciski otwierajace modale; wymiana confirm()), `src/styles.css` (style modali)
- Test: `tests/legacy.test.ts` (TDD dla legacy.ts; modal.ts i panele bez testow jednostkowych - weryfikacja manualna + CDP)

**Interfaces:**
- Produces:
  - `openModal(title: string, body: HTMLElement): { close(): void }` - overlay `rgba(0,0,0,0.5)`, wycentrowana biala karta (ramka 4px czarna, radius 4px, Press Start 2P, max-width ~420px, max-height 80vh ze scrollem), naglowek jak naglowki sekcji (szary pasek + tytul + przycisk X po prawej); zamykanie: X, Esc, klik w overlay; jeden modal glowny na raz
  - `confirmModal(message: string, okLabel?: string): Promise<boolean>` - maly modal potwierdzenia NAD ewentualnym modalem glownym (wyzszy z-index): tekst + rzad przyciskow [Cancel (bialy, ramka 2px)] [OK/okLabel (czerwony .danger)]; resolve(false) przy Esc/overlay/Cancel, resolve(true) przy OK
  - `type LegacyFormat = 'text' | 'array-text' | 'array-array'`
  - `exportLegacy(grid: Grid, format: LegacyFormat, bounds?: Bounds): string` - formaty IDENTYCZNE jak w v1: `text` = linie joinowane `\n` (kazda linia bez trailing spaces); `array-text` = `JSON.stringify(lines, null, '  ')` (linie bez trailing spaces); `array-array` = `JSON.stringify` tablicy tablic znakow, prostokat DOKLADNY (z paddingiem spacjami do bounds - jak v1). Bounds domyslnie wlasne grida.

- [ ] **Step 1: Failing test legacy**

```ts
// tests/legacy.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { exportLegacy } from '../src/export/legacy';

describe('legacy export', () => {
  const g = Grid.fromLines(['#@', '# ']);
  it('text: linie joinowane, bez trailing spaces', () => {
    expect(exportLegacy(g, 'text')).toBe('#@\n#');
  });
  it('array-text: JSON tablicy stringow z wcieciem jak v1', () => {
    expect(exportLegacy(g, 'array-text')).toBe(JSON.stringify(['#@', '#'], null, '  '));
  });
  it('array-array: dokladny prostokat z paddingiem', () => {
    expect(exportLegacy(g, 'array-array')).toBe(JSON.stringify([['#', '@'], ['#', ' ']]));
  });
  it('jawny bounds rozszerza prostokat', () => {
    expect(exportLegacy(g, 'array-array', { minX: 0, minY: 0, maxX: 2, maxY: 0 }))
      .toBe(JSON.stringify([['#', '@', ' ']]));
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/legacy.test.ts`

- [ ] **Step 3: Implementacja legacy.ts**

```ts
// src/export/legacy.ts
// Formaty eksportu z ASCII Map Editor v1: text / array-text / array-array
// (uzywane w modalu Export w sekcji Legacy; parseProject czyta wszystkie trzy)
import { Bounds, Grid } from '../core/grid';

export type LegacyFormat = 'text' | 'array-text' | 'array-array';

export function exportLegacy(grid: Grid, format: LegacyFormat, bounds?: Bounds): string {
  const b = bounds ?? grid.bounds();
  if (!b) return format === 'text' ? '' : '[]';
  const exact = grid.toLines(b);
  if (format === 'array-array') return JSON.stringify(exact.map((l) => [...l]));
  const trimmed = exact.map((l) => l.replace(/ +$/, ''));
  if (format === 'text') return trimmed.join('\n');
  return JSON.stringify(trimmed, null, '  ');
}
```

- [ ] **Step 4: PASS legacy.** `npx vitest run tests/legacy.test.ts`, potem pelny `npm test`.

- [ ] **Step 5: modal.ts + style** - wg Interfaces powyzej. Estetyka v1: bez gradientow/shadow, overlay pol-przezroczysty czarny, karta biala. `confirmModal` zwraca Promise - wymien WSZYSTKIE wywolania `confirm(...)` w panels.ts na `await confirmModal(...)` (funkcje obslugi staja sie async; Clear, Generate-replace, usuwanie warstwy z Taska 8). Esc w modalu nie moze wyciekac do skrotow globalnych (stopPropagation).

- [ ] **Step 6: Przebudowa kart Export/Import na modale:**
  - Karta **Export**: JEDEN przycisk `Export...` (niebieski, full width). Modal "Export" zawiera: (a) rzad Scope (select Active layer / Flattened - przeniesiony z karty, jesli Task 8 juz go tam dodal), (b) przyciski: Copy TXT, Copy CSV, Copy KaPlay, Copy Godot, Download .tmx, Download .xp, Download .json (te same akcje co dotad; copy/download NIE zamyka modalu; toast + pop jak dotad, toast nad modalem), (c) sekcja **Legacy (v1)**: select formatu (Text / Array of strings / Array of arrays), readonly textarea z podgladem (11px, ~120px wysokosci, aktualizowana przy otwarciu modalu i kazdej zmianie formatu/scope; zrodlo: exportLegacy na gridzie wynikajacym ze Scope) + przycisk Copy legacy.
  - Karta **Import**: JEDEN przycisk `Import...` (zielony, full width). Modal "Import" zawiera: (a) przycisk Load file... (dotychczasowy file input .json/.txt/.xp), (b) separator, (c) textarea `Paste map here` (~120px) + przycisk Load (zielony): `parseProject(tekst)` -> ta sama sciezka co import pliku (zastapienie levelu, syncWith, centerowanie, autosave, toast "Imported N cells"); sukces ZAMYKA modal; blad: czerwony toast, modal zostaje.
  - Teksty UI po angielsku. Focus trap nie jest wymagany; wystarczy autofocus pierwszego interaktywnego elementu.

- [ ] **Step 7: Weryfikacja manualna:** otwarcie/zamkniecie obu modali (X/Esc/overlay), confirm przy Clear i Generate (Cancel przerywa), legacy roundtrip: Copy legacy array-array -> Import modal -> paste -> Load -> mapa wraca; import bledny tekst -> czerwony toast, modal otwarty.

- [ ] **Step 8: CDP smoke:** klik Export... otwiera modal, textarea legacy niepusta przy niepustej mapie, Esc zamyka; klik Import... otwiera modal; brak bledow konsoli.

- [ ] **Step 9: Commit.** `git add -A && git commit -m "Add modal dialogs with legacy v1 export and paste import"`

---

### Task 10: Docs + wersja + pakowanie

**Files:**
- Modify: `README.md` (sekcja Layers: model, limit 8, union bounds, mapowanie eksportow; nota ze .xp import nadaje nazwy "layer N"; nota o modalach Export/Import i formatach Legacy v1), `itch-page.md` (feature list + changelog "v2.1: named map layers, layered exports, export/import dialogs with v1 legacy formats"), `package.json` (`"version": "2.1.0"`)

- [ ] **Step 1:** Aktualizacje docs wg powyzszego. Czysty ASCII, bez dlugich myslnikow.
- [ ] **Step 2:** `npm run zip` - swiezy `ascii-level-editor.zip` (index + standalone + LICENSES.md); otworz `dist/standalone.html` headlessem - brak bledow konsoli.
- [ ] **Step 3:** `npm test` + `npm run build` finalnie zielone.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Document layers and bump version to 2.1.0"`

---

## Self-Review (wykonany)

- **Pokrycie specu Etapu A:** model+limit (T1), format v3+kompatybilnosc (T2), union bounds we wszystkich eksportach (T3-6), TMX visible=0 (T5), .xp warstwa 0 = najnizsza + nazwy "layer N" (T6), render flatten + aktywna warstwa + karta Layers + scope dropdown + autosave v3 + restore guard (T7-8), docs+wersja (T9). Generatory celowo bez zmian sygnatur (dzialaja na Grid aktywnej warstwy).
- **Placeholdery:** brak; T7-8 to specyfikacje zachowania UI wg konwencji planu v2.0 (logika przetestowana w T1-6).
- **Spojnosc typow:** `Level {layers, legend: Legend}` wszedzie; eksportery `(level)`, text `(grid, bounds?)`; `parseProject(): Level`; `toLines(bounds?)` zdefiniowane w T1, uzywane w T3-6. Przejsciowa niekompilacja src/ui w T2-6 jawnie obsluzona (tsc-check z filtrem) i zamknieta w T7.
