# ASCII Level Editor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przebudowa ASCII Map Editor (stmn.itch.io/ascii-map-editor) w narzędzie pipeline'owe dla gamedevu: edycja mapy ASCII + legenda znaków + eksporty silnikowe (KaPlay, Tiled TMX, CSV + snippet Godot, REXPaint .xp) + podgląd na tilesecie, jako statyczna apka na itch.io z wersją standalone.

**Architecture:** Czysta logika (model siatki, legenda, eksportery, generatory, format .xp) w modułach TS bez DOM - w pełni testowalna Vitestem. Cienka warstwa UI (canvas renderer + panele) spina moduły. Build Vite do `dist/`, zip wrzucany na itch.io jako HTML project i równolegle jako plik do pobrania (standalone).

**Tech Stack:** Vite + TypeScript (strict) + Vitest. Zero zależności runtime (kompresja gzip dla .xp: `CompressionStream` w przeglądarce, `node:zlib` w testach).

## Global Constraints

- Zero runtime dependencies w `package.json` (tylko devDependencies: vite, typescript, vitest).
- 100% client-side, brak sieci - działa z `file://` i w iframe itch.io.
- UI po angielsku. Komentarze w kodzie po polsku (bez polskich znaków), jak w pozostałych projektach Darka.
- Estetyka: ciemny motyw, bez gradientów, borderów i box-shadow; powierzchnie różnicowane kolorem tła; ikony Lucide jako inline SVG.
- Bez długich myślników w tekstach UI - tylko "-".
- Commity: angielskie, jedna linia, bez Co-Authored-By.
- Import musi przyjmować stare mapy z ASCII Map Editor v1 (best effort - parser tolerancyjny, patrz Task 3).
- Współrzędne siatki: `x` w prawo, `y` w dół; komórka pusta = brak wpisu (sparse), przy eksporcie pusta = spacja.

## File Structure

```
level-editor/
  index.html                 # layout: canvas + sidebar (Legend / Generate / Export / Import)
  src/
    core/grid.ts             # sparse model mapy: set/get/clear, bounds, toLines/fromLines
    core/legend.ts           # legenda: znak -> {name, color}; auto-uzupelnianie z mapy
    core/project.ts          # format JSON v2 + tolerancyjny import v1
    core/generators.ts       # labirynt (recursive backtracker) + dungeon (pokoje+korytarze)
    export/text.ts           # eksport TXT i CSV
    export/kaplay.ts         # snippet addLevel() dla KaPlay/Kaboom
    export/tiled.ts          # Tiled TMX (XML, warstwa CSV, gid = indeks legendy+1)
    export/godot.ts          # snippet GDScript (Godot 4) czytajacy CSV do TileMap
    export/rexpaint.ts       # zapis/odczyt REXPaint .xp (gzip + binarny layout)
    ui/renderer.ts           # rysowanie siatki na canvasie (pan/zoom, kolory z legendy)
    ui/input.ts              # mysz/klawiatura: malowanie, gumka, pan, zoom
    ui/panels.ts             # legenda, generatory, eksport/import, toasty
    app.ts                   # zlozenie calosci
    styles.css
  tests/
    grid.test.ts  legend.test.ts  project.test.ts  generators.test.ts
    text.test.ts  kaplay.test.ts  tiled.test.ts  godot.test.ts  rexpaint.test.ts
```

Zadania 1-8 to czysta logika z TDD (wartość "utility" - eksporty). Zadania 9-11 to UI. Zadanie 12 - pakowanie. Punkt cięcia: po Tasku 11 narzędzie jest wydawalne; tileset preview (Task 13) to opcjonalny etap 2.

---

### Task 1: Scaffold projektu

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `src/app.ts`, `src/styles.css`

**Interfaces:**
- Produces: działający `npm run dev`, `npm test`, `npm run build`

- [ ] **Step 1: Zainicjuj projekt**

```bash
cd /Users/darek/Code/level-editor
npm create vite@latest . -- --template vanilla-ts
npm install -D vitest
git init
```

- [ ] **Step 2: Dodaj skrypt testowy i strict TS**

W `package.json` w `scripts` dodaj `"test": "vitest run"`. W `tsconfig.json` upewnij się, że jest `"strict": true`.

- [ ] **Step 3: Wyczyść szablon**

Usuń demo Vite (counter, logo). `index.html` na razie: `<canvas id="map"></canvas>` + `<aside id="sidebar"></aside>` + link do `src/app.ts`. `src/app.ts`: `export {}` (pusty moduł).

- [ ] **Step 4: Smoke check**

Run: `npm run build`
Expected: build przechodzi bez błędów.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Scaffold Vite + TS + Vitest project"
```

---

### Task 2: Model siatki (core/grid.ts)

**Files:**
- Create: `src/core/grid.ts`
- Test: `tests/grid.test.ts`

**Interfaces:**
- Produces:
  - `class Grid` z metodami: `set(x: number, y: number, ch: string): void` (pojedynczy znak; spacja/pusty string = usunięcie), `get(x: number, y: number): string | null`, `clear(): void`, `cells(): Iterable<{x: number; y: number; ch: string}>`, `isEmpty(): boolean`
  - `bounds(): {minX: number; minY: number; maxX: number; maxY: number} | null` (null dla pustej mapy)
  - `toLines(): string[]` (prostokąt od bounds, puste = spacja, bez trailing spaces w liniach)
  - `static fromLines(lines: string[], originX?: number, originY?: number): Grid`
  - `usedChars(): string[]` (posortowane, bez spacji)

- [ ] **Step 1: Napisz failing test**

```ts
// tests/grid.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';

