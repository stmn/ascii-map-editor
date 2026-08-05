import { Level, assertExportableBounds, unionBounds } from '../core/level';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function exportTmx(level: Level, tileSize = 16): string {
  const b = unionBounds(level.layers);
  assertExportableBounds(b);
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
