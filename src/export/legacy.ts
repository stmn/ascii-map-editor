// Formaty eksportu z ASCII Map Editor v1: text / array-text / array-array
// (uzywane w modalu Export w sekcji Legacy i w karcie Map; parseProject czyta wszystkie trzy)
import { Bounds, Grid } from '../core/grid';
import { Level, assertExportableBounds, flattenLayers, unionBounds } from '../core/level';

export type LegacyFormat = 'text' | 'array-text' | 'array-array';

/**
 * `trim` (domyslnie true - dotychczasowe zachowanie): text/array-text obcinaja spacje na koncu
 * KAZDEJ linii (array-array nigdy - potrzebuje dokladnego prostokata). Karta Map (Simplified)
 * przekazuje false: serializuje jawna ramke W x H z pol Width/Height, wiec dopiero co powiekszone
 * (puste) kolumny/wiersze na koncu maja zostac widoczne jako spacje, a nie zniknac przy obcinaniu.
 */
export function exportLegacy(grid: Grid, format: LegacyFormat, bounds?: Bounds, trim = true): string {
  const b = bounds ?? grid.bounds();
  assertExportableBounds(b);
  if (!b) return format === 'text' ? '' : '[]';
  // toLines z jawnym bounds nie przycina spacji - array-array potrzebuje dokladnego prostokata
  const exact = grid.toLines(b);
  if (format === 'array-array') return JSON.stringify(exact.map((l) => [...l]));
  const lines = trim ? exact.map((l) => l.replace(/ +$/, '')) : exact;
  if (format === 'text') return lines.join('\n');
  return JSON.stringify(lines, null, '  ');
}

/**
 * Caly poziom jako jedna mapa v1: splaszczenie WIDOCZNYCH warstw na obrysie WSZYSTKICH
 * (tak samo jak scope "Flattened" w modalu Export, wiec oba podglady pokazuja to samo).
 * Karta Map w trybie Simplified nie ma wyboru zakresu - domyslnie pokazuje calosc, ale przyjmuje
 * tez jawny bounds i trim: karta serializuje w ramce W x H z pol Width/Height (bez obcinania),
 * zeby pola dzialaly na zywo - patrz komentarz przy trim w {@link exportLegacy}.
 */
export function exportLegacyFlat(
  level: Level, format: LegacyFormat, bounds?: Bounds, trim = true,
): string {
  return exportLegacy(
    flattenLayers(level.layers), format, bounds ?? unionBounds(level.layers) ?? undefined, trim,
  );
}
