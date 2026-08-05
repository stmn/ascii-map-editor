import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { MAX_LAYERS, createLevel, flattenLayers, levelUsedChars, makeLayer, unionBounds } from '../src/core/level';

describe('Level', () => {
  it('createLevel ma jedna widoczna warstwe main', () => {
    const lv = createLevel();
    expect(lv.layers).toHaveLength(1);
    expect(lv.layers[0]!.name).toBe('main');
    expect(lv.layers[0]!.visible).toBe(true);
    expect(lv.layers[0]!.grid.isEmpty()).toBe(true);
    expect(MAX_LAYERS).toBe(8);
  });

  it('unionBounds obejmuje wszystkie warstwy, takze niewidoczne', () => {
    const a = makeLayer('a', Grid.fromLines(['#'], 0, 0));
    const b = makeLayer('b', Grid.fromLines(['@'], 5, 3));
    b.visible = false;
    expect(unionBounds([a, b])).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 3 });
    expect(unionBounds([makeLayer('pusta')])).toBeNull();
  });

  it('flattenLayers: gorna widoczna wygrywa, niewidoczne pomijane', () => {
    const dol = makeLayer('dol', Grid.fromLines(['ab']));
    const gora = makeLayer('gora', Grid.fromLines(['X']));
    const ukryta = makeLayer('ukryta', Grid.fromLines(['ZZZ']));
    ukryta.visible = false;
    const flat = flattenLayers([dol, gora, ukryta]);
    expect(flat.get(0, 0)).toBe('X');
    expect(flat.get(1, 0)).toBe('b');
    expect(flat.get(2, 0)).toBeNull();
  });

  it('levelUsedChars sumuje warstwy', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    lv.layers.push(makeLayer('l2', Grid.fromLines(['@'])));
    expect(levelUsedChars(lv)).toEqual(['#', '@']);
  });

  it('levelUsedChars obejmuje niewidoczne warstwy', () => {
    const lv = createLevel();
    lv.layers[0]!.grid.set(0, 0, '#');
    const ukryta = makeLayer('u', Grid.fromLines(['@']));
    ukryta.visible = false;
    lv.layers.push(ukryta);
    expect(levelUsedChars(lv)).toEqual(['#', '@']);
  });
});