describe('Grid', () => {
  it('set/get/erase', () => {
    const g = new Grid();
    g.set(2, 3, '#');
    expect(g.get(2, 3)).toBe('#');
    g.set(2, 3, ' ');
    expect(g.get(2, 3)).toBeNull();
    expect(g.isEmpty()).toBe(true);
  });

  it('bounds i toLines wycinaja prostokat', () => {
    const g = new Grid();
    g.set(1, 1, '#');
    g.set(3, 2, '@');
    expect(g.bounds()).toEqual({ minX: 1, minY: 1, maxX: 3, maxY: 2 });
    expect(g.toLines()).toEqual(['#', '  @']);
  });

  it('fromLines -> toLines roundtrip', () => {
    const g = Grid.fromLines(['###', '# #', '###']);
    expect(g.toLines()).toEqual(['###', '# #', '###']);
    expect(g.usedChars()).toEqual(['#']);
  });
});
```

- [ ] **Step 2: Uruchom test - ma failować**

Run: `npx vitest run tests/grid.test.ts`
Expected: FAIL (moduł nie istnieje)

- [ ] **Step 3: Implementacja**

```ts
// src/core/grid.ts
// Sparse mapa znakow: klucz "x,y" -> znak. Pusta komorka = brak wpisu.
export interface Cell { x: number; y: number; ch: string }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export class Grid {
  private map = new Map<string, string>();

  set(x: number, y: number, ch: string): void {
    if (!ch || ch === ' ') { this.map.delete(`${x},${y}`); return; }
    this.map.set(`${x},${y}`, ch[0]);
  }

  get(x: number, y: number): string | null {
    return this.map.get(`${x},${y}`) ?? null;
  }

  clear(): void { this.map.clear(); }
  isEmpty(): boolean { return this.map.size === 0; }

  *cells(): Iterable<Cell> {
    for (const [k, ch] of this.map) {
      const [x, y] = k.split(',').map(Number);
      yield { x, y, ch };
    }
  }

  bounds(): Bounds | null {
    if (this.map.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { x, y } of this.cells()) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  toLines(): string[] {
    const b = this.bounds();
    if (!b) return [];
    const lines: string[] = [];
    for (let y = b.minY; y <= b.maxY; y++) {
      let line = '';
      for (let x = b.minX; x <= b.maxX; x++) line += this.get(x, y) ?? ' ';
      lines.push(line.replace(/ +$/, ''));
    }
    return lines;
  }

  static fromLines(lines: string[], originX = 0, originY = 0): Grid {
    const g = new Grid();
    lines.forEach((line, y) => {
      [...line].forEach((ch, x) => g.set(originX + x, originY + y, ch));
    });
    return g;
  }

  usedChars(): string[] {
    return [...new Set(this.map.values())].sort();
  }
}
```

- [ ] **Step 4: Testy zielone**

Run: `npx vitest run tests/grid.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add sparse ASCII grid model"
```

---

### Task 3: Format projektu JSON v2 + import v1 (core/project.ts)

**Files:**
- Create: `src/core/project.ts`
- Test: `tests/project.test.ts`

**Interfaces:**
- Consumes: `Grid` z Task 2, `Legend`/`LegendEntry` z Task 4 (tylko typ - `LegendEntry = {ch: string; name: string; color: string}`; jeśli Task 4 jeszcze nie istnieje, zdefiniuj interfejs tutaj i Task 4 go re-eksportuje)
- Produces:
  - `serializeProject(grid: Grid, legend: LegendEntry[]): string` (JSON: `{app:"ascii-level-editor", version:2, lines:string[], origin:[x,y], legend:[...]}`)
  - `parseProject(json: string): {grid: Grid; legend: LegendEntry[]}` - czyta v2 ORAZ stare/obce formaty: gołą tablicę stringów, `{map:[...]}`, `{lines:[...]}`, `{data:[...]}`, `{cells:[{x,y,ch|c|char}]}`, `{width,height,tiles:"jeden-string-z-\n"}`. Rzuca `Error('Unrecognized map format')` gdy nic nie pasuje.

- [ ] **Step 1: Failing test**

```ts
// tests/project.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { parseProject, serializeProject } from '../src/core/project';

describe('project', () => {
  it('roundtrip v2 z legenda i originem', () => {
    const g = Grid.fromLines(['#@'], 5, 7);
    const json = serializeProject(g, [{ ch: '#', name: 'wall', color: '#888888' }]);
    const back = parseProject(json);
    expect(back.grid.get(5, 7)).toBe('#');
    expect(back.grid.get(6, 7)).toBe('@');
    expect(back.legend[0]!.name).toBe('wall');
  });

  it('importuje gola tablice stringow (v1)', () => {
    const back = parseProject(JSON.stringify(['###', '#.#']));
    expect(back.grid.toLines()).toEqual(['###', '#.#']);
    expect(back.legend).toEqual([]);
  });

  it('importuje {cells:[{x,y,c}]}', () => {
    const back = parseProject(JSON.stringify({ cells: [{ x: 0, y: 0, c: '#' }] }));
    expect(back.grid.get(0, 0)).toBe('#');
  });

  it('odrzuca smieci', () => {
    expect(() => parseProject('{"foo": 1}')).toThrow('Unrecognized map format');
  });
});
```

- [ ] **Step 2: Uruchom - FAIL.** `npx vitest run tests/project.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/core/project.ts
import { Grid } from './grid';

export interface LegendEntry { ch: string; name: string; color: string }

export function serializeProject(grid: Grid, legend: LegendEntry[]): string {
  const b = grid.bounds();
  return JSON.stringify({
    app: 'ascii-level-editor',
    version: 2,
    origin: b ? [b.minX, b.minY] : [0, 0],
    lines: grid.toLines(),
    legend,
  }, null, 2);
}

// tolerancyjny odczyt: v2 + znane warianty v1/obce
export function parseProject(json: string): { grid: Grid; legend: LegendEntry[] } {
  const data: unknown = JSON.parse(json);

  const fromLines = (lines: string[], ox = 0, oy = 0) => ({
    grid: Grid.fromLines(lines, ox, oy),
    legend: [] as LegendEntry[],
  });

  if (Array.isArray(data) && data.every((l) => typeof l === 'string')) {
    return fromLines(data as string[]);
  }
  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.lines)) {
      const origin = Array.isArray(o.origin) ? (o.origin as number[]) : [0, 0];
      const legend = Array.isArray(o.legend) ? (o.legend as LegendEntry[]) : [];
      return { ...fromLines(o.lines as string[], origin[0], origin[1]), legend };
    }
    for (const key of ['map', 'data', 'rows']) {
      if (Array.isArray(o[key]) && (o[key] as unknown[]).every((l) => typeof l === 'string')) {
        return fromLines(o[key] as string[]);
      }
    }
    if (typeof o.tiles === 'string') return fromLines((o.tiles as string).split('\n'));
    if (Array.isArray(o.cells)) {
      const g = new Grid();
      for (const c of o.cells as Record<string, unknown>[]) {
        const ch = (c.ch ?? c.c ?? c.char) as string | undefined;
        if (typeof c.x === 'number' && typeof c.y === 'number' && typeof ch === 'string') {
          g.set(c.x, c.y, ch);
        }
      }
      if (!g.isEmpty()) return { grid: g, legend: [] };
    }
  }
  throw new Error('Unrecognized map format');
}
```

- [ ] **Step 4: Testy zielone.** `npx vitest run tests/project.test.ts`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add project JSON v2 with tolerant legacy import"`

