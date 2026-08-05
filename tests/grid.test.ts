import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';

describe('Grid', () => {
  it('set/get/erase', () => {
    const g = new Grid();
    g.set(2, 3, '#');
    expect(g.get(2, 3)).toBe('#');
    g.set(2, 3, ' ');
    expect(g.get(2, 3)).toBeNull();
    expect(g.isEmpty()).toBe(true);
  });

  it('bounds i toLines wycinaja prostokat', () => {
    const g = new Grid();
    g.set(1, 1, '#');
    g.set(3, 2, '@');
    expect(g.bounds()).toEqual({ minX: 1, minY: 1, maxX: 3, maxY: 2 });
    expect(g.toLines()).toEqual(['#', '  @']);
  });

  it('fromLines -> toLines roundtrip', () => {
    const g = Grid.fromLines(['###', '# #', '###']);
    expect(g.toLines()).toEqual(['###', '# #', '###']);
    expect(g.usedChars()).toEqual(['#']);
  });

  it('toLines z jawnym bounds: dokladny prostokat bez trimu', () => {
    const g = Grid.fromLines(['#']);
    expect(g.toLines({ minX: 0, minY: 0, maxX: 2, maxY: 1 })).toEqual(['#  ', '   ']);
  });
});
