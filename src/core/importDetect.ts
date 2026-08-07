// Detekcja typu wklejonych/wczytanych danych importu (plik albo wklejony tekst) + gotowe,
// czytelne dla czlowieka podsumowanie - dialog Import pokazuje co rozpoznal PRZED faktycznym
// importem (dopiero potem realny import projektu idzie przez importProject w store.ts).
import { Legend } from './legend';
import { Level, makeLayer, unionBounds } from './level';
import { parseProject } from './project';
import { parseProjectFile } from './store';
import { parseXpBytes } from '../export/rexpaint';

export type DetectedImport =
  // explicitLegend: czy zrodlo nioslo WLASNA legende (v2/v3 json pole "legend", albo kolory
  // wczytane z pliku .xp) - Replace current level (importModal.ts) uzywa tego, zeby wiedziec czy
  // wolno scalic ja ze STARA legenda uzytkownika, czy plikowa legenda ma wygrac w calosci
  | { kind: 'level'; level: Level; explicitLegend: boolean; summary: string }
  | { kind: 'project'; name: string; levels: number; json: string; summary: string }
  | { kind: 'projects'; projects: number; levels: number; json: string; summary: string };

// liczba pojedyncza dla 1, w przeciwnym razie mnoga z 's' - uzywane tylko tam, gdzie brief
// tego wymaga (level/project); podsumowanie legacy-workspace ma stala forme mnoga (patrz nizej)
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function levelSummary(level: Level): string {
  const b = unionBounds(level.layers);
  const w = b ? b.maxX - b.minX + 1 : 0;
  const h = b ? b.maxY - b.minY + 1 : 0;
  return `Level ${w}x${h}, ${plural(level.layers.length, 'layer')}`;
}

/**
 * Uint8Array MUSI byc juz zdekompresowana (surowy layout .xp) - gzip z dysku rozpakowuje
 * wolajacy PRZED wywolaniem (patrz decompressXpBytes w export/rexpaint.ts i importModal.ts).
 */
export function detectImport(payload: string | Uint8Array): DetectedImport {
  if (payload instanceof Uint8Array) {
    const { layers, colors } = parseXpBytes(payload);
    const level: Level = { layers: layers.map((l) => makeLayer(l.name, l.grid)), legend: new Legend() };
    for (const [ch, hex] of colors) level.legend.upsert(ch, { color: hex });
    // .xp niesie wlasne kolory komorek - to jawna legenda, tak samo jak pole "legend" w v2/v3 json
    return { kind: 'level', level, explicitLegend: true, summary: levelSummary(level) };
  }

  // krok 1: naglowek project-v1 / legacy-workspace - ta sama sciezka rozpoznania co importProject
  const header = parseProjectFile(payload);
  if (header) {
    if (header.kind === 'workspace') {
      const { projects, levels } = header.file;
      return {
        kind: 'projects',
        projects: projects.length,
        levels: levels.length,
        json: payload,
        summary: `${projects.length} projects, ${levels.length} levels`,
      };
    }
    const { project, levels } = header.file;
    return {
      kind: 'project',
      name: project.name,
      levels: levels.length,
      json: payload,
      summary: `Project '${project.name}', ${plural(levels.length, 'level')}`,
    };
  }

  // krok 2: level.json (v3/v2/v1 - warianty tablicowe, plain text) przez tolerancyjny parseProject
  try {
    const { level, explicitLegend } = parseProject(payload);
    return { kind: 'level', level, explicitLegend, summary: levelSummary(level) };
  } catch {
    throw new Error('Unrecognized import data');
  }
}
