import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { exportTmx } from '../src/export/tiled';

describe('tmx export', () => {
  it('mapa 2x2 z pusta komorka', () => {
    const g = Grid.fromLines(['#@', '# ']);
    const l = new Legend();
    l.syncWith(g.usedChars()); // '#'=gid1, '@'=gid2
    const xml = exportTmx(g, l);
    expect(xml).toContain('<map version="1.10"');
    expect(xml).toContain('width="2" height="2"');
    expect(xml).toContain('tilecount="2"');
    // wiersz1: #(1),@(2); wiersz2: #(1),puste(0)
    expect(xml.replace(/\s+/g, ' ')).toContain('1,2, 1,0');
    expect(xml).toContain('value="wall"');
  });
});