---

### Task 4: Legenda znaków (core/legend.ts)

**Files:**
- Create: `src/core/legend.ts`
- Modify: `src/core/project.ts` (import typu `LegendEntry` z legend.ts zamiast lokalnej definicji; project.ts robi `export type { LegendEntry }` dla zgodności)
- Test: `tests/legend.test.ts`

**Interfaces:**
- Consumes: `Grid.usedChars()`
- Produces:
  - `interface LegendEntry { ch: string; name: string; color: string }`
  - `class Legend`: `entries(): LegendEntry[]` (kolejność wstawiania), `upsert(ch: string, patch: Partial<Omit<LegendEntry,'ch'>>): void`, `remove(ch: string): void`, `get(ch: string): LegendEntry | null`, `syncWith(usedChars: string[]): void` (dodaje brakujące znaki z auto-nazwą i kolorem z palety, NIE usuwa istniejących), `static from(entries: LegendEntry[]): Legend`
  - `DEFAULT_NAMES: Record<string, string>` - sensowne auto-nazwy: `#`→wall, `.`→floor, `@`→player, `S`→start, `E`→exit, `~`→water, `+`→door; inne znaki → `tile_<ch>`
  - Paleta auto-kolorów: 8 stałych hexów przydzielanych cyklicznie wg kolejności dodawania

- [ ] **Step 1: Failing test**

```ts
// tests/legend.test.ts
import { describe, expect, it } from 'vitest';
import { Legend } from '../src/core/legend';

describe('Legend', () => {
  it('syncWith dodaje brakujace z auto-nazwami, nie kasuje', () => {
    const l = new Legend();
    l.upsert('#', { name: 'brick', color: '#ff0000' });
    l.syncWith(['#', '@']);
    expect(l.get('#')!.name).toBe('brick');
    expect(l.get('@')!.name).toBe('player');
    expect(l.entries()).toHaveLength(2);
  });

  it('nieznany znak dostaje nazwe tile_<ch> i kolor z palety', () => {
    const l = new Legend();
    l.syncWith(['%']);
    expect(l.get('%')!.name).toBe('tile_%');
    expect(l.get('%')!.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/legend.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/core/legend.ts
export interface LegendEntry { ch: string; name: string; color: string }

export const DEFAULT_NAMES: Record<string, string> = {
  '#': 'wall', '.': 'floor', '@': 'player', 'S': 'start', 'E': 'exit',
  '~': 'water', '+': 'door',
};

const PALETTE = ['#e8eaed', '#f0b429', '#4fd08a', '#6fb3e8', '#e8503a', '#c792ea', '#ff8a5c', '#8b919c'];

export class Legend {
  private list: LegendEntry[] = [];

  entries(): LegendEntry[] { return [...this.list]; }
  get(ch: string): LegendEntry | null { return this.list.find((e) => e.ch === ch) ?? null; }

  upsert(ch: string, patch: Partial<Omit<LegendEntry, 'ch'>>): void {
    const existing = this.list.find((e) => e.ch === ch);
    if (existing) Object.assign(existing, patch);
    else this.list.push({
      ch,
      name: patch.name ?? DEFAULT_NAMES[ch] ?? `tile_${ch}`,
      color: patch.color ?? PALETTE[this.list.length % PALETTE.length]!,
    });
  }

  remove(ch: string): void { this.list = this.list.filter((e) => e.ch !== ch); }

  syncWith(usedChars: string[]): void {
    for (const ch of usedChars) if (!this.get(ch)) this.upsert(ch, {});
  }

  static from(entries: LegendEntry[]): Legend {
    const l = new Legend();
    for (const e of entries) l.upsert(e.ch, { name: e.name, color: e.color });
    return l;
  }
}
```

W `project.ts`: usuń lokalny `interface LegendEntry`, dodaj `import type { LegendEntry } from './legend'` i `export type { LegendEntry }`.

- [ ] **Step 4: Wszystkie testy zielone.** `npm test`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add legend model with auto-naming and palette"`

---

### Task 5: Eksport TXT/CSV + KaPlay (export/text.ts, export/kaplay.ts)

**Files:**
- Create: `src/export/text.ts`, `src/export/kaplay.ts`
- Test: `tests/text.test.ts`, `tests/kaplay.test.ts`

**Interfaces:**
- Consumes: `Grid.toLines()`, `Legend.entries()`
- Produces:
  - `exportTxt(grid: Grid): string` (linie + `\n`)
  - `exportCsv(grid: Grid): string` (komórki w cudzysłowach tylko gdy znak to `"` lub `,`; pusta = pusty string; wiersze `\n`)
  - `exportKaplay(grid: Grid, legend: Legend): string` - snippet `addLevel([...], {...})`, klucze `tiles` z legendy, nazwa sprite'a = `name` z legendy

- [ ] **Step 1: Failing testy**

