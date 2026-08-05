import { Grid } from './grid';
import { Legend } from './legend';
import type { LegendEntry } from './legend';
import { Layer, Level, makeLayer } from './level';

export type { LegendEntry };

export function serializeProject(level: Level): string {
  return JSON.stringify({
    app: 'ascii-level-editor',
    version: 3,
    legend: level.legend.entries(),
    layers: level.layers.map((l) => {
      const b = l.grid.bounds();
      return {
        name: l.name,
        visible: l.visible,
        origin: b ? [b.minX, b.minY] : [0, 0],
        lines: l.grid.toLines(),
      };
    }),
  }, null, 2);
}

function levelOf(layers: Layer[], legend: LegendEntry[]): Level {
  return { layers, legend: Legend.from(legend) };
}

function single(grid: Grid, legend: LegendEntry[] = []): Level {
  return levelOf([makeLayer('main', grid)], legend);
}

// tolerancyjny odczyt: v3 + v2 + znane warianty v1/obce
export function parseProject(json: string): Level {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    // format tekstowy v1: surowy tekst z liniami oddzielonymi newline
    if (json.trim().length === 0) {
      throw new Error('Unrecognized map format');
    }
    const lines = json.split('\n').map((line) => line.replace(/\r$/, ''));
    return single(Grid.fromLines(lines, 0, 0));
  }

  if (Array.isArray(data) && data.every((l) => typeof l === 'string')) {
    return single(Grid.fromLines(data as string[]));
  }

  // format array-array v1: tablica tablic znakow
  if (Array.isArray(data) && data.every((row) => Array.isArray(row) && (row as unknown[]).every((cell) => typeof cell === 'string'))) {
    const lines = (data as string[][]).map((row) => row.map((cell) => (cell || ' ')[0]).join(''));
    return single(Grid.fromLines(lines));
  }

  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    const legend = Array.isArray(o.legend) ? (o.legend as LegendEntry[]) : [];

    // v3: warstwy
    if (Array.isArray(o.layers)) {
      const layers: Layer[] = [];
      for (const raw of o.layers as Record<string, unknown>[]) {
        // niezgodna warstwa (brak lines albo elementy nie-string) jest pomijana, nie wywraca calego importu
        if (!Array.isArray(raw.lines) || !raw.lines.every((l) => typeof l === 'string')) continue;
        const origin = Array.isArray(raw.origin) ? (raw.origin as number[]) : [0, 0];
        const layer = makeLayer(typeof raw.name === 'string' ? raw.name : `layer ${layers.length + 1}`);
        layer.visible = raw.visible !== false;
        layer.grid = Grid.fromLines(raw.lines as string[], Number(origin[0]) || 0, Number(origin[1]) || 0);
        layers.push(layer);
      }
      if (layers.length) return levelOf(layers, legend);
    }

    // v2: pojedyncza mapa
    if (Array.isArray(o.lines) && (o.lines as unknown[]).every((l) => typeof l === 'string')) {
      const origin = Array.isArray(o.origin) ? (o.origin as number[]) : [0, 0];
      return single(Grid.fromLines(o.lines as string[], Number(origin[0]) || 0, Number(origin[1]) || 0), legend);
    }
    for (const key of ['map', 'data', 'rows']) {
      if (Array.isArray(o[key]) && (o[key] as unknown[]).every((l) => typeof l === 'string')) {
        return single(Grid.fromLines(o[key] as string[]));
      }
    }
    if (typeof o.tiles === 'string') return single(Grid.fromLines((o.tiles as string).split('\n')));
    if (Array.isArray(o.cells)) {
      const g = new Grid();
      for (const c of o.cells as Record<string, unknown>[]) {
        const ch = (c.ch ?? c.c ?? c.char) as string | undefined;
        if (typeof c.x === 'number' && typeof c.y === 'number' && typeof ch === 'string') {
          g.set(c.x, c.y, ch);
        }
      }
      if (!g.isEmpty()) return single(g);
    }
  }
  throw new Error('Unrecognized map format');
}
