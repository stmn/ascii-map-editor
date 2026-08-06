# ASCII Level Editor

Paint a level with plain ASCII characters across named layers, name and color the tiles in
one shared legend, then export the result straight into your engine: KaPlay, Tiled, Godot or
REXPaint.

It is a single static page: no backend, no accounts, no network calls. Everything runs in
the browser, your work is organized into projects and levels and autosaved to `IndexedDB`
(with a `localStorage` fallback, see Projects and levels below), and the build also ships as
a one-file `standalone.html` that works offline from `file://`.

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
  into the canvas and into `.xp`. A small edit button next to the character opens a prompt to
  change the character itself: it remaps every cell that uses it, on every layer, to the new
  one. A new character that collides with one already in the legend (even if currently unused)
  or already painted somewhere on the map is rejected with a red toast and nothing changes;
  the remap is undoable like every other edit.
- Generate builds a maze (recursive backtracker, with `S` and `E` placed) or a room and
  corridor dungeon, replacing the active layer. A **Rooms** field (1-50, default 8) sits next
  to the Width/Height fields and sets the dungeon's target room count - the generator places
  rooms until it reaches that target or hits an internal placement-attempt cap, so a small or
  crowded map may end up with fewer rooms than requested. Rooms has no effect on the maze.
- Export opens a dialog: a Scope selector (Active layer or Flattened), a copy-or-download
  button per format, and a Legacy (v1) section with its own format picker and preview.
- Import opens a dialog: load a `.json`, `.txt` or REXPaint `.xp` file, or paste text
  directly - both routes run through the same tolerant parser.

## Brush size

The Draw card has a row of size chips next to the character field, 1x1 up to 5x5
(`BRUSH_SIZES` in `core/editorState.ts`). The selected size paints and erases a square
footprint centered on the cursor cell; for an even size (2 or 4), which has no exact center,
the extra row and column go right and down. The hover highlight on the canvas shows that same
footprint before you click, and painting or erasing a whole stroke with a bigger brush is
still one undo step, exactly like a 1x1 stroke.

Brush size is a session setting, like the brush character itself: it is not written to
`localStorage` and resets to 1x1 on the next load.

## Layer dimming

The Layers card has a "Dim other layers" checkbox, on by default. While it is checked and
more than one layer is visible, every cell belonging to a layer other than the active one is
drawn at 50% opacity on the canvas, so the layer you are currently painting on stands out from
the rest of the stack. It is a view-only setting: it never changes the saved level, is not
part of undo/redo, and is not persisted between sessions - it always starts on.

Dimming is an Advanced-mode aid. Simplified mode has no Layers card and no notion of an active
layer, so a partly faded map there would look like a rendering bug with nothing in the UI to
explain it - the canvas draws every cell at full opacity in Simplified regardless of the
checkbox. The setting itself is untouched, so switching back to Advanced restores whatever you
had chosen.

## Undo and redo

Ctrl+Z (Cmd+Z on Mac) undoes the last change; Ctrl+Shift+Z or Ctrl+Y (Cmd+Shift+Z or Cmd+Y on
Mac) redoes it. The same Undo and Redo buttons sit at the top of the Draw card and disable
themselves when there is nothing to undo or redo - the shortcuts and the buttons drive the
exact same history. The shortcuts are ignored while typing in a text field or while a modal
dialog (Export, Import, a confirmation, the legend character prompt) is open. Holding Alt
together with Ctrl/Cmd is also excluded, so Ctrl+Alt+Z does not trigger undo - Alt is reserved
elsewhere as the erase modifier while dragging.

History is per level and lives only for the current session; nothing is written to disk. It
is capped at 100 entries, and pushing past the cap silently drops the oldest one. Switching to
a different level, or to a level in a different project, clears the history outright: the
commands on the stack belong to the level you are leaving, and undoing them there would make
no sense once another level's grid is on screen. Loading a file or pasted text into the
CURRENT level through the Import dialog is itself undoable, since it replaces the whole level
in one step; it is switching levels that resets the stack, not loading content into one.

What is on the stack:

- a whole paint or erase stroke - the full mouse-down-to-mouse-up gesture is one command, not
  one per cell
- Generate (maze or dungeon)
- Clear layer, and the whole-map Clear in Simplified mode's Map card
- loading a file or pasted text through the Import dialog, or through Load in the Map card
- every layer operation: add, delete, move, show/hide, rename
- every legend edit: renaming an entry, changing its color, changing its character

