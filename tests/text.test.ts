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
});
