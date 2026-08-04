// tests/project.test.ts
import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { parseProject, serializeProject } from '../src/core/project';

describe('project', () => {
  it('roundtrip v2 z legenda i originem', () => {
    const g = Grid.fromLines(['#@'], 5, 7);
    const json = serializeProject(g, [{ ch: '#', name: 'wall', color: '#888888' }]);
    const back = parseProject(json);
    expect(back.grid.get(5, 7)).toBe('#');
    expect(back.grid.get(6, 7)).toBe('@');
    expect(back.legend[0]!.name).toBe('wall');
  });

  it('importuje gola tablice stringow (v1)', () => {
    const back = parseProject(JSON.stringify(['###', '#.#']));
    expect(back.grid.toLines()).toEqual(['###', '#.#']);
    expect(back.legend).toEqual([]);
  });

  it('importuje {cells:[{x,y,c}]}', () => {
    const back = parseProject(JSON.stringify({ cells: [{ x: 0, y: 0, c: '#' }] }));
    expect(back.grid.get(0, 0)).toBe('#');
  });

  it('odrzuca smieci', () => {
    expect(() => parseProject('{"foo": 1}')).toThrow('Unrecognized map format');
  });

  it('importuje array-array format (v1)', () => {
    const back = parseProject(JSON.stringify([['#', '#'], ['#', '.']]));
    expect(back.grid.toLines()).toEqual(['##', '#.']);
    expect(back.legend).toEqual([]);
  });

  it('importuje array-array z wieloznakowych celek (first-char mapping)', () => {
    const back = parseProject(JSON.stringify([['XX', ' '], ['.', '#']]));
    expect(back.grid.toLines()).toEqual(['X', '.#']);
  });

  it('importuje surowy tekst (v1 text format)', () => {
    const back = parseProject('###\n#.#');
    expect(back.grid.toLines()).toEqual(['###', '#.#']);
    expect(back.legend).toEqual([]);
  });

  it('odrzuca pusty tekst', () => {
    expect(() => parseProject('')).toThrow('Unrecognized map format');
  });

  it('importuje {map:[...]}', () => {
    const back = parseProject(JSON.stringify({ map: ['##', '..'] }));
    expect(back.grid.toLines()).toEqual(['##', '..']);
  });

  it('importuje {data:[...]}', () => {
    const back = parseProject(JSON.stringify({ data: ['#.', '.#'] }));
    expect(back.grid.toLines()).toEqual(['#.', '.#']);
  });

  it('importuje {rows:[...]}', () => {
    const back = parseProject(JSON.stringify({ rows: ['##', '#.'] }));
    expect(back.grid.toLines()).toEqual(['##', '#.']);
  });

  it('importuje {tiles:"..\n.."}', () => {
    const back = parseProject(JSON.stringify({ tiles: '..\n..' }));
    expect(back.grid.toLines()).toEqual(['..', '..']);
  });
});