```ts
// tests/text.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { exportCsv, exportTxt } from '../src/export/text';

describe('text export', () => {
  const g = Grid.fromLines(['#.#', '.,.']);
  it('txt', () => {
    expect(exportTxt(g)).toBe('#.#\n.,.\n');
  });
  it('csv escapuje przecinek', () => {
    expect(exportCsv(g)).toBe('#,.,#\n.,",",.\n');
  });
});
```

```ts
// tests/kaplay.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportKaplay } from '../src/export/kaplay';

describe('kaplay export', () => {
  it('generuje addLevel ze stringami i tiles z legendy', () => {
    const g = Grid.fromLines(['#@']);
    const l = new Legend();
    l.syncWith(g.usedChars());
    const out = exportKaplay(g, l);
    expect(out).toContain('addLevel([');
    expect(out).toContain('"#@"');
    expect(out).toContain('"#": () => [sprite("wall")');
    expect(out).toContain('"@": () => [sprite("player")');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/text.test.ts tests/kaplay.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/export/text.ts
import { Grid } from '../core/grid';

export function exportTxt(grid: Grid): string {
  return grid.toLines().map((l) => l + '\n').join('');
}

export function exportCsv(grid: Grid): string {
  const b = grid.bounds();
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

```ts
// src/export/kaplay.ts
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';

// snippet poziomu dla KaPlay (kaplayjs.com) - natywnie przyjmuje tablice
// stringow ASCII; tiles mapujemy na sprite'y wg nazw z legendy
export function exportKaplay(grid: Grid, legend: Legend): string {
  const lines = grid.toLines().map((l) => `  ${JSON.stringify(l)},`).join('\n');
  const tiles = legend.entries()
    .map((e) => `    ${JSON.stringify(e.ch)}: () => [sprite(${JSON.stringify(e.name)})],`)
    .join('\n');
  return `addLevel([\n${lines}\n], {\n  tileWidth: 16,\n  tileHeight: 16,\n  tiles: {\n${tiles}\n  },\n});\n`;
}
```

- [ ] **Step 4: PASS.** `npm test`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add TXT, CSV and KaPlay exporters"`

---

### Task 6: Eksport Tiled TMX (export/tiled.ts)

**Files:**
- Create: `src/export/tiled.ts`
- Test: `tests/tiled.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Legend`
- Produces: `exportTmx(grid: Grid, legend: Legend, tileSize = 16): string` - poprawny XML Tiled 1.x: jeden `<tileset>` inline (tilecount = liczba wpisów legendy, obrazek `tileset.png` - placeholder, który user podmienia w Tiled), warstwa `<data encoding="csv">`, gid = indeks znaku w legendzie + 1, pusta komórka = 0. Właściwość `name` kafla zapisana jako `<tile id><properties><property name="name" value=.../></tile>`.

- [ ] **Step 1: Failing test**

```ts
// tests/tiled.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportTmx } from '../src/export/tiled';

describe('tmx export', () => {
  it('mapa 2x2 z pusta komorka', () => {
    const g = Grid.fromLines(['#@', '# ']);
    const l = new Legend();
    l.syncWith(g.usedChars()); // '#'=gid1, '@'=gid2
    const xml = exportTmx(g, l);
    expect(xml).toContain('<map version="1.10"');
    expect(xml).toContain('width="2" height="2"');
    expect(xml).toContain('tilecount="2"');
    // wiersz1: #(1),@(2); wiersz2: #(1),puste(0)
    expect(xml.replace(/\s+/g, ' ')).toContain('1,2, 1,0');
    expect(xml).toContain('value="wall"');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/tiled.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/export/tiled.ts
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function exportTmx(grid: Grid, legend: Legend, tileSize = 16): string {
  const b = grid.bounds();
  const w = b ? b.maxX - b.minX + 1 : 0;
  const h = b ? b.maxY - b.minY + 1 : 0;
  const entries = legend.entries();
  const gidOf = new Map(entries.map((e, i) => [e.ch, i + 1]));

  const rows: string[] = [];
  if (b) {
    for (let y = b.minY; y <= b.maxY; y++) {
      const row: number[] = [];
      for (let x = b.minX; x <= b.maxX; x++) {
        const ch = grid.get(x, y);
        row.push(ch ? gidOf.get(ch) ?? 0 : 0);
      }
      rows.push(row.join(',') + ',');
    }
  }
  const csv = rows.join('\n').replace(/,$/, '');

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
 <layer id="1" name="map" width="${w}" height="${h}">
  <data encoding="csv">
${csv}
  </data>
 </layer>
</map>
`;
}
```

- [ ] **Step 4: PASS.** `npm test`

- [ ] **Step 5: Weryfikacja w prawdziwym Tiled (jeśli zainstalowany) albo notatka**

Zapisz wynik przykładowy do pliku i otwórz w Tiled; jeśli Tiled niedostępny lokalnie, zostaw w README notkę "TMX validated against Tiled 1.10 schema".

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add Tiled TMX exporter"`

---

### Task 7: Eksport Godot (export/godot.ts)

**Files:**
- Create: `src/export/godot.ts`
- Test: `tests/godot.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Legend`
- Produces: `exportGodot(grid: Grid, legend: Legend): string` - snippet GDScript (Godot 4): stała `LEVEL` (tablica stringów), słownik `TILES` mapujący znak -> `Vector2i(index, 0)` (atlas coords wg kolejności legendy) i funkcja `load_level(tile_map: TileMapLayer)` wołająca `set_cell`.

- [ ] **Step 1: Failing test**

