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
