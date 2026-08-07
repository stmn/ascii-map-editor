import { describe, expect, it } from 'vitest';
import { createLevel, makeLayer } from '../src/core/level';
import { Grid } from '../src/core/grid';
import { serializeProject } from '../src/core/project';
import { buildXpBytes } from '../src/export/rexpaint';
import { detectImport } from '../src/core/importDetect';

describe('detectImport', () => {
  it('xp bytes -> level, summary z realnych wymiarow i liczby warstw', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@', '..']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 1, 1)));
    const bytes = buildXpBytes(lv);

    const detected = detectImport(bytes);
    expect(detected.kind).toBe('level');
    if (detected.kind !== 'level') throw new Error('unreachable');
    expect(detected.level.layers).toHaveLength(2);
    expect(detected.summary).toBe('Level 2x2, 2 layers');
    // .xp niesie wlasne kolory - to jawna legenda
    expect(detected.explicitLegend).toBe(true);
  });

  it('project v1 (plik pojedynczego projektu) -> project', () => {
    const levels = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i + 1}`, projectId: 'x', name: `L${i + 1}`, order: i + 1, data: '{}', thumb: null, updatedAt: 1,
    }));
    const json = JSON.stringify({
      app: 'ascii-level-editor-project',
      version: 1,
      project: { name: 'Dungeon' },
      levels,
    });

    const detected = detectImport(json);
    expect(detected).toEqual({
      kind: 'project', name: 'Dungeon', levels: 5, json, summary: "Project 'Dungeon', 5 levels",
    });
  });

  it('project v1 z jednym poziomem -> liczba pojedyncza "1 level"', () => {
    const json = JSON.stringify({
      app: 'ascii-level-editor-project',
      version: 1,
      project: { name: 'Solo' },
      levels: [{ id: 'l1', projectId: 'x', name: 'L1', order: 1, data: '{}', thumb: null, updatedAt: 1 }],
    });

    const detected = detectImport(json);
    expect(detected).toEqual({
      kind: 'project', name: 'Solo', levels: 1, json, summary: "Project 'Solo', 1 level",
    });
  });

  it('legacy workspace -> projects', () => {
    const json = JSON.stringify({
      app: 'ascii-level-editor-workspace',
      version: 1,
      projects: [
        { id: 'p1', name: 'Alpha', createdAt: 1, updatedAt: 1 },
        { id: 'p2', name: 'Beta', createdAt: 1, updatedAt: 1 },
      ],
      levels: [
        { id: 'l1', projectId: 'p1', name: 'L1', order: 1, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l2', projectId: 'p1', name: 'L2', order: 2, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l3', projectId: 'p1', name: 'L3', order: 3, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l4', projectId: 'p2', name: 'L4', order: 1, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l5', projectId: 'p2', name: 'L5', order: 2, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l6', projectId: 'p2', name: 'L6', order: 3, data: '{}', thumb: null, updatedAt: 1 },
        { id: 'l7', projectId: 'p2', name: 'L7', order: 4, data: '{}', thumb: null, updatedAt: 1 },
      ],
    });

    const detected = detectImport(json);
    expect(detected).toEqual({
      kind: 'projects', projects: 2, levels: 7, json, summary: '2 projects, 7 levels',
    });
  });

  it('level v3 json -> level, summary z union bounds warstw', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    lv.layers[0]!.grid.set(23, 11, '#');
    lv.layers.push(makeLayer('l2'));
    lv.layers.push(makeLayer('l3'));
    const json = serializeProject(lv);

    const detected = detectImport(json);
    expect(detected.kind).toBe('level');
    if (detected.kind !== 'level') throw new Error('unreachable');
    expect(detected.level.layers).toHaveLength(3);
    expect(detected.summary).toBe('Level 24x12, 3 layers');
    // serializeProject zawsze pisze pole "legend" - v3 json niesie jawna legende
    expect(detected.explicitLegend).toBe(true);
  });

  it('v1 array-text (gola tablica stringow) -> level, liczba pojedyncza "1 layer"', () => {
    const json = JSON.stringify(['#####', '#...#', '#####']);

    const detected = detectImport(json);
    expect(detected.kind).toBe('level');
    if (detected.kind !== 'level') throw new Error('unreachable');
    expect(detected.level.layers).toHaveLength(1);
    expect(detected.summary).toBe('Level 5x3, 1 layer');
    expect(detected.explicitLegend).toBe(false);
  });

  it('surowy tekst (v1 plain text) -> level', () => {
    const detected = detectImport('##\n#.');
    expect(detected.kind).toBe('level');
    if (detected.kind !== 'level') throw new Error('unreachable');
    expect(detected.summary).toBe('Level 2x2, 1 layer');
    expect(detected.explicitLegend).toBe(false);
  });

  it('smieci -> throw Unrecognized import data', () => {
    expect(() => detectImport('{"foo": 1}')).toThrow('Unrecognized import data');
    expect(() => detectImport('')).toThrow('Unrecognized import data');
  });
});