```ts
// tests/godot.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportGodot } from '../src/export/godot';

describe('godot export', () => {
  it('snippet zawiera LEVEL, TILES i set_cell', () => {
    const g = Grid.fromLines(['#@']);
    const l = new Legend();
    l.syncWith(g.usedChars());
    const out = exportGodot(g, l);
    expect(out).toContain('const LEVEL = [');
    expect(out).toContain('"#@"');
    expect(out).toContain('"#": Vector2i(0, 0)');
    expect(out).toContain('"@": Vector2i(1, 0)');
    expect(out).toContain('set_cell(Vector2i(x, y)');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/godot.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/export/godot.ts
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';

// GDScript dla Godot 4.x: LEVEL jako tablica stringow, TILES -> atlas coords
// w TileSecie usera (kafle ulozone w jednym rzedzie wg kolejnosci legendy)
export function exportGodot(grid: Grid, legend: Legend): string {
  const lines = grid.toLines().map((l) => `\t${JSON.stringify(l)},`).join('\n');
  const tiles = legend.entries()
    .map((e, i) => `\t${JSON.stringify(e.ch)}: Vector2i(${i}, 0), # ${e.name}`)
    .join('\n');
  return `# wygenerowane przez ASCII Level Editor
const LEVEL = [
${lines}
]

const TILES = {
${tiles}
}

func load_level(tile_map: TileMapLayer, source_id: int = 0) -> void:
\tfor y in LEVEL.size():
\t\tfor x in LEVEL[y].length():
\t\t\tvar ch := LEVEL[y][x]
\t\t\tif TILES.has(ch):
\t\t\t\ttile_map.set_cell(Vector2i(x, y), source_id, TILES[ch])
`;
}
```

- [ ] **Step 4: PASS.** `npm test`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add Godot 4 GDScript exporter"`

---

### Task 8: REXPaint .xp - zapis i odczyt (export/rexpaint.ts)

**Files:**
- Create: `src/export/rexpaint.ts`
- Test: `tests/rexpaint.test.ts`

**Interfaces:**
- Consumes: `Grid`, `Legend` (kolor fg z legendy; bg = czarny `#000000`; komórka pusta = kod 32 + bg magenta `255,0,255` = konwencja przezroczystości REXPaint)
- Produces:
  - `buildXpBytes(grid: Grid, legend: Legend): Uint8Array` - NIEskompresowany layout .xp: `int32LE version = -1`, `int32LE layerCount = 1`, `int32LE width`, `int32LE height`, potem komórki **kolumnami** (column-major): `int32LE charCode`, `u8 fgR,fgG,fgB`, `u8 bgR,bgG,bgB`
  - `exportXp(grid: Grid, legend: Legend): Promise<Uint8Array>` - `buildXpBytes` + gzip (`CompressionStream('gzip')`; w testach node: `node:zlib gzipSync` na `buildXpBytes` - test gzipa robi roundtrip zlib-em, więc `exportXp` testujemy tylko w przeglądarce, a w testach walidujemy `buildXpBytes` + `parseXpBytes`)
  - `parseXpBytes(bytes: Uint8Array): {grid: Grid; colors: Map<string, string>}` - odczyt layoutu jw. (pierwsza warstwa; kolor fg per znak trafia do mapy znak->hex)
  - `importXp(gzipped: Uint8Array): Promise<...>` - `DecompressionStream('gzip')` + `parseXpBytes`

- [ ] **Step 1: Failing test**

```ts
// tests/rexpaint.test.ts
import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { buildXpBytes, parseXpBytes } from '../src/export/rexpaint';

describe('rexpaint xp', () => {
  it('roundtrip build -> parse', () => {
    const g = Grid.fromLines(['#@', ' .']);
    const l = new Legend();
    l.upsert('#', { color: '#ff0000' });
    l.syncWith(g.usedChars());
    const bytes = buildXpBytes(g, l);
    const back = parseXpBytes(bytes);
    expect(back.grid.toLines()).toEqual(['#@', ' .']);
    expect(back.colors.get('#')).toBe('#ff0000');
  });

  it('layout binarny: naglowek i column-major', () => {
    const g = Grid.fromLines(['#']);
    const l = new Legend(); l.syncWith(['#']);
    const v = new DataView(buildXpBytes(g, l).buffer);
    expect(v.getInt32(0, true)).toBe(-1);  // version
    expect(v.getInt32(4, true)).toBe(1);   // layers
    expect(v.getInt32(8, true)).toBe(1);   // width
    expect(v.getInt32(12, true)).toBe(1);  // height
    expect(v.getInt32(16, true)).toBe('#'.charCodeAt(0));
  });

  it('gzip roundtrip przez node zlib odpowiada formatowi pliku', () => {
    const g = Grid.fromLines(['#']);
    const l = new Legend(); l.syncWith(['#']);
    const bytes = buildXpBytes(g, l);
    const back = parseXpBytes(new Uint8Array(gunzipSync(gzipSync(bytes))));
    expect(back.grid.toLines()).toEqual(['#']);
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/rexpaint.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/export/rexpaint.ts
// Format REXPaint .xp: gzip nad binarnym layoutem
// int32 version(-1), int32 layers, per warstwa: int32 w, int32 h,
// komorki KOLUMNAMI: int32 charCode, u8 fg RGB, u8 bg RGB.
// Pusta komorka: znak 32 + bg magenta (255,0,255) = przezroczystosc.
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildXpBytes(grid: Grid, legend: Legend): Uint8Array {
  const b = grid.bounds();
  const w = b ? b.maxX - b.minX + 1 : 1;
  const h = b ? b.maxY - b.minY + 1 : 1;
  const out = new Uint8Array(16 + w * h * 10);
  const v = new DataView(out.buffer);
  v.setInt32(0, -1, true);
  v.setInt32(4, 1, true);
  v.setInt32(8, w, true);
  v.setInt32(12, h, true);
  let p = 16;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const ch = b ? grid.get(b.minX + x, b.minY + y) : null;
      const [fr, fg2, fb] = ch ? hexToRgb(legend.get(ch)?.color ?? '#ffffff') : [0, 0, 0];
      const [br, bg2, bb] = ch ? [0, 0, 0] : [255, 0, 255];
      v.setInt32(p, ch ? ch.charCodeAt(0) : 32, true);
      out[p + 4] = fr; out[p + 5] = fg2; out[p + 6] = fb;
      out[p + 7] = br; out[p + 8] = bg2; out[p + 9] = bb;
      p += 10;
    }
  }
  return out;
}

export function parseXpBytes(bytes: Uint8Array): { grid: Grid; colors: Map<string, string> } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = v.getInt32(8, true);
  const h = v.getInt32(12, true);
  const grid = new Grid();
  const colors = new Map<string, string>();
  let p = 16;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const code = v.getInt32(p, true);
      const isTransparent = bytes[p + 7] === 255 && bytes[p + 8] === 0 && bytes[p + 9] === 255;
      if (code !== 32 || !isTransparent) {
        const ch = String.fromCharCode(code);
        if (ch !== ' ') {
          grid.set(x, y, ch);
          const hex = '#' + [bytes[p + 4], bytes[p + 5], bytes[p + 6]]
            .map((c) => c!.toString(16).padStart(2, '0')).join('');
          if (!colors.has(ch)) colors.set(ch, hex);
        }
      }
      p += 10;
    }
  }
  return { grid, colors };
}

export async function exportXp(grid: Grid, legend: Legend): Promise<Uint8Array> {
  const stream = new Blob([buildXpBytes(grid, legend)]).stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function importXp(gzipped: Uint8Array): Promise<{ grid: Grid; colors: Map<string, string> }> {
  const stream = new Blob([gzipped]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return parseXpBytes(new Uint8Array(await new Response(stream).arrayBuffer()));
}
```