What is NOT on the stack, because it is a workspace-level operation rather than an edit to
the currently open level's content: switching levels or projects, New/Duplicate/Delete level,
New/Rename/Delete project, and Export workspace/Import workspace (the backup JSON).

Undoing or redoing normally cannot fail, but the character remap command is symmetric (it
remaps in the other direction) and can hit the same "Character already in use" collision the
forward edit can - for example if the character the remap is returning to has since been
repainted somewhere else. When that happens the editor shows a red toast and leaves the map as
it is; the failed command is not put back on the opposite stack, since retrying it would fail
the same way again, so the rest of the history above and below it stays intact.

## Layout

The seven panel cards (Project, Draw, Layers, Legend, Generate, Map, Extra features) live in
two sidebar columns, one on each side of the canvas; the right column is where all seven start.
Map and Extra features are the odd ones out: they only show in Simplified mode, see Modes
below. Drag a card by its header - the collapsed title bar - into the other column, or up and
down within the same column: a thin line shows where it will land before you drop it.

Both sidebar columns are always the full height of the window and top-aligned: cards stack
from the top, and whatever space is left below the last card - or all of it, in a column with
no visible cards - stays part of the column instead of collapsing away. That leftover space
has no card drawn around it and lets clicks fall straight through to the map underneath it, so
an empty or half-full column never gets in the way of painting; the column only turns into a
visible dashed drop zone while a card is actually being dragged over it.

The arrangement is saved to `localStorage` under the key `ascii-level-editor-layout` (two
lists of card ids, left and right, top to bottom) and is re-applied before the very first
paint of the next session, so a saved custom layout never flashes the default one first. A
card id missing from a saved layout (an older save, or a future card that did not exist yet
when it was written) is placed at the bottom of the right column instead of disappearing.

The canvas centers itself in whatever horizontal space is left between the two columns, so
moving a card between columns - which changes their widths - shifts the view horizontally to
re-center it, but only horizontally: vertical scroll and zoom level survive a drop untouched.
Both columns keep a fixed 8px gap between their cards and the scrollbar, so a classic
(non-overlay) scrollbar never touches a card's border.

## Floating center button

A small square button with a crosshair icon floats fixed at the bottom-center of the screen in
both modes, drawn on top of whichever cards happen to be underneath it. Its tooltip (and screen
reader label) is "Center view", and clicking it re-centers the view on the paper - the same
underlying view-centering call as the in-card Center button inside Simplified's Map card, so the
two are always in sync. It lives outside the card layout entirely, so it stays visible
regardless of scroll position, zoom, which cards are on screen or which sidebar column they are
dragged into. Toasts are anchored a little higher, directly above the button, so a toast message
and the floating center button never overlap on screen.

## Modes

The editor has two modes: **Advanced**, the full editor with every card, and **Simplified**,
a smaller layout closer to the original v1 tool. Both modes share the same underlying level,
history and storage; switching modes never changes what is on the map, only which cards are
on screen.

### Choosing and switching

The first time the editor runs, before any mode is stored, a "Welcome" dialog asks which mode
to start in. Clicking Advanced or Simplified there sets the mode. Closing the dialog any other
way - Esc, the X button, or a click on the overlay behind it - also sets a mode, falling back
to Advanced, so the editor is never left without one stored; the dialog does not ask again
once a mode is stored.

After that first choice, a pill switch fixed at the top-center of the screen lets you change
mode at any time, with the current mode highlighted. The choice is written to `localStorage`
under the key `ascii-level-editor-mode` (value `advanced` or `simplified`), so it survives a
reload. If `localStorage` is unavailable (private browsing, for example) the switch still
works for the rest of the session, but the Welcome dialog asks again on the next load.

### What Simplified shows

Simplified is a deliberate replica of the original v1 panel, so it shows at most two cards:
**Map**, the main panel, and **Extra features**, which only appears when you tick its checkbox
in Map. Everything else - **Project**, **Draw**, **Layers**, **Legend** and **Generate** - is
hidden with plain CSS (`display: none` by `data-section`), so nothing about a hidden card's
content is lost: switch back to Advanced and every card is exactly as you left it, including a
custom position from dragging it between sidebar columns.
A hidden card also takes no space and cannot be dropped into, so drag and drop in Simplified
only ever targets the cards you can actually see.

Hiding the Draw card does not take its two keyboard behaviours away, because both are bound to
the window rather than to the card: pressing any printable key still switches the brush, and
Ctrl+Z / Ctrl+Shift+Z still undo and redo.

### The Map card

