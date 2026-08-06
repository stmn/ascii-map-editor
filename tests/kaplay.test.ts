import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportKaplay } from '../src/export/kaplay';

describe('kaplay export', () => {
  it('brak siatki zrodlowej -> jeden addLevel z flatten widocznych warstw (top-wins)', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~~'])));
    const ukryta = makeLayer('ukryta', Grid.fromLines(['ZZ']));
    ukryta.visible = false;
    lv.layers.push(ukryta);
    lv.legend.syncWith(['#', '@', '~', 'Z']);
    const out = exportKaplay(lv);
    expect(out).toContain('const tiles = {');
    expect(out).toContain('"#": () => [sprite("wall")]');
    expect((out.match(/addLevel\(/g) ?? []).length).toBe(1);
    expect(out).not.toContain('// layer:');
    expect(out).not.toContain('ukryta');
    // deco jest wyzej niz main -> nakrywa (0,0) i (1,0)
    expect(out).toContain('"~~"');
    expect(out).not.toContain('"#@"');
  });

  it('przekazana siatka zrodlowa (np. aktywna warstwa) -> eksport tylko z niej, jej wlasny bounds', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~~'])));
    lv.legend.syncWith(['#', '@', '~']);
    const active = lv.layers[0]!.grid;
    const out = exportKaplay(lv, active);
    expect((out.match(/addLevel\(/g) ?? []).length).toBe(1);
    expect(out).toContain('"#@"');
    expect(out).not.toContain('"~~"');
  });
});