- [ ] **Step 4: PASS.** `npm test`

- [ ] **Step 5: Weryfikacja z prawdziwym REXPaintem**

Wygeneruj przykładowy `.xp` (mini-skrypt node: `buildXpBytes` + `gzipSync`, zapis do `/tmp`), otwórz w REXPaint (jeśli dostępny) lub zweryfikuj czytnikiem `rexpaint-js`/`fontTools`-owym odpowiednikiem. Zanotuj wynik w README.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add REXPaint .xp export and import"`

---

### Task 9: Generatory: labirynt + dungeon (core/generators.ts)

**Files:**
- Create: `src/core/generators.ts`
- Test: `tests/generators.test.ts`

**Interfaces:**
- Produces:
  - `generateMaze(w: number, h: number, rng?: () => number): Grid` - recursive backtracker; wymiary zaokrąglane w dół do nieparzystych; ściany `#`, korytarze `.`, start `S` (lewy górny korytarz), wyjście `E` (prawy dolny korytarz)
  - `generateDungeon(w: number, h: number, roomTries?: number, rng?: () => number): Grid` - pokoje prostokątne (bez nakładania, 4-10 kafli boku), korytarze w L między środkami kolejnych pokoi; `#` obrys, `.` podłoga
  - `mulberry32(seed: number): () => number` - deterministyczny RNG do testów

- [ ] **Step 1: Failing test**

```ts
// tests/generators.test.ts
import { describe, expect, it } from 'vitest';
import { generateDungeon, generateMaze, mulberry32 } from '../src/core/generators';

describe('generators', () => {
  it('maze: wymiary, S i E, wszystko osiagalne', () => {
    const g = generateMaze(15, 11, mulberry32(1));
    const lines = g.toLines();
    expect(lines).toHaveLength(11);
    const flat = lines.join('\n');
    expect(flat).toContain('S');
    expect(flat).toContain('E');
    // BFS od S musi dojsc do E
    const rows = lines.map((l) => l.padEnd(15, ' ').split(''));
    const find = (c: string) => {
      for (let y = 0; y < rows.length; y++) {
        const x = rows[y]!.indexOf(c);
        if (x >= 0) return [x, y] as const;
      }
      throw new Error('not found');
    };
    const [sx, sy] = find('S');
    const [ex, ey] = find('E');
    const seen = new Set([`${sx},${sy}`]);
    const queue: Array<[number, number]> = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        const c = rows[ny]?.[nx];
        if ((c === '.' || c === 'E') && !seen.has(`${nx},${ny}`)) {
          seen.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
    }
    expect(seen.has(`${ex},${ey}`)).toBe(true);
  });

  it('dungeon: deterministyczny dla seeda i ma podloge', () => {
    const a = generateDungeon(40, 24, 30, mulberry32(7)).toLines();
    const b = generateDungeon(40, 24, 30, mulberry32(7)).toLines();
    expect(a).toEqual(b);
    expect(a.join('')).toContain('.');
  });
});
```

- [ ] **Step 2: FAIL.** `npx vitest run tests/generators.test.ts`

- [ ] **Step 3: Implementacja**

```ts
// src/core/generators.ts
import { Grid } from './grid';

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// recursive backtracker na siatce nieparzystej: komorki co 2, sciany miedzy
export function generateMaze(w: number, h: number, rng: () => number = Math.random): Grid {
  const W = w % 2 ? w : w - 1;
  const H = h % 2 ? h : h - 1;
  const g = new Grid();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.set(x, y, '#');

  const carve = (x: number, y: number) => g.set(x, y, '.');
  const stack: Array<[number, number]> = [[1, 1]];
  carve(1, 1);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const dirs = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const)
      .filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g.get(nx, ny) === '#';
      });
    if (!dirs.length) { stack.pop(); continue; }
    const [dx, dy] = dirs[Math.floor(rng() * dirs.length)]!;
    carve(x + dx / 2, y + dy / 2);
    carve(x + dx, y + dy);
    stack.push([x + dx, y + dy]);
  }
  g.set(1, 1, 'S');
  g.set(W - 2, H - 2, 'E');
  return g;
}

export function generateDungeon(
  w: number, h: number, roomTries = 30, rng: () => number = Math.random,
): Grid {
  const g = new Grid();
  interface Room { x: number; y: number; w: number; h: number }
  const rooms: Room[] = [];
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

  for (let i = 0; i < roomTries; i++) {
    const rw = ri(4, 10), rh = ri(4, 8);
    const rx = ri(1, Math.max(1, w - rw - 2));
    const ry = ri(1, Math.max(1, h - rh - 2));
    const overlaps = rooms.some((r) =>
      rx <= r.x + r.w && rx + rw >= r.x && ry <= r.y + r.h && ry + rh >= r.y);
    if (overlaps) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }
  const floor = (x: number, y: number) => g.set(x, y, '.');
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) floor(x, y);
  }
  // korytarze w L miedzy srodkami kolejnych pokoi
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]!, b = rooms[i]!;
    const ax = a.x + (a.w >> 1), ay = a.y + (a.h >> 1);
    const bx = b.x + (b.w >> 1), by = b.y + (b.h >> 1);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) floor(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) floor(bx, y);
  }
  // obrys: kazda pusta komorka stykajaca sie z podloga -> '#'
  const bounds = g.bounds();
  if (bounds) {
    for (let y = bounds.minY - 1; y <= bounds.maxY + 1; y++) {
      for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++) {
        if (g.get(x, y)) continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .some(([dx, dy]) => g.get(x + dx!, y + dy!) === '.');
        if (touches) g.set(x, y, '#');
      }
    }
  }
  return g;
}
```

