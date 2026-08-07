import { describe, expect, it } from 'vitest';
import { generateDungeon, generateDungeonDetailed, generateMaze, mulberry32 } from '../src/core/generators';

// Cala testowa paczka zostala przepisana pod v2.10: dungeon i maze to teraz porty algorytmow
// z v1 (BSP dla lochu, recursive division dla labiryntu - patrz naglowek generators.ts), calkowicie
// zastepujace poprzednia implementacje (losowe nienakladajace sie prostokaty dla lochu, recursive
// backtracker z S/E dla labiryntu). Stary golden test (roomTries, seed 7) zostal USUNIETY swiadomie
// - inny algorytm daje inny wynik z definicji, wiec "zamrozenie starego wyniku" nie ma juz sensu.

describe('maze (recursive division, port z v1 MazeGenerator.js)', () => {
  it('wymiary: 2*floor(w/2)+1 x 2*floor(h/2)+1 (parzyste wejscie daje wiekszy nieparzysty wynik)', () => {
    for (const [w, h] of [[40, 24], [41, 25], [15, 11], [16, 12]] as const) {
      const lines = generateMaze(w, h, mulberry32(1)).toLines();
      expect(lines).toHaveLength(2 * Math.floor(h / 2) + 1);
      for (const line of lines) expect(line).toHaveLength(2 * Math.floor(w / 2) + 1);
    }
  });

  it('zawiera dokladnie 2 "D" (drzwi gora + dol)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const flat = generateMaze(40, 24, mulberry32(seed)).toLines().join('');
      expect(flat.split('').filter((c) => c === 'D')).toHaveLength(2);
    }
  });

  it('drzwi sa w gornym i dolnym wierszu, sciezki "." istnieja', () => {
    const lines = generateMaze(40, 24, mulberry32(7)).toLines();
    expect(lines[0]).toContain('D');
    expect(lines[lines.length - 1]).toContain('D');
    expect(lines.join('')).toContain('.');
  });

  it('deterministyczny dla tego samego seeda, rozny dla innego', () => {
    const a = generateMaze(31, 21, mulberry32(3)).toLines();
    const b = generateMaze(31, 21, mulberry32(3)).toLines();
    const c = generateMaze(31, 21, mulberry32(4)).toLines();
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('golden: 40x24, seed 7 (zamrozony wynik nowego algorytmu)', () => {
    const golden = [
      '#D#######################################',
      '#.#...#.#...#.........#.........#.#.#.#.#',
      '#.#.#.#.###.###.#####.###.#.#####.#.#.#.#',
      '#...#...........#.....#...#.....#.#...#.#',
      '#.#######.#########.###########.#.#.#.#.#',
      '#.......#.......#.....#.#...#.#.#...#...#',
      '###.#########.#########.#.#.#.#.#####.###',
      '#.......#...#...#.#...#...#...#.....#.#.#',
      '#.#####.###.#.#.#.#.#.#.#.###.#.#.###.#.#',
      '#...#...#...#.#.#...#...#.#.....#.......#',
      '#######.###.#.###.#################.#####',
      '#.#.#.#.#.............#.....#...#.....#.#',
      '#.#.#.#.###########.###.###.#.###.###.#.#',
      '#.......#.......#.....#...#.#...#...#...#',
      '#.#####.###.#######.#######.###.#######.#',
      '#...#...#.............#.................#',
      '###########################.#############',
      '#.....................#...#.....#.......#',
      '#####.#####.#.#####.#####.#####.#.#######',
      '#.....#.....#...#.....#.................#',
      '#####.###########.#######.#######.#######',
      '#...........#.....#.........#...#.......#',
      '#########.#####.###.#######.###.#######.#',
      '#...........#.........#.........#.......#',
      '###D#####################################',
    ];
    expect(generateMaze(40, 24, mulberry32(7)).toLines()).toEqual(golden);
  });

  it('performance: 199x199 pod 100ms', () => {
    const t0 = performance.now();
    generateMaze(199, 199, mulberry32(1));
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('dungeon (BSP, port z v1 DungeonGenerator.js)', () => {
  it('caly obszar w x h jest pokryty (# lub .), bounds == w x h, roomsPlaced == rooms.length', () => {
    const w = 40, h = 24;
    const { grid, roomsPlaced, rooms } = generateDungeonDetailed(w, h, { minRoom: 4, maxRoom: 10, rng: mulberry32(7) });
    expect(grid.bounds()).toEqual({ minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) expect(['#', '.']).toContain(grid.get(x, y));
    }
    expect(roomsPlaced).toBe(rooms.length);
  });

  it('brak przejsc przez zewnetrzna krawedz mapy', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = 40, h = 24;
      const lines = generateDungeonDetailed(w, h, { minRoom: 4, maxRoom: 10, rng: mulberry32(seed) }).grid.toLines();
      for (let x = 0; x < w; x++) { expect(lines[0]![x]).toBe('#'); expect(lines[h - 1]![x]).toBe('#'); }
      for (let y = 0; y < h; y++) { expect(lines[y]![0]).toBe('#'); expect(lines[y]![w - 1]).toBe('#'); }
    }
  });

  it('deterministyczny dla tego samego seeda, ma podloge', () => {
    const a = generateDungeonDetailed(40, 24, { minRoom: 4, maxRoom: 10, rng: mulberry32(7) }).grid.toLines();
    const b = generateDungeonDetailed(40, 24, { minRoom: 4, maxRoom: 10, rng: mulberry32(7) }).grid.toLines();
    expect(a).toEqual(b);
    expect(a.join('')).toContain('.');
  });

  it('roomsPlaced rosnie z malejacym maxRoom (wiecej obowiazkowych splitow na mniejsze liscie)', () => {
    const counts = [30, 20, 15, 10, 8, 6].map((maxRoom) =>
      generateDungeonDetailed(60, 40, { minRoom: 4, maxRoom, rng: mulberry32(7) }).roomsPlaced);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
  });

  it('odwrocone min/max daje to samo co poprawna kolejnosc (zamieniane miejscami)', () => {
    const a = generateDungeonDetailed(40, 24, { minRoom: 4, maxRoom: 10, rng: mulberry32(9) }).grid.toLines();
    const b = generateDungeonDetailed(40, 24, { minRoom: 10, maxRoom: 4, rng: mulberry32(9) }).grid.toLines();
    expect(a).toEqual(b);
  });

  it('performance: 199x199 pod 100ms', () => {
    const t0 = performance.now();
    generateDungeonDetailed(199, 199, { minRoom: 4, maxRoom: 10, rng: mulberry32(1) });
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('golden: 40x24, seed 7, minRoom 4, maxRoom 10 (zamrozony wynik nowego algorytmu)', () => {
    const golden = [
      '########################################',
      '#....##....##....##....##...##.........#',
      '#................##....##...##.....##..#',
      '#....##....##......................##..#',
      '#############################.##########',
      '#############################.##########',
      '#..................##......##..##......#',
      '#........##........##......##..##......#',
      '#........##................##..##......#',
      '########################.####.###......#',
      '########################.####.###......#',
      '#........##.......##.......##..#######.#',
      '#..........................##.....####.#',
      '#........##.......##.......##..##......#',
      '#........##.......##.......##.###......#',
      '#####.#######################.###......#',
      '#####.####################.....##......#',
      '#.............##...........##..######.##',
      '#........##...##.......##..##..######.##',
      '#........##...##.......##..##..##......#',
      '#........##...##.......##..##..##......#',
      '#........##............##..##..##......#',
      '#........##...##.......##..##..##......#',
      '########################################',
    ];
    const result = generateDungeonDetailed(40, 24, { minRoom: 4, maxRoom: 10, rng: mulberry32(7) });
    expect(result.grid.toLines()).toEqual(golden);
    expect(result.roomsPlaced).toBe(23);
  });
});

describe('dungeon: roomTarget (kontrolka Rooms - adaptacja bez odpowiednika w v1)', () => {
  // maxRoom >= max(w,h) wylacza faze obowiazkowa (naturalny wynik to 1 lisc = caly obszar),
  // wiec cel jest w calosci osiagany przez faze dociagajaca (extendToTarget) - test izoluje
  // wlasnie ta sciezke i dowodzi, ze trafia w cel DOKLADNIE przy kazdym z 20 seedow.
  it('trafia dokladnie w zadana liczbe pokoi, gdy jest to geometrycznie wykonalne (20 seedow)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = generateDungeonDetailed(24, 16, { roomTarget: 3, minRoom: 6, maxRoom: 30, rng: mulberry32(seed) });
      expect(a.roomsPlaced).toBe(3);
      const b = generateDungeonDetailed(40, 24, { roomTarget: 8, minRoom: 4, maxRoom: 30, rng: mulberry32(seed) });
      expect(b.roomsPlaced).toBe(8);
    }
  });

  it('gdy obowiazkowe splity daja wiecej lisci niz target - nie scala w dol, zwraca naturalna liczbe', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { roomsPlaced } = generateDungeonDetailed(60, 40, { roomTarget: 8, minRoom: 4, maxRoom: 10, rng: mulberry32(seed) });
      expect(roomsPlaced).toBeGreaterThan(8);
    }
  });

  it('cel geometrycznie nieosiagalny na ciasnej planszy - zatrzymuje sie na maksimum, bez zawieszenia', () => {
    const { roomsPlaced } = generateDungeonDetailed(10, 8, { roomTarget: 50, minRoom: 4, maxRoom: 10, rng: mulberry32(1) });
    expect(roomsPlaced).toBeGreaterThanOrEqual(1);
    expect(roomsPlaced).toBeLessThan(50);
  });
});

describe('generateDungeon (wrapper zachowujacy historyczna sygnature pozycyjna)', () => {
  it('zwraca to samo co generateDungeonDetailed(...).grid dla tych samych parametrow', () => {
    const a = generateDungeon(40, 24, 30, mulberry32(7), 4, 10).toLines();
    const b = generateDungeonDetailed(40, 24, { minRoom: 4, maxRoom: 10, rng: mulberry32(7) }).grid.toLines();
    expect(a).toEqual(b);
  });

  it('roomTries jest martwym parametrem - rozne wartosci nie zmieniaja wyniku', () => {
    const a = generateDungeon(40, 24, 1, mulberry32(7), 4, 10).toLines();
    const b = generateDungeon(40, 24, 999, mulberry32(7), 4, 10).toLines();
    expect(a).toEqual(b);
  });

  it('deterministyczny z domyslnym min/max, ma podloge', () => {
    const a = generateDungeon(50, 30, 30, mulberry32(11)).toLines();
    const b = generateDungeon(50, 30, 30, mulberry32(11)).toLines();
    expect(a).toEqual(b);
    expect(a.join('')).toContain('.');
  });
});
