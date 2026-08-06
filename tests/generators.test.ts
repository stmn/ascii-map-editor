import { describe, expect, it } from 'vitest';
import { generateDungeon, generateMaze, mulberry32 } from '../src/core/generators';

describe('generators', () => {
  it('maze: wymiary, S i E, wszystko osiagalne', () => {
    const g = generateMaze(15, 11, mulberry32(1));
    const lines = g.toLines();
    expect(lines).toHaveLength(11);
    const flat = lines.join('\n');
    expect(flat).toContain('S');
    expect(flat).toContain('E');
    // BFS od S musi dojsc do E
    const rows = lines.map((l) => l.padEnd(15, ' ').split(''));
    const find = (c: string) => {
      for (let y = 0; y < rows.length; y++) {
        const x = rows[y]!.indexOf(c);
        if (x >= 0) return [x, y] as const;
      }
      throw new Error('not found');
    };
    const [sx, sy] = find('S');
    const [ex, ey] = find('E');
    const seen = new Set([`${sx},${sy}`]);
    const queue: Array<[number, number]> = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        const c = rows[ny]?.[nx];
        if ((c === '.' || c === 'E') && !seen.has(`${nx},${ny}`)) {
          seen.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
    }
    expect(seen.has(`${ex},${ey}`)).toBe(true);
  });

  it('dungeon: deterministyczny dla seeda i ma podloge', () => {
    const a = generateDungeon(40, 24, 30, mulberry32(7)).toLines();
    const b = generateDungeon(40, 24, 30, mulberry32(7)).toLines();
    expect(a).toEqual(b);
    expect(a.join('')).toContain('.');
  });

  // Jedna proba pokoju przy min === max daje DOKLADNIE jeden prostokat podlogi o tym boku,
  // wiec sama liczba komorek '.' dowodzi, ze oba konce zakresu trafiaja do losowania.
  it('dungeon: bok pokoju trzyma sie zadanego min/max', () => {
    for (const size of [3, 5, 7]) {
      const g = generateDungeon(40, 24, 1, mulberry32(5), size, size);
      const floors = [...g.cells()].filter((c) => c.ch === '.').length;
      expect(floors).toBe(size * size);
    }
  });

  // Przy min < max jedna proba pokoju daje jeden prostokat podlogi, wiec jego obrys to wprost
  // wylosowane boki. Sprawdzamy i zakres, i to, ze OBIE granice sa osiagalne - inkluzywna gorna
  // granica jest latwa do zgubienia (ri z ta sama arytmetyka bez '+ 1' nigdy nie zwroci hi).
  it('dungeon: przy min < max boki pokoju mieszcza sie w [min, max] i siegaja obu koncow', () => {
    const lo = 3, hi = 6;
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const cells = [...generateDungeon(60, 40, 1, mulberry32(seed), lo, hi).cells()]
        .filter((c) => c.ch === '.');
      const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
      const rw = Math.max(...xs) - Math.min(...xs) + 1;
      const rh = Math.max(...ys) - Math.min(...ys) + 1;
      for (const side of [rw, rh]) {
        expect(side).toBeGreaterThanOrEqual(lo);
        expect(side).toBeLessThanOrEqual(hi);
        seen.add(side);
      }
    }
    expect(seen.has(lo)).toBe(true);
    expect(seen.has(hi)).toBe(true);
  });

  it('dungeon: custom min/max jest deterministyczny i ma podloge', () => {
    const a = generateDungeon(50, 30, 25, mulberry32(11), 5, 9).toLines();
    const b = generateDungeon(50, 30, 25, mulberry32(11), 5, 9).toLines();
    expect(a).toEqual(b);
    expect(a.join('')).toContain('.');
  });

  it('dungeon: odwrocone min/max daje to samo co poprawna kolejnosc', () => {
    const a = generateDungeon(40, 24, 30, mulberry32(9), 4, 8).toLines();
    const b = generateDungeon(40, 24, 30, mulberry32(9), 8, 4).toLines();
    expect(a).toEqual(b);
  });
});