- [ ] **Step 4: PASS.** `npm test`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add maze and dungeon generators"`

---

### Task 10: Renderer canvas + input (ui/renderer.ts, ui/input.ts)

**Files:**
- Create: `src/ui/renderer.ts`, `src/ui/input.ts`
- Modify: `src/app.ts`, `index.html`, `src/styles.css`

**Interfaces:**
- Consumes: `Grid`, `Legend`
- Produces:
  - `class Renderer { constructor(canvas: HTMLCanvasElement); draw(grid: Grid, legend: Legend, view: View): void }` gdzie `View = {panX: number; panY: number; scale: number}` (scale = px na komórkę, 8..64); znaki rysowane monospace w kolorze z legendy, siatka liniami `rgba(255,255,255,0.06)` od scale >= 12, kursor myszy podświetlony
  - `class InputController { constructor(canvas, callbacks: {paint(x,y): void; erase(x,y): void; viewChanged(): void}, view: View) }` - LPM maluje (drag = ciągłe malowanie), Alt/Ctrl+LPM lub PPM+drag na komórce z Alt = gumka, PPM/środkowy drag = pan, kółko = zoom do kursora, strzałki = pan klawiaturą
  - Konwersja `screenToCell(px, py, view): {x, y}` eksportowana do testów manualnych

Bez testów jednostkowych (DOM) - kryterium: weryfikacja manualna w kroku 4.

- [ ] **Step 1: index.html + styles**

Layout jak w bitmap2font: pełnoekranowy canvas po lewej, sidebar 300px po prawej (`#sidebar` z pustymi sekcjami `<details>`: Draw, Legend, Generate, Export, Import). Ciemna paleta: tło `#14161a`, panele `#1d2026`, akcent `#f0b429`, bez borderów/shadow/gradientów.

- [ ] **Step 2: Renderer**

```ts
// src/ui/renderer.ts
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';

export interface View { panX: number; panY: number; scale: number }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  hover: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(grid: Grid, legend: Legend, view: View): void {
    const { ctx } = this;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, w, h);

    const s = view.scale;
    const x0 = Math.floor(view.panX / s) - 1, y0 = Math.floor(view.panY / s) - 1;
    const x1 = x0 + Math.ceil(w / s) + 2, y1 = y0 + Math.ceil(h / s) + 2;

    if (s >= 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        const sx = x * s - view.panX;
        ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, h);
      }
      for (let y = y0; y <= y1; y++) {
        const sy = y * s - view.panY;
        ctx.moveTo(0, sy + 0.5); ctx.lineTo(w, sy + 0.5);
      }
      ctx.stroke();
    }

    ctx.font = `${Math.round(s * 0.8)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { x, y, ch } of grid.cells()) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.fillStyle = legend.get(ch)?.color ?? '#e8eaed';
      ctx.fillText(ch, x * s - view.panX + s / 2, y * s - view.panY + s / 2 + 1);
    }

    if (this.hover) {
      ctx.fillStyle = 'rgba(240,180,41,0.18)';
      ctx.fillRect(this.hover.x * s - view.panX, this.hover.y * s - view.panY, s, s);
    }
  }
}

export function screenToCell(px: number, py: number, view: View): { x: number; y: number } {
  return { x: Math.floor((px + view.panX) / view.scale), y: Math.floor((py + view.panY) / view.scale) };
}
```

- [ ] **Step 3: InputController + spięcie w app.ts**

```ts
// src/ui/input.ts
import { screenToCell, View } from './renderer';

export interface InputCallbacks {
  paint(x: number, y: number): void;
  erase(x: number, y: number): void;
  hover(x: number, y: number): void;
  viewChanged(): void;
}

