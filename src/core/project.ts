import { Grid } from './grid';
import { Legend } from './legend';
import type { LegendEntry } from './legend';
import { Layer, Level, levelUsedChars, makeLayer } from './level';

export type { LegendEntry };

/**
 * Zwrot parseProject: level plus flaga, czy zrodlo NIOSLO wlasna legende (pole "legend" w v2/v3
 * json). Wolajacy potrzebuje tej flagi, zeby wiedziec czy plikowa legenda ma wygrac w calosci, czy
 * wolno scalic ja ze STARA legenda uzytkownika (patrz mergeLegendKeepingOld w legend.ts,
 * uzywane przez Replace current level w importModal.ts).
 */
export interface ParsedLevel { level: Level; explicitLegend: boolean }

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

/**
 * Jedyna sciezka konczaca parseProject (kazdy return leci tedy): dopelnia legende o uzyte znaki
 * (auto-paleta dla nowych) NIEZALEZNIE od explicitLegend - plik z wlasna legenda tez moze uzywac
 * znaku, ktorego w niej nie ma. Bez tego dosyncowania kazde zrodlo bez jawnej legendy (plain text,
 * v1 array-text/array-array, warianty map/rows/tiles/cells) wracalo z PUSTA legenda - to byl bug
 * "po Load mapa traci kolory".
 */
function finish(level: Level, explicitLegend: boolean): ParsedLevel {
  level.legend.syncWith(levelUsedChars(level));
  return { level, explicitLegend };
}

// tolerancyjny odczyt: v3 + v2 + znane warianty v1/obce
export function parseProject(json: string): ParsedLevel {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    // format tekstowy v1: surowy tekst z liniami oddzielonymi newline - bez jawnej legendy
    if (json.trim().length === 0) {
      throw new Error('Unrecognized map format');
    }
    const lines = json.split('\n').map((line) => line.replace(/\r$/, ''));
    return finish(single(Grid.fromLines(lines, 0, 0)), false);
  }

  if (Array.isArray(data) && data.every((l) => typeof l === 'string')) {
    return finish(single(Grid.fromLines(data as string[])), false);
  }

  // format array-array v1: tablica tablic znakow - bez jawnej legendy
  if (Array.isArray(data) && data.every((row) => Array.isArray(row) && (row as unknown[]).every((cell) => typeof cell === 'string'))) {
    const lines = (data as string[][]).map((row) => row.map((cell) => (cell || ' ')[0]).join(''));
    return finish(single(Grid.fromLines(lines)), false);
  }

  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    // jawna legenda = pole "legend" faktycznie obecne w pliku (nawet puste []) - to ODROZNIA
    // v2/v3 json od wariantow ponizej (map/data/rows/tiles/cells), ktore go nigdy nie znaja
    const explicitLegend = Array.isArray(o.legend);
    const legend = explicitLegend ? (o.legend as LegendEntry[]) : [];

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
      if (layers.length) return finish(levelOf(layers, legend), explicitLegend);
    }

    // v2: pojedyncza mapa
    if (Array.isArray(o.lines) && (o.lines as unknown[]).every((l) => typeof l === 'string')) {
      const origin = Array.isArray(o.origin) ? (o.origin as number[]) : [0, 0];
      return finish(
        single(Grid.fromLines(o.lines as string[], Number(origin[0]) || 0, Number(origin[1]) || 0), legend),
        explicitLegend,
      );
    }
    for (const key of ['map', 'data', 'rows']) {
      if (Array.isArray(o[key]) && (o[key] as unknown[]).every((l) => typeof l === 'string')) {
        return finish(single(Grid.fromLines(o[key] as string[])), false);
      }
    }
    if (typeof o.tiles === 'string') return finish(single(Grid.fromLines((o.tiles as string).split('\n'))), false);
    if (Array.isArray(o.cells)) {
      const g = new Grid();
      for (const c of o.cells as Record<string, unknown>[]) {
        const ch = (c.ch ?? c.c ?? c.char) as string | undefined;
        if (typeof c.x === 'number' && typeof c.y === 'number' && typeof ch === 'string') {
          g.set(c.x, c.y, ch);
        }
      }
      if (!g.isEmpty()) return finish(single(g), false);
    }
  }
  throw new Error('Unrecognized map format');
}