Map is the whole v1 editor in one card, in the original order:

- **Width** and **Height** side by side (default 14 by 12, clamped to 3-199). These are what
  the generators in Extra features build - they are a request, not a readout, so generating
  never rewrites them. A successful **Load** does update them, to the size of the map you just
  loaded, the way v1's detectMapSize did.
- **Character** - the brush, as a single-character field. It is the same brush the rest of the
  editor uses, kept in sync both ways: typing here sets it, and switching the brush any other
  way (a printable key, a Legend chip) updates the field.
- **Map:** with a blue **SWITCH FORMAT** link on the right, over the textarea. The link cycles
  the same three shapes v1 could save - Text, then Array of strings, then Array of arrays, then
  back - and rewrites the textarea immediately. The choice lasts for the session.
- The **textarea** is both a live preview of the whole map and the import field. It rewrites
  itself after every edit, except while it holds text of your own: once you paste or type
  something different from the preview, it is left alone until you Load it or hit SWITCH
  FORMAT, so painting on the canvas can never wipe a paste out from under you. Clearing the
  field, or editing it back to what the preview says, hands it back to the preview.
- **Clear**, **Center**, **Load**. Clear asks for confirmation and then empties every layer,
  leaving the legend intact; it is one undo step. Center re-centers the view on the paper.
  Load parses whatever is in the textarea through the same tolerant parser as the Import
  dialog's paste box (`.json` project text, a v1 map, or anything else `parseProject`
  understands), and applies it through the same undo-aware replace-level command Import uses -
  so **Load replaces the whole map, and Undo brings it back**.
- **To clipboard** copies the current textarea contents.
- A gray box of three checkboxes: **Show grid**, **Show colors** and **Extra features**. The
  first two are view-only session toggles - they redraw the canvas but never touch the saved
  level, undo history or autosave, and both start on. Unticking Show grid drops the grid lines
  while keeping the paper and its outline; unticking Show colors draws every glyph in one ink
  color instead of its legend color, like v1's gray mode. Extra features shows and hides the
  second card.

Map only views or replaces the whole map as text; it has no per-layer or per-legend controls
of its own, since those live in the cards Simplified hides.

### The Extra features card

Ticking **Extra features** in Map opens a second card below it, holding the two generators:

- **Maze generator** with a Generate button.
- **Dungeon generator** with **Rooms** (target room count, 1-50, default 8), **Min. room
  size** (default 4) and **Max. room size** (default 8) above its own Generate button. Room
  sides are drawn from the min/max range inclusively; if you leave min above max the two are
  simply swapped rather than rejected. The generator places rooms until it reaches the Rooms
  target or hits an internal placement-attempt cap, so a small or crowded map may end up with
  fewer rooms than requested.

Both read the map size from Map's Width and Height fields and run through exactly the same
path as the Generate card in Advanced: a confirmation if the active layer is not empty, then
one undoable step. The card's own **X** button closes it and unticks the checkbox, which is
also the only way it is hidden - the checkbox and the card can never disagree. Whether it is
open is a session setting, like the brush; it always starts closed.

## Projects and levels

Your work is organized as a workspace: one or more **projects**, each holding one or more
**levels**. The Project panel has a project selector with New / Rename / Delete, and below it
a list of the current project's levels, each with a small thumbnail, an editable name, and
Duplicate / Delete buttons. Click a level (or its name field) to switch to it; New level adds
a blank one. The last project cannot be deleted, and neither can a project's last level - there
is always at least one of each.

Below the level list the Project card has two more button rows. The first, **Export...** and
**Import...**, opens the Export and Import modals for the current level - these buttons used to
sit in their own Export and Import cards; the Project card is now the only place those dialogs
are launched from, see Export and Import dialogs below. The second, **Export workspace** and
**Import workspace**, is the whole-workspace backup described in Workspace backup below.

Thumbnails are rendered offscreen at 120x80 as flat color rectangles, one per legend color
(at that size, drawing the actual characters would be unreadable, so shapes and colors carry
the map instead), encoded as a JPEG data URL and shown at 48x32 in a bordered frame in the
level list. A level with nothing painted on a visible layer shows no thumbnail, just the
frame.

### Storage

The whole workspace (project and level metadata, level JSON, thumbnails) lives in
**IndexedDB**, database `ascii-level-editor`, with a `projects` object store and a `levels`
object store indexed by `projectId`. When IndexedDB is unavailable (private browsing in some
browsers, or a blocked/disabled database) the editor falls back to a single JSON blob in
**`localStorage`** holding the same projects and levels, and shows an info toast the first
time this happens. Everything else - project/level panel, autosave, export/import - works the
same either way; the fallback only changes where the bytes end up.

