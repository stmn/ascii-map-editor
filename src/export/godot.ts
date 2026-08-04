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
