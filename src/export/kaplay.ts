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
