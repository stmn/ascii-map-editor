import { Grid } from '../core/grid';
import { Level, assertExportableBounds, flattenLayers } from '../core/level';

// snippet dla KaPlay (kaplayjs.com): wspolne tiles + JEDEN addLevel.
// addLevel to mapa poziomu, nie miejsce na warstwy - stad zawsze jedna siatka zrodlowa:
// przekazana jawnie (np. aktywna warstwa) albo, gdy brak, flatten widocznych warstw (top-wins).
export function exportKaplay(level: Level, grid?: Grid): string {
  const source = grid ?? flattenLayers(level.layers);
  const b = source.bounds();
  assertExportableBounds(b);
  const tiles = level.legend.entries()
    .map((e) => `  ${JSON.stringify(e.ch)}: () => [sprite(${JSON.stringify(e.name)})],`)
    .join('\n');
  const lines = source.toLines(b ?? undefined).map((s) => `  ${JSON.stringify(s)},`).join('\n');
  return `const tiles = {\n${tiles}\n};\n\naddLevel([\n${lines}\n], {\n  tileWidth: 16,\n  tileHeight: 16,\n  tiles,\n});\n`;
}
