# ASCII Level Editor

Paint a level with plain ASCII characters across named layers, name and color the tiles in
one shared legend, then export the result straight into your engine: KaPlay, Tiled, Godot or
REXPaint.

It is a single static page: no backend, no accounts, no network calls. Everything runs in
the browser, the current level is autosaved to `localStorage`, and the build also ships as a
one-file `standalone.html` that works offline from `file://`.

This is v2 of the original [ASCII Map Editor](https://stmn.itch.io/ascii-map-editor): a full
rewrite in TypeScript that keeps the look and feel of v1 and reads all of its map formats.

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm test         # the full Vitest suite, no DOM needed
npm run build    # type check + production build into dist/
npm run zip      # build + standalone.html + ascii-level-editor.zip (itch.io upload)
```

`npm run zip` produces `ascii-level-editor.zip` in the repo root. The archive is the
itch.io-ready HTML project (`index.html` as the entry point) and it also contains
`standalone.html`, the offline single-file version, plus `LICENSES.md`.

## Using the editor

- Left click or drag on the paper to paint the current brush character.
- Alt, Ctrl or Cmd while dragging erases.
- Middle or right mouse button drag pans, the mouse wheel zooms towards the cursor,
  arrow keys pan too.
- Press any character key to make it the brush, or pick one of the recent chips.
- The Layers panel lists every layer top to bottom (top of the list is the top of the
  stack, same as Tiled). Click a row to make it the active layer: painting, erasing,
  generating and Clear layer all act on it. Each row also has visibility, reorder and
  delete controls, and Add layer appends a new one, up to 8 per level.
- The Legend panel lists every character used anywhere in the level, shared by all layers,
  with an editable name and color plus a usage count. Names go into the exports, colors go
  into the canvas and into `.xp`.
- Generate builds a maze (recursive backtracker, with `S` and `E` placed) or a room and
  corridor dungeon, replacing the active layer.
- Export opens a dialog: a Scope selector (Active layer or Flattened), a copy-or-download
  button per format, and a Legacy (v1) section with its own format picker and preview.
- Import opens a dialog: load a `.json`, `.txt` or REXPaint `.xp` file, or paste text
  directly - both routes run through the same tolerant parser.

## Layers

A level is a list of named layers plus one legend shared by the whole level, not one legend
per layer. Layers are ordered bottom to top like Tiled or Photoshop: the first layer in the
list is the floor, later layers draw on top of it. The Layers panel shows them top to bottom
to match that stacking order.

- **Cap:** up to 8 layers per level (`MAX_LAYERS`). Add layer disables itself at the cap.
  A project, autosave entry or `.xp` file with more than 8 layers keeps the lowest 8 on load
  and shows a toast; the same trim runs when the autosaved entry is restored on startup.
- **Names:** editable per layer; blank on blur falls back to "layer N" (its 1-based
  position), because an empty name would break the Tiled `name` attribute and the Godot
  `LEVELS` dictionary key.
- **Deleting or clearing** a non-empty layer asks for confirmation through the editor's own
  modal, not the browser's `confirm()`. The last remaining layer cannot be deleted.
- Painting, erasing and Generate always target the active layer; Clear layer wipes only that
  layer. The legend is untouched by any of this, since it lives on the level, not the layer.

### Union bounds

Each layer keeps its own grid and its own bounding box, so one layer can be smaller than or
offset from another. Every export that lays layers on top of each other - Tiled TMX, the
Godot `LEVELS` dict, one `addLevel` per layer in KaPlay, and the `.xp` binary - uses the union
of all layers' bounding boxes as a common frame, so every layer's lines come out the same
width and height and line up cell for cell. TXT, CSV and the Legacy (v1) formats use that same
union whenever Scope is set to Flattened; Active layer scope uses that one layer's own bounds
instead.

### Per-exporter mapping

| Export | Layers become |
| --- | --- |
| TXT / CSV / Legacy (v1) | one grid, chosen by the Scope dropdown: Active layer, or Flattened (visible layers merged bottom to top, hidden layers skipped) |
| KaPlay | one `addLevel(...)` block per **visible** layer, each after a `// layer: <name>` comment, sharing one `tiles` object |
| Godot | one entry per layer in the `LEVELS` dictionary, keyed by layer name, plus a shared `TILES` dict and a `load_layer(tile_map, layer_name)` helper |
| Tiled `.tmx` | one `<layer>` element per layer, in the same order as the level; hidden layers are exported too, marked `visible="0"` |
| REXPaint `.xp` | native multi-layer binary, one binary layer per level layer, in the same bottom-to-top order |
| Project `.json` | every layer (name, visibility, origin, lines) plus the shared legend - the only export that reads back without any loss |

`.xp` files do not store layer names, so importing one names its layers "layer 1", "layer 2"
and so on, bottom to top; rename them in the Layers panel afterwards if you want better names.

### Export and Import dialogs

Export and Import open modal dialogs rather than inline panels. The Export modal has the
Scope selector, one copy-or-download button per format, and a "Legacy (v1)" section: a format
picker (Text, Array of strings, Array of arrays - the exact three shapes the original v1
editor used to save), a live preview textarea, and a Copy legacy button. The Import modal has
a file picker for `.json` / `.txt` / `.xp` plus a paste box; both routes run through the same
tolerant parser, so pasting an old v1 export works exactly like importing its file.

## Architecture

The rule is simple: everything that can be tested without a DOM lives outside `src/ui`.

```
src/
  app.ts            entry point: state, render loop, wiring of renderer/input/panels
  styles.css        v1 look: cream paper on a brown desk, Press Start 2P
  assets/           font, cursor sprites, pop sound (imported through Vite)
  core/             pure model, no DOM
    grid.ts         sparse Map "x,y" -> char, bounds, fromLines/toLines(bounds?)
    legend.ts       char -> {name, color}, auto names and palette, shared by a whole level
    level.ts        Layer/Level model, MAX_LAYERS = 8, unionBounds, flattenLayers
    project.ts      v3 layered JSON serialize plus a tolerant parser for v2, v1 and foreign formats
    generators.ts   seeded RNG (mulberry32), maze and dungeon generators
  export/           pure functions Level (or Grid + Legend) -> string or bytes
    text.ts         TXT and CSV, given a grid and optional bounds
    legacy.ts       v1 legacy text / array-text / array-array formats, used by the Export modal
    kaplay.ts       addLevel(...) snippet, one block per visible layer
    godot.ts        GDScript LEVELS dict + load_layer(...) helper
    tiled.ts        TMX with one <layer> element per level layer
    rexpaint.ts     native multi-layer .xp binary layout plus gzip, both write and read
  ui/               thin DOM layer
    renderer.ts     canvas drawing, view maths (pan, zoom, centring)
    input.ts        pointer, wheel and keyboard gestures, Bresenham stroke interpolation
    modal.ts        generic modal dialog + confirm() replacement, stacked overlay
    panels.ts       sidebar: brush, layers, legend, generators, export/import dialogs, autosave, toasts
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
| TXT | clipboard | Scope-dependent lines (active layer or flattened), trailing blank space trimmed to the bounding box |
| CSV | clipboard | Scope-dependent, one character per cell, commas escaped |
| KaPlay | clipboard | one `addLevel([...], { tiles: {...} })` block per visible layer, sharing one `tiles` object |
| Godot | clipboard | GDScript with a `LEVELS` dict keyed by layer name, shared `TILES`, and a `load_layer(tile_map, layer_name)` helper |
| Tiled | `map.tmx` | orthogonal map, one `<layer>` element per level layer (hidden ones get `visible="0"`), legend exported as tile properties |
| REXPaint | `map.xp` | gzipped `.xp`, native multi-layer (up to 8), legend colors as foreground |
| Project | `project.json` | every layer plus the shared legend, the format to re-import later without any loss |

Specifications and API docs:

- Tiled TMX: <https://doc.mapeditor.org/en/stable/reference/tmx-map-format/>
- REXPaint `.xp`: <https://www.gridsagegames.com/rexpaint/resources.html> and the format
  notes in <https://www.gridsagegames.com/rexpaint/manual.txt>
- KaPlay `addLevel`: <https://kaplayjs.com/doc/ctx/addLevel/>
- Godot `TileMapLayer`: <https://docs.godotengine.org/en/stable/classes/class_tilemaplayer.html>

### KaPlay

A level with one layer exports a single block:

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

A level with more layers exports one `addLevel(...)` call per **visible** layer, each after a
`// layer: <name>` comment, all sharing the same `tiles` object; call them in order so later
layers stack on top of earlier ones. Legend names become sprite names, so name your legend
entries after the sprites you loaded with `loadSprite`.

### Godot 4

```gdscript
# generated by ASCII Level Editor
const LEVELS = {
	"main": [
		"####",
		"#@.#",
		"####",
	],
}

const TILES = {
	"#": Vector2i(0, 0), # wall
	".": Vector2i(1, 0), # floor
	"@": Vector2i(2, 0), # player
}

func load_layer(tile_map: TileMapLayer, layer_name: String, source_id: int = 0) -> void:
	var level = LEVELS[layer_name]
	for y in level.size():
		for x in level[y].length():
			var ch := level[y][x]
			if TILES.has(ch):
				tile_map.set_cell(Vector2i(x, y), source_id, TILES[ch])
```

`LEVELS` has one entry per layer, keyed by its name, so call `load_layer(tile_map, "main")`,
or one call per `TileMapLayer` node if you keep layers apart in your Godot scene. The atlas
coordinates assume your tiles sit in a single row of the TileSet atlas in legend order.
Reorder the `TILES` dictionary if your atlas is laid out differently.

### Tiled

The `.tmx` file references a placeholder `tileset.png` sized `16 * tileCount` by `16`.
Point the tileset at your real image inside Tiled, or swap the `<image source="...">` line
before opening it. Every layer in the level becomes one `<layer>` element, in the same
bottom-to-top order as the Layers panel; hidden layers are exported too, just marked
`visible="0"`, so toggling one back on inside Tiled works as expected. Each tile carries
`name` and `char` properties taken from the legend, so the original characters survive the
round trip.

### REXPaint

`.xp` is a gzipped binary: version, layer count, then per layer width, height and cells in
column-major order, each cell being a 32 bit character code plus RGB foreground and RGB
background. Every level layer becomes one binary layer, in the same bottom-to-top order
(layer 0 is the lowest, matching REXPaint's own convention), and all of them share the union
bounds, so every layer has the same width and height. Empty cells are written as space with a
magenta background (255, 0, 255), which is REXPaint's transparency convention. Import reads
the same layout back, including per-character colors, which land in the shared legend - but
since `.xp` has no room for layer names, imported layers come back named "layer 1", "layer 2"
and so on, bottom to top.

## Verification status

Being explicit about what has actually been checked:

- The full Vitest suite covers the grid, legend, the layer model, project import (v3, v2 and
  v1 shapes), generators and every exporter.
- TMX output is checked for XML well-formedness with `xmllint --noout`. It has not been
  opened in Tiled itself, and the tileset image is a placeholder by design.
- `.xp` output is verified by a structural round trip: the binary layout is asserted byte by
  byte, and gzip compatibility is checked against Node's `zlib`. REXPaint itself was not
  used to open the file.
- Multi-layer TMX and multi-layer `.xp` (several layers, one of them hidden) were validated
  the same way as the single-layer case above: unit tests plus `xmllint`/structural round
  trip only, not by opening the file in Tiled or REXPaint.
- The KaPlay and Godot snippets are asserted as text. They have not been executed inside a
  running game.
- The production build was loaded from a subdirectory (the way itch.io serves HTML games)
  and `standalone.html` was loaded from `file://`, both rendering with no console errors.
- Clipboard copy (Copy TXT, CSV, KaPlay, Godot) from `file://` in the standalone build is
  browser-dependent: the Clipboard API is not guaranteed on an opaque origin, and when it is
  refused the editor shows a red toast instead of copying. File downloads (`.tmx`, `.xp`,
  `.json`) use blob URLs and are unaffected.

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

## Importing older formats

The import dialog is deliberately forgiving, because the project format has changed shape
more than once and v1 saved maps in more than one shape on top of that. `parseProject`
accepts, in order:

- v3 project JSON, the current native format: `{ app, version: 3, legend, layers: [{ name,
  visible, origin, lines }] }`, one layer per array entry
- v2 project JSON (`{ app, version, origin, lines, legend }`), a single map that becomes one
  layer named "main"
- a bare array of strings (v1)
- an array of arrays of characters (v1, multi character cells fall back to the first
  character)
- objects with a `map`, `data`, `rows` or `lines` array
- `{ tiles: "line\nline" }`
- `{ cells: [{ x, y, ch }] }`, also accepting `c` or `char` as the key
- raw text with newline separated rows

Anything else raises "Unrecognized map format" instead of silently producing an empty level.
Legend names and colors are only present in v3 and v2 files. For older shapes the legend is
rebuilt from the characters found on the map, using the default names and palette, and
everything lands on a single layer named "main". REXPaint `.xp` files are handled separately
(not through `parseProject`) and come back as one layer per binary layer, named "layer 1",
"layer 2" and so on - see Layers above.

## Credits

- Original ASCII Map Editor by stmn, MIT licensed:
  <https://github.com/stmn/ascii-map-editor>. v2 is a rewrite that reuses its visual style
  and its assets.
- Font: Press Start 2P by CodeMan38, SIL Open Font License:
  <https://fonts.google.com/specimen/Press+Start+2P>.
- Cursor sprites and `pop.wav` come from the original v1 repository.

Full license texts (this project, the MIT license of the original, and the OFL of Press
Start 2P) are in `LICENSES.md`. `npm run zip` copies that file into `dist/`, so every
distributed copy of the editor carries it.
