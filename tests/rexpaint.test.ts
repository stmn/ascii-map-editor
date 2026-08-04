import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Grid } from '../src/core/grid';
import { Legend } from '../src/core/legend';
import { buildXpBytes, parseXpBytes } from '../src/export/rexpaint';

describe('rexpaint xp', () => {
  it('roundtrip build -> parse', () => {
    const g = Grid.fromLines(['#@', ' .']);
    const l = new Legend();
    l.upsert('#', { color: '#ff0000' });
    l.syncWith(g.usedChars());
    const bytes = buildXpBytes(g, l);
    const back = parseXpBytes(bytes);
    expect(back.grid.toLines()).toEqual(['#@', ' .']);
    expect(back.colors.get('#')).toBe('#ff0000');
  });

  it('layout binarny: naglowek i column-major', () => {
    const g = Grid.fromLines(['#']);
    const l = new Legend(); l.syncWith(['#']);
    const v = new DataView(buildXpBytes(g, l).buffer);
    expect(v.getInt32(0, true)).toBe(-1);  // version
    expect(v.getInt32(4, true)).toBe(1);   // layers
    expect(v.getInt32(8, true)).toBe(1);   // width
    expect(v.getInt32(12, true)).toBe(1);  // height
    expect(v.getInt32(16, true)).toBe('#'.charCodeAt(0));
  });

  it('gzip roundtrip przez node zlib odpowiada formatowi pliku', () => {
    const g = Grid.fromLines(['#']);
    const l = new Legend(); l.syncWith(['#']);
    const bytes = buildXpBytes(g, l);
    const back = parseXpBytes(new Uint8Array(gunzipSync(gzipSync(bytes))));
    expect(back.grid.toLines()).toEqual(['#']);
  });
});
