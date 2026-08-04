import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportGodot } from '../src/export/godot';

describe('godot export', () => {
  it('snippet zawiera LEVEL, TILES i set_cell', () => {
    const g = Grid.fromLines(['#@']);
    const l = new Legend();
    l.syncWith(g.usedChars());
    const out = exportGodot(g, l);
    expect(out).toContain('const LEVEL = [');
    expect(out).toContain('"#@"');
    expect(out).toContain('"#": Vector2i(0, 0)');
    expect(out).toContain('"@": Vector2i(1, 0)');
    expect(out).toContain('set_cell(Vector2i(x, y)');
  });
});
