import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { remapChar } from '../src/core/remap';

describe('remapChar', () => {
  function lvl() {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#.#']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['#'], 0, 1)));
    lv.legend.syncWith(['#', '.']);
    return lv;
  }

  it('przemapowuje komorki na wszystkich warstwach i wpis legendy', () => {
    const lv = lvl();
    const res = remapChar(lv, '#', 'X');
    expect(lv.layers[0]!.grid.toLines()).toEqual(['X.X']);
    expect(lv.layers[1]!.grid.get(0, 1)).toBe('X');
    expect(lv.legend.get('#')).toBeNull();
    expect(lv.legend.get('X')!.name).toBe('wall');
    expect(lv.legend.entries()[0]!.ch).toBe('X'); // pozycja wpisu zachowana
    expect(res.cells).toHaveLength(3);
    expect(res.cells.filter((c) => c.layerId === lv.layers[1]!.id)).toHaveLength(1);
  });

  it('odrzuca kolizje i zle znaki', () => {
    const lv = lvl();
    expect(() => remapChar(lv, '#', '.')).toThrow('Character already in use');
    expect(() => remapChar(lv, '#', 'XX')).toThrow('Invalid character');
    expect(() => remapChar(lv, '#', ' ')).toThrow('Invalid character');
  });

  it('kolizja ze znakiem obecnym tylko na mapie (bez legendy) tez odrzucona', () => {
    const lv = lvl();
    lv.layers[0]!.grid.set(9, 9, 'Z');
    expect(() => remapChar(lv, '#', 'Z')).toThrow('Character already in use');
  });
});
