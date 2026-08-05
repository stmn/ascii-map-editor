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
});
