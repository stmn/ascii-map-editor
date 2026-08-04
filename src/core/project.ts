import { Grid } from './grid';

export interface LegendEntry { ch: string; name: string; color: string }

export function serializeProject(grid: Grid, legend: LegendEntry[]): string {
  const b = grid.bounds();
  return JSON.stringify({
    app: 'ascii-level-editor',
    version: 2,
    origin: b ? [b.minX, b.minY] : [0, 0],
    lines: grid.toLines(),
    legend,
  }, null, 2);
}

// tolerancyjny odczyt: v2 + znane warianty v1/obce
export function parseProject(json: string): { grid: Grid; legend: LegendEntry[] } {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    // format tekstowy v1: surowy tekst z liniami oddzielonymi newline
    if (json.trim().length === 0) {
      throw new Error('Unrecognized map format');
    }
    const lines = json.split('\n').map((line) => line.replace(/\r$/, ''));
    return { grid: Grid.fromLines(lines, 0, 0), legend: [] };
  }

  const fromLines = (lines: string[], ox = 0, oy = 0) => ({
    grid: Grid.fromLines(lines, ox, oy),
    legend: [] as LegendEntry[],
  });

  if (Array.isArray(data) && data.every((l) => typeof l === 'string')) {
    return fromLines(data as string[]);
  }

  // format array-array v1: tablica tablic znakow
  if (Array.isArray(data) && data.every((row) => Array.isArray(row) && (row as unknown[]).every((cell) => typeof cell === 'string'))) {
    const lines = (data as string[][]).map((row) => row.map((cell) => (cell || ' ')[0]).join(''));
    return fromLines(lines);
  }

  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.lines)) {
      const origin = Array.isArray(o.origin) ? (o.origin as number[]) : [0, 0];
      const legend = Array.isArray(o.legend) ? (o.legend as LegendEntry[]) : [];
      return { ...fromLines(o.lines as string[], origin[0], origin[1]), legend };
    }
    for (const key of ['map', 'data', 'rows']) {
      if (Array.isArray(o[key]) && (o[key] as unknown[]).every((l) => typeof l === 'string')) {
        return fromLines(o[key] as string[]);
      }
    }
    if (typeof o.tiles === 'string') return fromLines((o.tiles as string).split('\n'));
    if (Array.isArray(o.cells)) {
      const g = new Grid();
      for (const c of o.cells as Record<string, unknown>[]) {
        const ch = (c.ch ?? c.c ?? c.char) as string | undefined;
        if (typeof c.x === 'number' && typeof c.y === 'number' && typeof ch === 'string') {
          g.set(c.x, c.y, ch);
        }
      }
      if (!g.isEmpty()) return { grid: g, legend: [] };
    }
  }
  throw new Error('Unrecognized map format');
}
