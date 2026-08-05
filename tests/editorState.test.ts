import { describe, expect, it } from 'vitest';
import { footprintBounds, forEachFootprintCell } from '../src/core/editorState';

/** Zebrane komorki stopki - kolejnosc wierszami, zeby test pilnowal tez przebiegu. */
function cells(cx: number, cy: number, size: number): string[] {
  const out: string[] = [];
  forEachFootprintCell(cx, cy, size, (x, y) => out.push(`${x},${y}`));
  return out;
}

describe('footprint pedzla', () => {
  it('rozmiar 1 to sama komorka kursora', () => {
    expect(footprintBounds(4, 7, 1)).toEqual({ minX: 4, minY: 7, maxX: 4, maxY: 7 });
    expect(cells(4, 7, 1)).toEqual(['4,7']);
  });

  it('rozmiar 2 rozrasta sie w prawo i w dol', () => {
    expect(footprintBounds(4, 7, 2)).toEqual({ minX: 4, minY: 7, maxX: 5, maxY: 8 });
    expect(cells(4, 7, 2)).toEqual(['4,7', '5,7', '4,8', '5,8']);
  });

  it('rozmiar 3 jest wysrodkowany na kursorze', () => {
    expect(footprintBounds(0, 0, 3)).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
    expect(cells(0, 0, 3)).toEqual([
      '-1,-1', '0,-1', '1,-1',
      '-1,0', '0,0', '1,0',
      '-1,1', '0,1', '1,1',
    ]);
  });

  it('rozmiary 4 i 5 daja 16 i 25 komorek', () => {
    expect(footprintBounds(0, 0, 4)).toEqual({ minX: -1, minY: -1, maxX: 2, maxY: 2 });
    expect(cells(0, 0, 4)).toHaveLength(16);
    expect(footprintBounds(0, 0, 5)).toEqual({ minX: -2, minY: -2, maxX: 2, maxY: 2 });
    expect(cells(0, 0, 5)).toHaveLength(25);
  });

  it('rozmiar ponizej 1 nie znika - schodzi do jednej komorki', () => {
    expect(cells(3, 3, 0)).toEqual(['3,3']);
  });
});
