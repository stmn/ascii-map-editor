import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { exportLegacy } from '../src/export/legacy';

describe('legacy export', () => {
  const g = Grid.fromLines(['#@', '# ']);
  it('text: linie joinowane, bez trailing spaces', () => {
    expect(exportLegacy(g, 'text')).toBe('#@\n#');
  });
  it('array-text: JSON tablicy stringow z wcieciem jak v1', () => {
    expect(exportLegacy(g, 'array-text')).toBe(JSON.stringify(['#@', '#'], null, '  '));
  });
  it('array-array: dokladny prostokat z paddingiem', () => {
    expect(exportLegacy(g, 'array-array')).toBe(JSON.stringify([['#', '@'], ['#', ' ']]));
  });
  it('jawny bounds rozszerza prostokat', () => {
    expect(exportLegacy(g, 'array-array', { minX: 0, minY: 0, maxX: 2, maxY: 0 }))
      .toBe(JSON.stringify([['#', '@', ' ']]));
  });
});
