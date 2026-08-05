// tests/project.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { parseProject, serializeProject } from '../src/core/project';

describe('project', () => {
  it('roundtrip v3: warstwy, widocznosc, origin, legenda', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(5, 7, '#');
    lv.legend.upsert('#', { name: 'wall', color: '#112233' });
    const l2 = makeLayer('deco', Grid.fromLines(['@'], 1, 1));
    l2.visible = false;
    lv.layers.push(l2);
    const back = parseProject(serializeProject(lv));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('main');
    expect(back.layers[0]!.grid.get(5, 7)).toBe('#');
    expect(back.layers[1]!.name).toBe('deco');
    expect(back.layers[1]!.visible).toBe(false);
    expect(back.layers[1]!.grid.get(1, 1)).toBe('@');
    expect(back.legend.get('#')!.name).toBe('wall');
  });

  it('importuje v2 jako jedna warstwe main z legenda', () => {
    const v2 = JSON.stringify({
      app: 'ascii-level-editor', version: 2, origin: [5, 7], lines: ['#@'],
      legend: [{ ch: '#', name: 'wall', color: '#888888' }],
    });
    const back = parseProject(v2);
    expect(back.layers).toHaveLength(1);
    expect(back.layers[0]!.name).toBe('main');
    expect(back.layers[0]!.grid.get(5, 7)).toBe('#');
    expect(back.layers[0]!.grid.get(6, 7)).toBe('@');
    expect(back.legend.get('#')!.name).toBe('wall');
  });

  it('importuje gola tablice stringow (v1)', () => {
    const back = parseProject(JSON.stringify(['###', '#.#']));
    expect(back.layers[0]!.grid.toLines()).toEqual(['###', '#.#']);
    expect(back.legend.entries()).toEqual([]);
  });

  it('importuje array-array (v1), pierwszy znak komorki', () => {
    const back = parseProject(JSON.stringify([['XX', ' '], ['.', '#']]));
    expect(back.layers[0]!.grid.toLines()).toEqual(['X', '.#']);
  });

  it('importuje {cells:[{x,y,c}]}', () => {
    const back = parseProject(JSON.stringify({ cells: [{ x: 0, y: 0, c: '#' }] }));
    expect(back.layers[0]!.grid.get(0, 0)).toBe('#');
  });

  it('importuje {map}/{data}/{rows}/{tiles}', () => {
    for (const key of ['map', 'data', 'rows']) {
      expect(parseProject(JSON.stringify({ [key]: ['#'] })).layers[0]!.grid.get(0, 0)).toBe('#');
    }
    expect(parseProject(JSON.stringify({ tiles: '#\n.' })).layers[0]!.grid.get(0, 1)).toBe('.');
  });

  it('importuje surowy tekst (v1 text)', () => {
    expect(parseProject('###\n#.#').layers[0]!.grid.toLines()).toEqual(['###', '#.#']);
  });

  it('odrzuca smieci i pusty string', () => {
    expect(() => parseProject('{"foo": 1}')).toThrow('Unrecognized map format');
    expect(() => parseProject('')).toThrow('Unrecognized map format');
  });

  it('v3: warstwa z nie-stringowymi lines jest pomijana, brak warstw -> rzuca', () => {
    expect(() => parseProject(JSON.stringify({ layers: [{ lines: [1, 2] }] })))
      .toThrow('Unrecognized map format');
  });

  it('v2: nie-stringowe lines nie przechodza jako mapa -> rzuca', () => {
    expect(() => parseProject(JSON.stringify({ lines: [1, 2] })))
      .toThrow('Unrecognized map format');
  });

  it('toleruje snieciete pola warstw v3', () => {
    const back = parseProject(JSON.stringify({
      app: 'ascii-level-editor', version: 3, legend: [],
      layers: [
        { lines: ['#'], visible: 'yes', origin: ['x', null] },
        { lines: 123 },
        { lines: ['@'] },
      ],
    }));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('layer 1');
    expect(back.layers[0]!.visible).toBe(true);
    expect(back.layers[0]!.grid.get(0, 0)).toBe('#');
    expect(back.layers[1]!.name).toBe('layer 2');
  });
});
