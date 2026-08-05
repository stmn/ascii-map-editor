// Formaty eksportu z ASCII Map Editor v1: text / array-text / array-array
// (uzywane w modalu Export w sekcji Legacy i w karcie Map; parseProject czyta wszystkie trzy)
import { Bounds, Grid } from '../core/grid';
import { Level, assertExportableBounds, flattenLayers, unionBounds } from '../core/level';

export type LegacyFormat = 'text' | 'array-text' | 'array-array';

export function exportLegacy(grid: Grid, format: LegacyFormat, bounds?: Bounds): string {
  const b = bounds ?? grid.bounds();
  assertExportableBounds(b);
  if (!b) return format === 'text' ? '' : '[]';
  // toLines z jawnym bounds nie przycina spacji - array-array potrzebuje dokladnego prostokata
  const exact = grid.toLines(b);
  if (format === 'array-array') return JSON.stringify(exact.map((l) => [...l]));
  const trimmed = exact.map((l) => l.replace(/ +$/, ''));
  if (format === 'text') return trimmed.join('\n');
  return JSON.stringify(trimmed, null, '  ');
}

/**
 * Caly poziom jako jedna mapa v1: splaszczenie WIDOCZNYCH warstw na obrysie WSZYSTKICH
 * (tak samo jak scope "Flattened" w modalu Export, wiec oba podglady pokazuja to samo).
 * Karta Map w trybie Simplified nie ma wyboru zakresu - zawsze pokazuje calosc.
 */
export function exportLegacyFlat(level: Level, format: LegacyFormat): string {
  return exportLegacy(flattenLayers(level.layers), format, unionBounds(level.layers) ?? undefined);
}
