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
  // walidacja przed alokacja: uszkodzony plik moze deklarowac miliardy komorek i zawiesic karte
  if (bytes.byteLength < 16) throw new Error('Not a valid .xp file');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = v.getInt32(8, true);
  const h = v.getInt32(12, true);
  if (w <= 0 || h <= 0) throw new Error('Not a valid .xp file');
  if (16 + w * h * 10 > bytes.byteLength) throw new Error('Not a valid .xp file');
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
            .map((c) => c.toString(16).padStart(2, '0')).join('');
          if (!colors.has(ch)) colors.set(ch, hex);
        }
      }
      p += 10;
    }
  }
  return { grid, colors };
}

export async function exportXp(grid: Grid, legend: Legend): Promise<Uint8Array> {
  const bytes = buildXpBytes(grid, legend);
  const stream = new Blob([bytes.slice()]).stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function importXp(gzipped: Uint8Array): Promise<{ grid: Grid; colors: Map<string, string> }> {
  const stream = new Blob([gzipped.slice()]).stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return parseXpBytes(new Uint8Array(await new Response(stream).arrayBuffer()));
}
