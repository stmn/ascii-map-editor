import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportKaplay } from '../src/export/kaplay';

describe('kaplay export', () => {
  it('generuje addLevel ze stringami i tiles z legendy', () => {
    const g = Grid.fromLines(['#@']);
    const l = new Legend();
    l.syncWith(g.usedChars());
    const out = exportKaplay(g, l);
    expect(out).toContain('addLevel([');
    expect(out).toContain('"#@"');
    expect(out).toContain('"#": () => [sprite("wall")');
    expect(out).toContain('"@": () => [sprite("player")');
  });
});