A separate, tiny pointer (`{"projectId": ..., "levelId": ...}`) always stays in `localStorage`
under its own key regardless of which store backs the data, so the next launch reopens the
same level you had open last.

Editing a level (painting, renaming a layer, changing the legend, and so on) schedules an
autosave debounced by 500 ms; the save also regenerates that level's thumbnail. A failed save
(storage full, database closed) is a soft failure: it does not interrupt editing, it shows a
red toast instead, rate-limited so it cannot spam a toast per brush stroke.

### Migration from the old single-map autosave

Versions before the project/level workspace kept one autosaved map directly under a
`localStorage` key. The first time the workspace store is empty, that old autosave (if
present and if it still parses) is migrated once into a new project called "My project" with
one level called "Level 1", and an info toast confirms it. The old key is not deleted, only
renamed to a `-backup` suffix, so the original data stays recoverable on disk even if the
migrated copy turns out wrong. There is no second migration: once the workspace store holds
anything, this path never runs again.

### Workspace backup

The Project panel's second button row is the backup: "Export workspace" downloads a
`workspace.json` with every project and level (thumbnails are dropped to keep the file small;
they regenerate on the next save). "Import workspace" reads that file back and merge-adds it
into whatever is already open:
every imported project and level gets a fresh id, a project name that collides with an
existing one gets a "Name N" suffix instead of overwriting it, and the import never deletes or
replaces anything already in the workspace. An unrecognized file (wrong shape, foreign JSON)
is rejected up front with a red toast; inside an otherwise valid file, individual malformed
records are skipped silently while the rest of the file still imports.

### Multi-tab and other caveats

There is no cross-tab locking: if the same level is open and edited in two tabs, the last
autosave to land wins and silently overwrites the other tab's version. Keep one tab per level
open at a time. Exports of very large maps fail fast instead of freezing the tab: any export
that would flatten more than 4,000,000 cells raises "Map bounds too large to export" as a red
toast rather than hanging the browser. The Export and Import dialogs, and the New
project/rename/delete confirmations, are proper modal dialogs (`role="dialog"` or
`role="alertdialog"`, `aria-modal`) with a keyboard focus trap while open and focus returned
to whatever triggered them once closed.

## Layers

A level is a list of named layers plus one legend shared by the whole level, not one legend
per layer. Layers are ordered bottom to top like Tiled or Photoshop: the first layer in the
list is the floor, later layers draw on top of it. The Layers panel shows them top to bottom
to match that stacking order.

- **Cap:** up to 8 layers per level (`MAX_LAYERS`). Add layer disables itself at the cap.
  Importing a project or `.xp` file with more than 8 layers keeps the lowest 8 and shows an
  info toast about the trim. The same trim runs on startup if the autosaved entry itself has
  more than 8 layers, but silently, with no toast - only the Import path notifies you.
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
union bounds regardless of Scope, so a file exported with Active layer lines up with one
exported as Flattened; Scope only changes which cells are exported (one layer's content, or
every visible layer merged), never the frame around them.

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

