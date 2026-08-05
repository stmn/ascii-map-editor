// Model warstw: poziom = lista warstw + wspolna legenda. Wspolny uklad wspolrzednych.
import { Bounds, Grid } from './grid';
import { Legend } from './legend';

export interface Layer { id: string; name: string; visible: boolean; grid: Grid }
export interface Level { layers: Layer[]; legend: Legend }

export const MAX_LAYERS = 8;

export function makeLayer(name: string, grid: Grid = new Grid()): Layer {
  return { id: crypto.randomUUID(), name, visible: true, grid };
}

export function createLevel(): Level {
  return { layers: [makeLayer('main')], legend: new Legend() };
}

export function unionBounds(layers: Layer[]): Bounds | null {
  let out: Bounds | null = null;
  for (const l of layers) {
    const b = l.grid.bounds();
    if (!b) continue;
    out = out
      ? {
          minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY),
          maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY),
        }
      : { ...b };
  }
  return out;
}

/**
 * Splaszczenie widocznych warstw do jednej mapy "x,y" -> komorka, kazda niesie tez indeks
 * warstwy zrodlowej (pozycja w oryginalnej tablicy layers, NIE w kolejnosci malowania).
 * Iterujemy od dolu, gorna widoczna warstwa nadpisuje dolne. Renderer uzywa indeksu do
 * przyciemniania komorek spoza aktywnej warstwy - bez niego nie dalby rady odroznic, z ktorej
 * warstwy pochodzi znak po splaszczeniu.
 */
export function flattenWithSource(layers: Layer[]): Map<string, { ch: string; layerIndex: number }> {
  const flat = new Map<string, { ch: string; layerIndex: number }>();
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const l = layers[layerIndex]!;
    if (!l.visible) continue;
    for (const { x, y, ch } of l.grid.cells()) flat.set(`${x},${y}`, { ch, layerIndex });
  }
  return flat;
}

// cienki wrapper nad flattenWithSource - ten sam przebieg warstw, tylko bez indeksu (patrz nizej)
export function flattenLayers(layers: Layer[]): Grid {
  const flat = new Grid();
  for (const [key, { ch }] of flattenWithSource(layers)) {
    const [x, y] = key.split(',').map(Number);
    flat.set(x, y, ch);
  }
  return flat;
}

export function levelUsedChars(level: Level): string[] {
  const set = new Set<string>();
  for (const l of level.layers) for (const ch of l.grid.usedChars()) set.add(ch);
  return [...set].sort();
}

// gorny limit rozmiaru eksportu - chroni przed zawieszeniem karty przy pomylkowo
// gigantycznych bounds (np. postawiona komorka na x=999999)
export const MAX_EXPORT_CELLS = 4_000_000;

export function assertExportableBounds(b: Bounds | null): void {
  if (!b) return;
  const cells = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
  if (cells > MAX_EXPORT_CELLS) throw new Error('Map bounds too large to export');
}
