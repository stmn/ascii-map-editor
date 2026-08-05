import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportTmx } from '../src/export/tiled';

describe('tmx export', () => {
  it('dwie warstwy, wspolne wymiary, visible=0 dla ukrytej', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@', '# ']);
    const deco = makeLayer('deco', Grid.fromLines(['~'], 1, 1));
    deco.visible = false;
    lv.layers.push(deco);
    lv.legend.syncWith(['#', '@', '~']); // '#'=gid1, '@'=gid2, '~'=gid3
    const xml = exportTmx(lv);
    expect(xml).toContain('<map version="1.10"');
    expect(xml).toContain('width="2" height="2"');
    expect(xml).toContain('tilecount="3"');
    expect(xml).toContain('<layer id="1" name="main" width="2" height="2">');
    expect(xml).toContain('<layer id="2" name="deco" width="2" height="2" visible="0">');
    const norm = xml.replace(/\s+/g, ' ');
    expect(norm).toContain('1,2, 1,0'); // main
    expect(norm).toContain('0,0, 0,3'); // deco: ~ na (1,1)
    expect(xml).toContain('value="wall"');
  });
});
