import { Bounds, Grid } from '../core/grid';
import { assertExportableBounds } from '../core/level';

export function exportTxt(grid: Grid, bounds?: Bounds): string {
  assertExportableBounds(bounds ?? grid.bounds());
  return grid.toLines(bounds).map((l) => l.replace(/ +$/, '') + '\n').join('');
}

export function exportCsv(grid: Grid, bounds?: Bounds): string {
  const b = bounds ?? grid.bounds();
  assertExportableBounds(b);
  if (!b) return '';
  const rows: string[] = [];
  for (let y = b.minY; y <= b.maxY; y++) {
    const cols: string[] = [];
    for (let x = b.minX; x <= b.maxX; x++) {
      const ch = grid.get(x, y) ?? '';
      cols.push(ch === ',' || ch === '"' ? `"${ch.replace('"', '""')}"` : ch);
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n') + '\n';
}
