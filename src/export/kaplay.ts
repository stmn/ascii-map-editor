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