Export and Import open modal dialogs rather than inline panels, launched by the Export... and
Import... buttons in the Project card (see Projects and levels above). The Export modal has the
Scope selector, one copy-or-download button per format, and a "Legacy (v1)" section: a format
picker with two of the three shapes the original v1 editor used to save - Array of strings and
Array of arrays - a live preview textarea, and a Copy legacy button. The third shape, plain
Text, is left out of this picker because it duplicates the Copy TXT button already in the same
dialog; all three legacy shapes together are still available behind the SWITCH FORMAT link in
Simplified mode's Map card, see Modes above. The Import modal has a file picker for `.json` / `.txt` / `.xp` plus a paste
box; both routes run through the same tolerant parser, so pasting an old v1 export works
exactly like importing its file.

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
    level.ts        Layer/Level model, MAX_LAYERS = 8, unionBounds, flattenLayers, export bounds cap
    project.ts      v3 layered JSON serialize plus a tolerant parser for v2, v1 and foreign formats
    generators.ts   seeded RNG (mulberry32), maze and dungeon generators
    editorState.ts  EditorState type, activeLayer/activeGrid helpers, applyLevelToState
    store.ts        WorkspaceStore interface, ProjectMeta/LevelRecord, KvJsonStore fallback,
                     ensureSeed (bootstrap + migration), export/importWorkspace (backup JSON)
    idb.ts          IndexedDB WorkspaceStore, db 'ascii-level-editor', stores projects/levels
    history.ts      History: undo/redo stacks, cap 100, onChange hook
    commands.ts     Command factories: stroke, level-replace snapshot, layer ops, legend edit, remap
    remap.ts        remapChar: change a legend entry's character, remapping every cell on every layer
  export/           pure functions Level (or Grid + Legend) -> string or bytes
    text.ts         TXT and CSV, given a grid and optional bounds
    legacy.ts       v1 legacy text / array-text / array-array formats, used by the Export modal
    kaplay.ts       addLevel(...) snippet, one block per visible layer
    godot.ts        GDScript LEVELS dict + load_layer(...) helper, layer name key dedupe
    tiled.ts        TMX with one <layer> element per level layer
    rexpaint.ts     native multi-layer .xp binary layout plus gzip, both write and read
  ui/               thin DOM layer
    renderer.ts     canvas drawing, view maths (pan, zoom, centring)
    input.ts        pointer, wheel and keyboard gestures, Bresenham stroke interpolation
    modal.ts        generic modal dialog + confirm() replacement, stacked overlay, a11y + focus trap
    thumb.ts        level thumbnail: flat-color 120x80 canvas -> JPEG data URL
    dom.ts          tiny element builder helpers shared by every panel
    layout.ts       dual sidebar: card drag and drop, localStorage layout, canvas centering offset
    panels.ts       composition root: wires the panels/ modules together through initPanels(ctx)
    panels/         one module per sidebar card, all fed state and callbacks by panels.ts
      context.ts    shared PanelsCtx/hooks, toast, workspace store handle, autosave scheduling
      history.ts    Undo/Redo buttons and shortcuts, History instance, clears on level switch
      project.ts    Project card: project select, New/Rename/Delete, level list,
                     Export/Import modal launchers, backup JSON
      draw.ts       brush and recent chips
      layers.ts     Layers card: add/reorder/rename/hide/delete
      legend.ts     Legend card: name/color/usage per character, character remap
      generate.ts   maze/dungeon generator card, plus the generator path both cards share
      map.ts        Map card: the whole v1 main panel, Simplified mode only
      extra.ts      Extra features card: the two generators, Simplified mode only
      exportModal.ts   Export dialog
      importModal.ts   Import dialog
tests/              Vitest specs for core/ and export/ only
scripts/
  build-standalone.mjs   inlines dist/ into a single offline HTML file
```

`panels.ts` never imports `app.ts`. It receives the state and callbacks through
`initPanels(ctx)`, so the import graph stays acyclic; the same rule holds one level down, from
`panels.ts` into each module under `panels/`.

There are no runtime dependencies. The dev dependencies are TypeScript, Vite and Vitest,
and `scripts/build-standalone.mjs` is plain Node with no packages at all.

## Formats

| Export | Output | Notes |
| --- | --- | --- |
| TXT | clipboard | Scope-dependent lines (active layer or flattened), trailing blank space trimmed to the bounding box |
| CSV | clipboard | Scope-dependent, one character per cell, commas escaped |
| KaPlay | clipboard | a shared `const tiles = {...}`, then one `addLevel([...], { tiles })` block per visible layer, referencing that same `tiles` |
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

The export is always a shared `tiles` object first, then one `addLevel(...)` call per
**visible** layer, each after a `// layer: <name>` comment and referencing that same `tiles`.
A level with one layer ("main") looks like this:

```js
const tiles = {
  "#": () => [sprite("wall")],
  ".": () => [sprite("floor")],
  "@": () => [sprite("player")],
};

// layer: main
addLevel([
  "####",
  "#@.#",
  "####",
], {
  tileWidth: 16,
  tileHeight: 16,
  tiles,
});
```

A level with more layers repeats the `// layer: <name>` / `addLevel(...)` pair for each
visible one, still sharing the single `tiles` declared at the top; call them in order so later
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
- Icons: Lucide, ISC License (a few glyphs also carry the Feather project's MIT license):
  <https://lucide.dev>. The button icons across every card and modal are inlined as SVG path
  data at dev time (`src/ui/icons.ts`); the build ships no Lucide package and makes no network
  request for them at runtime.

Full license texts (this project, the MIT license of the original, the OFL of Press Start 2P,
and the ISC/MIT licenses of the Lucide icons) are in `LICENSES.md`. `npm run zip` copies that
file into `dist/`, so every distributed copy of the editor carries it.
