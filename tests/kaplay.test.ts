import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportKaplay } from '../src/export/kaplay';

describe('kaplay export', () => {
  it('addLevel per widoczna warstwa, linie padowane do union bounds', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 2, 0)));
    const ukryta = makeLayer('ukryta', Grid.fromLines(['Z']));
    ukryta.visible = false;
    lv.layers.push(ukryta);
    lv.legend.syncWith(['#', '@', '~', 'Z']);
    const out = exportKaplay(lv);
    expect(out).toContain('const tiles = {');
    expect(out).toContain('"#": () => [sprite("wall")]');
    expect(out).toContain('// layer: main');
    expect(out).toContain('"#@ "');
    expect(out).toContain('// layer: deco');
    expect(out).toContain('"  ~"');
    expect(out).not.toContain('ukryta');
    expect((out.match(/addLevel\(/g) ?? []).length).toBe(2);
  });
});
