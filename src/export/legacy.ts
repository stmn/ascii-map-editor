// Formaty eksportu z ASCII Map Editor v1: text / array-text / array-array
// (uzywane w modalu Export w sekcji Legacy; parseProject czyta wszystkie trzy)
import { Bounds, Grid } from '../core/grid';

export type LegacyFormat = 'text' | 'array-text' | 'array-array';

export function exportLegacy(grid: Grid, format: LegacyFormat, bounds?: Bounds): string {
  const b = bounds ?? grid.bounds();
  if (!b) return format === 'text' ? '' : '[]';
  // toLines z jawnym bounds nie przycina spacji - array-array potrzebuje dokladnego prostokata
  const exact = grid.toLines(b);
  if (format === 'array-array') return JSON.stringify(exact.map((l) => [...l]));
  const trimmed = exact.map((l) => l.replace(/ +$/, ''));
  if (format === 'text') return trimmed.join('\n');
  return JSON.stringify(trimmed, null, '  ');
}
