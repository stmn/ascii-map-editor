// tests/legend.test.ts
import { describe, expect, it } from 'vitest';
import { Legend, mergeLegendKeepingOld } from '../src/core/legend';

describe('Legend', () => {
  it('syncWith dodaje brakujace z auto-nazwami, nie kasuje', () => {
    const l = new Legend();
    l.upsert('#', { name: 'brick', color: '#ff0000' });
    l.syncWith(['#', '@']);
    expect(l.get('#')!.name).toBe('brick');
    expect(l.get('@')!.name).toBe('player');
    expect(l.entries()).toHaveLength(2);
  });

  it('nieznany znak dostaje nazwe tile_<ch> i kolor z palety', () => {
    const l = new Legend();
    l.syncWith(['%']);
    expect(l.get('%')!.name).toBe('tile_%');
    expect(l.get('%')!.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('mergeLegendKeepingOld', () => {
  it('znak ze starej legendy trzyma custom kolor, nowy znak dostaje paleta ze swiezej legendy', () => {
    const old = new Legend();
    old.upsert('#', { name: 'bricks', color: '#custom1' });

    const fresh = new Legend();
    fresh.syncWith(['#', 'X']); // tak wyglada legenda po dosyncowaniu wczytanego tekstu '#'+'X'

    const merged = mergeLegendKeepingOld(old, fresh);
    expect(merged.get('#')).toEqual({ ch: '#', name: 'bricks', color: '#custom1' });
    expect(merged.get('X')).toEqual(fresh.get('X'));
  });

  it('wpis starej legendy dla znaku nieobecnego na nowej mapie nie wraca', () => {
    const old = new Legend();
    old.upsert('~', { name: 'water', color: '#0000ff' });

    const fresh = new Legend();
    fresh.syncWith(['#']); // '~' nie jest uzyty w nowym poziomie

    const merged = mergeLegendKeepingOld(old, fresh);
    expect(merged.get('~')).toBeNull();
    expect(merged.entries().map((e) => e.ch)).toEqual(['#']);
  });
});
