// tests/legend.test.ts
import { describe, expect, it } from 'vitest';
import { Legend } from '../src/core/legend';

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
