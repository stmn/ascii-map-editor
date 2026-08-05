# ASCII Level Editor

Paint a level with plain ASCII characters, name and color them in a legend, then export
the result straight into your engine: KaPlay, Tiled, Godot or REXPaint.

It is a single static page: no backend, no accounts, no network calls. Everything runs in
the browser, the current map is autosaved to `localStorage`, and the build also ships as a
one-file `standalone.html` that works offline from `file://`.

This is v2 of the original [ASCII Map Editor](https://stmn.itch.io/ascii-map-editor): a full
rewrite in TypeScript that keeps the look and feel of v1 and reads all of its map formats.

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm test         # Vitest, 27 tests, no DOM needed
npm run build    # type check + production build into dist/
npm run zip      # build + standalone.html + ascii-level-editor.zip (itch.io upload)
```

`npm run zip` produces `ascii-level-editor.zip` in the repo root. The archive is the
itch.io-ready HTML project (`index.html` as the entry point) and it also contains
`standalone.html`, the offline single-file version.

## Using the editor

- Left click or drag on the paper to paint the current brush character.
- Alt, Ctrl or Cmd while dragging erases.
- Middle or right mouse button drag pans, the mouse wheel zooms towards the cursor,
  arrow keys pan too.
- Press any character key to make it the brush, or pick one of the recent chips.
- The Legend panel lists every character used on the map with an editable name and color
  plus a usage count. Names go into the exports, colors go into the canvas and into `.xp`.
- Generate builds a maze (recursive backtracker, with `S` and `E` placed) or a room and
  corridor dungeon, replacing the current map.
- Export copies a snippet to the clipboard or downloads a file.
- Import accepts `.json`, `.txt` and REXPaint `.xp`.

## Architecture

The rule is simple: everything that can be tested without a DOM lives outside `src/ui`.

```
src/
  app.ts            entry point: state, render loop, wiring of renderer/input/panels
  styles.css        v1 look: cream paper on a brown desk, Press Start 2P
  assets/           font, cursor sprites, pop sound (imported through Vite)
  core/             pure model, no DOM
    grid.ts         sparse Map "x,y" -> char, bounds, fromLines/toLines
    legend.ts       char -> {name, color}, auto names and palette
    project.ts      v2 JSON serialize plus a tolerant parser for v1 and foreign formats
    generators.ts   seeded RNG (mulberry32), maze and dungeon generators
  export/           pure functions Grid + Legend -> string or bytes
    text.ts         TXT and CSV
    kaplay.ts       addLevel(...) snippet
    godot.ts        GDScript snippet for TileMapLayer
    tiled.ts        TMX with a CSV layer
    rexpaint.ts     .xp binary layout plus gzip, both write and read
  ui/               thin DOM layer
    renderer.ts     canvas drawing, view maths (pan, zoom, centring)
    input.ts        pointer, wheel and keyboard gestures, Bresenham stroke interpolation
    panels.ts       sidebar: brush, legend, generators, export, import, autosave, toasts
tests/              Vitest specs for core/ and export/ only
scripts/
  build-standalone.mjs   inlines dist/ into a single offline HTML file
```

`panels.ts` never imports `app.ts`. It receives the state and callbacks through
`initPanels(ctx)`, so the import graph stays acyclic.

There are no runtime dependencies. The dev dependencies are TypeScript, Vite and Vitest,
and `scripts/build-standalone.mjs` is plain Node with no packages at all.

## Formats

| Export | Output | Notes |
| --- | --- | --- |
| TXT | clipboard | the map as plain lines, trailing blank space trimmed to the bounding box |
| CSV | clipboard | one character per cell, commas escaped |
| KaPlay | clipboard | ready to paste `addLevel([...], { tiles: {...} })` |
| Godot | clipboard | GDScript with `LEVEL`, `TILES` and a `load_level(tile_map)` helper |
| Tiled | `map.tmx` | orthogonal map, one CSV encoded layer, legend exported as tile properties |
| REXPaint | `map.xp` | gzipped `.xp`, one layer, legend colors as foreground |
| Project | `project.json` | map plus legend, the format to re-import later |

Specifications and API docs:

- Tiled TMX: <https://doc.mapeditor.org/en/stable/reference/tmx-map-format/>
- REXPaint `.xp`: <https://www.gridsagegames.com/rexpaint/resources.html> and the format
  notes in <https://www.gridsagegames.com/rexpaint/manual.txt>
- KaPlay `addLevel`: <https://kaplayjs.com/doc/ctx/addLevel/>
- Godot `TileMapLayer`: <https://docs.godotengine.org/en/stable/classes/class_tilemaplayer.html>

### KaPlay

```js
addLevel([
  "####",
  "#@.#",
  "####",
], {
  tileWidth: 16,
  tileHeight: 16,
  tiles: {
    "#": () => [sprite("wall")],
    ".": () => [sprite("floor")],
    "@": () => [sprite("player")],
  },
});
```

Legend names become sprite names, so name your legend entries after the sprites you
loaded with `loadSprite`.

### Godot 4

```gdscript
const LEVEL = [
	"####",
	"#@.#",
	"####",
]

const TILES = {
	"#": Vector2i(0, 0), # wall
	".": Vector2i(1, 0), # floor
	"@": Vector2i(2, 0), # player
}

func load_level(tile_map: TileMapLayer, source_id: int = 0) -> void:
	for y in LEVEL.size():
		for x in LEVEL[y].length():
			var ch := LEVEL[y][x]
			if TILES.has(ch):
				tile_map.set_cell(Vector2i(x, y), source_id, TILES[ch])
```

The atlas coordinates assume your tiles sit in a single row of the TileSet atlas in legend
order. Reorder the `TILES` dictionary if your atlas is laid out differently.

### Tiled

The `.tmx` file references a placeholder `tileset.png` sized `16 * tileCount` by `16`.
Point the tileset at your real image inside Tiled, or swap the `<image source="...">` line
before opening it. Each tile carries `name` and `char` properties taken from the legend, so
the original characters survive the round trip.

### REXPaint

`.xp` is a gzipped binary: version, layer count, then per layer width, height and cells in
column-major order, each cell being a 32 bit character code plus RGB foreground and RGB
background. Empty cells are written as space with a magenta background (255, 0, 255), which
is REXPaint's transparency convention. Import reads the same layout back, including
per-character colors, which land in the legend.

## Verification status

Being explicit about what has actually been checked:

- 27 Vitest specs cover the grid, legend, project import, generators and every exporter.
- TMX output is checked for XML well-formedness with `xmllint --noout`. It has not been
  opened in Tiled itself, and the tileset image is a placeholder by design.
- `.xp` output is verified by a structural round trip: the binary layout is asserted byte by
  byte, and gzip compatibility is checked against Node's `zlib`. REXPaint itself was not
  used to open the file.
- The KaPlay and Godot snippets are asserted as text. They have not been executed inside a
  running game.
- The production build was loaded from a subdirectory (the way itch.io serves HTML games)
  and `standalone.html` was loaded from `file://`, both rendering with no console errors.

## Packaging

`vite.config.ts` sets `base: './'`. itch.io serves HTML games from a subpath such as
`html-classic.itch.zone/html/<id>/index.html`, so absolute asset URLs would 404 there.
Relative URLs work on itch.io, on any subdirectory and from `file://`.

All four static assets live in `src/assets/` and are pulled in through the module graph
(CSS `url()` and an `import` for the sound), so Vite hashes and rewrites them. Small files,
like the two cursors, get inlined as data URIs automatically.

`scripts/build-standalone.mjs` then produces `dist/standalone.html`: the JS is inlined as an
inline `<script type="module">` (an inline module runs from `file://`, an external one is
blocked), the CSS goes into a `<style>` block and the font, cursors and sound become base64
`data:` URIs. The result is a single roughly 250 kB file you can double click.

See `itch-page.md` for the store page copy and the upload checklist.

## Importing maps from v1

The import panel is deliberately forgiving, because v1 saved maps in more than one shape
over the years. `parseProject` accepts:

- v2 project JSON (`{ app, version, origin, lines, legend }`)
- a bare array of strings
- an array of arrays of characters (multi character cells fall back to the first character)
- objects with a `map`, `data`, `rows` or `lines` array
- `{ tiles: "line\nline" }`
- `{ cells: [{ x, y, ch }] }`, also accepting `c` or `char` as the key
- raw text with newline separated rows

Anything else raises "Unrecognized map format" instead of silently producing an empty map.
Legend names and colors are only present in v2 files. For older formats the legend is
rebuilt from the characters found on the map, using the default names and palette.

## Credits

- Original ASCII Map Editor by stmn, MIT licensed:
  <https://github.com/stmn/ascii-map-editor>. v2 is a rewrite that reuses its visual style
  and its assets.
- Font: Press Start 2P by CodeMan38, SIL Open Font License:
  <https://fonts.google.com/specimen/Press+Start+2P>.
- Cursor sprites and `pop.wav` come from the original v1 repository.
