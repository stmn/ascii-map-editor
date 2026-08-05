import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { buildXpBytes, parseXpBytes } from '../src/export/rexpaint';

function level1(lines: string[], color?: string) {
  const lv = createLevel();
  lv.layers[0]!.grid = Grid.fromLines(lines);
  if (color) lv.legend.upsert(lines.join('').trim()[0]!, { color });
  lv.legend.syncWith(lv.layers[0]!.grid.usedChars());
  return lv;
}

describe('rexpaint xp', () => {
  it('roundtrip 2 warstwy: siatki, wspolne wymiary, kolory', () => {
    const lv = level1(['#@', ' .'], '#ff0000');
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 1, 1)));
    lv.legend.syncWith(['~']);
    const back = parseXpBytes(buildXpBytes(lv));
    expect(back.layers).toHaveLength(2);
    expect(back.layers[0]!.name).toBe('layer 1');
    expect(back.layers[0]!.grid.toLines()).toEqual(['#@', ' .']);
    expect(back.layers[1]!.grid.get(1, 1)).toBe('~');
    expect(back.colors.get('#')).toBe('#ff0000');
  });

  it('layout binarny: naglowek i layerCount', () => {
    const lv = level1(['#']);
    lv.layers.push(makeLayer('b', Grid.fromLines(['@'])));
    const bytes = buildXpBytes(lv);
    const v = new DataView(bytes.buffer);
    expect(v.getInt32(0, true)).toBe(-1);              // version
    expect(v.getInt32(4, true)).toBe(2);               // layers
    expect(v.getInt32(8, true)).toBe(1);               // w warstwy 1
    expect(v.getInt32(12, true)).toBe(1);              // h warstwy 1
    expect(v.getInt32(16, true)).toBe('#'.charCodeAt(0));
    expect(v.getInt32(26, true)).toBe(1);              // w warstwy 2 (offset 16+10)
    expect(bytes.byteLength).toBe(8 + 2 * (8 + 10));
  });

  it('gzip roundtrip przez node zlib', () => {
    const lv = level1(['#']);
    const back = parseXpBytes(new Uint8Array(gunzipSync(gzipSync(buildXpBytes(lv)))));
    expect(back.layers[0]!.grid.toLines()).toEqual(['#']);
  });

  it('odrzuca uszkodzone pliki', () => {
    expect(() => parseXpBytes(new Uint8Array(4))).toThrow('Not a valid .xp file');
    const bad = new Uint8Array(8 + 8);
    const v = new DataView(bad.buffer);
    v.setInt32(0, -1, true); v.setInt32(4, 99, true);  // absurdalny layerCount
    expect(() => parseXpBytes(bad)).toThrow('Not a valid .xp file');
    const trunc = new Uint8Array(8 + 8);
    const v2 = new DataView(trunc.buffer);
    v2.setInt32(0, -1, true); v2.setInt32(4, 1, true);
    v2.setInt32(8, 1000, true); v2.setInt32(12, 1000, true); // deklaruje wiecej niz bufor
    expect(() => parseXpBytes(trunc)).toThrow('Not a valid .xp file');
  });
});
