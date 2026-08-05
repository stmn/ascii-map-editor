import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { exportCsv, exportTxt } from '../src/export/text';

describe('text export', () => {
  const g = Grid.fromLines(['#.#', '.,.']);
  it('txt', () => {
    expect(exportTxt(g)).toBe('#.#\n.,.\n');
  });
  it('csv escapuje przecinek', () => {
    expect(exportCsv(g)).toBe('#,.,#\n.,",",.\n');
  });
  it('txt i csv z jawnym bounds (wyrownanie miedzy warstwami)', () => {
    const g = Grid.fromLines(['#'], 1, 0);
    const b = { minX: 0, minY: 0, maxX: 2, maxY: 1 };
    expect(exportTxt(g, b)).toBe(' #\n\n');
    expect(exportCsv(g, b)).toBe(',#,\n,,\n');
  });
});
