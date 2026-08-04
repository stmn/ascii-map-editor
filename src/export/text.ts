import { Grid } from '../core/grid';

export function exportTxt(grid: Grid): string {
  return grid.toLines().map((l) => l + '\n').join('');
}

export function exportCsv(grid: Grid): string {
  const b = grid.bounds();
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