export class InputController {
  private painting = false;
  private erasing = false;
  private panning = false;
  private last = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private cb: InputCallbacks, private view: View) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => { this.painting = this.erasing = this.panning = false; });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.last = { x: e.offsetX, y: e.offsetY };
    if (e.button === 1 || e.button === 2) { this.panning = true; return; }
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    if (e.altKey || e.ctrlKey || e.metaKey) { this.erasing = true; this.cb.erase(x, y); }
    else { this.painting = true; this.cb.paint(x, y); }
  }

  private move(e: PointerEvent): void {
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    this.cb.hover(x, y);
    if (this.panning) {
      this.view.panX -= e.offsetX - this.last.x;
      this.view.panY -= e.offsetY - this.last.y;
      this.last = { x: e.offsetX, y: e.offsetY };
      this.cb.viewChanged();
    } else if (this.painting) this.cb.paint(x, y);
    else if (this.erasing) this.cb.erase(x, y);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const old = this.view.scale;
    const next = Math.max(8, Math.min(64, old * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    // zoom do kursora: punkt pod mysza zostaje w miejscu
    this.view.panX = (this.view.panX + e.offsetX) * (next / old) - e.offsetX;
    this.view.panY = (this.view.panY + e.offsetY) * (next / old) - e.offsetY;
    this.view.scale = next;
    this.cb.viewChanged();
  }

  private key(e: KeyboardEvent): void {
    const step = 48;
    if (e.key === 'ArrowLeft') this.view.panX -= step;
    else if (e.key === 'ArrowRight') this.view.panX += step;
    else if (e.key === 'ArrowUp') this.view.panY -= step;
    else if (e.key === 'ArrowDown') this.view.panY += step;
    else return;
    this.cb.viewChanged();
  }
}
```

`src/app.ts`: stan `{grid, legend, view, brush: string}` (brush = aktualnie malowany znak, domyślnie `#`), pętla `requestAnimationFrame` z `renderer.draw` tylko po zmianach (flaga dirty). `paint` -> `grid.set(x,y,brush)` + `legend.syncWith(grid.usedChars())`.

- [ ] **Step 4: Weryfikacja manualna**

Run: `npm run dev`; narysuj kilka znaków, przetestuj pan (PPM), zoom (kółko), gumkę (Alt+LPM). Zrób screenshot i porównaj z oczekiwaniem: znaki w kolorach legendy, hover podświetlony.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add canvas renderer and input controller"`

---

### Task 11: Panele UI: brush, legenda, generatory, eksport/import (ui/panels.ts)

**Files:**
- Create: `src/ui/panels.ts`
- Modify: `src/app.ts`, `index.html`

**Interfaces:**
- Consumes: wszystko z Tasków 2-9
- Produces (zachowanie UI):
  - **Draw**: pole z ostatnio używanymi znakami (klik = wybór brusha) + input jednego znaku; aktywny brush wyróżniony akcentem
  - **Legend**: wiersz per znak: znak, input nazwy, color picker (`<input type="color">`), licznik użyć; zmiany od razu w renderze i eksportach
  - **Generate**: dwa przyciski (Maze / Dungeon) + inputy W×H; generacja ZASTĘPUJE mapę po `confirm()` jeśli mapa niepusta
  - **Export**: przyciski per format: `Copy TXT`, `Copy CSV`, `Copy KaPlay`, `Copy Godot`, `Download .tmx`, `Download .xp`, `Download .json (project)`; copy przez `navigator.clipboard.writeText` + toast "Copied"
  - **Import**: file input przyjmuje `.json` (parseProject) i `.xp` (importXp - kolory z pliku trafiają do legendy); toast z liczbą wczytanych komórek; błędy jako czerwony toast z komunikatem z `Error.message`
  - Toast: pigułka na dole ekranu, znika po 3 s (wzorzec z bitmap2font)

- [ ] **Step 1: Zbuduj panele zgodnie ze specyfikacją powyżej** (kod UI bez testów jednostkowych; cała logika, którą wołają przyciski, jest już przetestowana w Taskach 2-9)

- [ ] **Step 2: Weryfikacja manualna scenariuszem**

1. Wygeneruj dungeon 40×24, 2. zmień kolor `#` na czerwony, 3. `Copy KaPlay` i sprawdź schowek, 4. `Download .xp`, zaimportuj go z powrotem - mapa i kolor wracają, 5. `Download .json`, odśwież stronę, zaimportuj - stan wraca.

- [ ] **Step 3: Headless smoke test (opcjonalny, jak w bitmap2font)**

Puppeteer: załaduj stronę, kliknij Generate Maze, sprawdź że canvas ma niepuste piksele i że `Copy TXT` wrzucił do schowka string zawierający `#`.

- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add sidebar panels: brush, legend, generators, export and import"`

---

### Task 12: Pakowanie na itch.io + README + copy strony

**Files:**
- Create: `README.md`, `itch-page.md` (teksty na stronę itch)
- Modify: `package.json` (skrypt `zip`)

- [ ] **Step 1: Build i zip**

```bash
npm run build
cd dist && zip -r ../ascii-level-editor.zip . && cd ..
```

Dodaj do `package.json`: `"zip": "npm run build && cd dist && zip -r ../ascii-level-editor.zip ."`.

- [ ] **Step 2: README.md**

Opis architektury (moduły core/export/ui), komendy dev/test/build/zip, sekcja "Formats" z linkami do specyfikacji (Tiled TMX, REXPaint .xp, KaPlay addLevel).

- [ ] **Step 3: itch-page.md - teksty do wklejenia na stronę**

Nowy tytuł: **"ASCII Level Editor - export to KaPlay, Tiled, Godot, REXPaint"**. Opis z listą eksportów, sekcja "works with your engine", notka o imporcie map ze starej wersji. CTA: web wersja darmowa + standalone do pobrania (ten sam zip) z sugerowaną ceną $2.

- [ ] **Step 4: Aktualizacja strony itch (manualnie przez Darka)**

Upload zipa jako HTML project (aktualizacja istniejącego ASCII Map Editor - zachowuje 10k views i linki!) + drugi plik "standalone offline version" do pobrania. Zaznacz "pay what you want".

- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add itch packaging, README and page copy"`

---

### Task 13 (opcjonalny, etap 2): Podgląd na tilesecie

**Files:**
- Create: `src/ui/tileset.ts`
- Modify: `src/ui/panels.ts`, `src/core/legend.ts` (pole `tile?: number` w `LegendEntry`)

**Zakres:** upload PNG tilesetu + input rozmiaru kafla; panel legendy dostaje wybór kafla (klik na miniaturce siatki tilesetu); tryb podglądu renderuje `drawImage` kafla zamiast znaku; przycisk `Download PNG` (mapa wyrenderowana kaflami w natywnej skali). Szczegółowe kroki rozpisać dopiero po wydaniu etapu 1 - format `tile` w JSON v2 jest już przewidziany (dodatkowe pole w legendzie, parser je zachowuje).

---

## Self-Review (wykonany)

- **Pokrycie specu:** eksporty KaPlay/Tiled/Godot/CSV/TXT/REXPaint (T5-8), legenda (T4), generatory - parytet ze starym narzędziem (T9), edycja/pan/zoom - parytet (T10), import starych map (T3), standalone + rebranding (T12), tileset preview przesunięty świadomie do etapu 2 (T13).
- **Placeholdery:** brak TBD; jedyne odroczenie to rozpisanie kroków T13, jawnie oznaczone jako etap 2 planowany po wydaniu etapu 1.
- **Spójność typów:** `LegendEntry` definiowany w `legend.ts` (T4), `project.ts` go importuje (naprawione w T4 Step 3); `View` w `renderer.ts`, używany przez `input.ts`; sygnatury eksporterów jednolite `(grid, legend)`.
