import { Grid } from './grid';

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// recursive backtracker na siatce nieparzystej: komorki co 2, sciany miedzy
export function generateMaze(w: number, h: number, rng: () => number = Math.random): Grid {
  const W = w % 2 ? w : w - 1;
  const H = h % 2 ? h : h - 1;
  const g = new Grid();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.set(x, y, '#');

  const carve = (x: number, y: number) => g.set(x, y, '.');
  const stack: Array<[number, number]> = [[1, 1]];
  carve(1, 1);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]!;
    const dirs = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const)
      .filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g.get(nx, ny) === '#';
      });
    if (!dirs.length) { stack.pop(); continue; }
    const [dx, dy] = dirs[Math.floor(rng() * dirs.length)]!;
    carve(x + dx / 2, y + dy / 2);
    carve(x + dx, y + dy);
    stack.push([x + dx, y + dy]);
  }
  g.set(1, 1, 'S');
  g.set(W - 2, H - 2, 'E');
  return g;
}

/**
 * Loch z prostokatnych pokoi polaczonych korytarzami w L.
 * minRoom/maxRoom to bok pokoju (obie osie losowane z tego samego zakresu) - karta Extra features
 * wystawia je uzytkownikowi. Odwrocone wartosci zamieniamy miejscami zamiast rzucac: pole liczbowe
 * w UI latwo zostawic w takim stanie w trakcie pisania, a pusty zakres dalby ujemne boki pokoi.
 */
export function generateDungeon(
  w: number, h: number, roomTries = 30, rng: () => number = Math.random,
  minRoom = 4, maxRoom = 10,
): Grid {
  const lo = Math.min(minRoom, maxRoom), hi = Math.max(minRoom, maxRoom);
  const g = new Grid();
  interface Room { x: number; y: number; w: number; h: number }
  const rooms: Room[] = [];
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

  for (let i = 0; i < roomTries; i++) {
    const rw = ri(lo, hi), rh = ri(lo, hi);
    const rx = ri(1, Math.max(1, w - rw - 2));
    const ry = ri(1, Math.max(1, h - rh - 2));
    const overlaps = rooms.some((r) =>
      rx <= r.x + r.w && rx + rw >= r.x && ry <= r.y + r.h && ry + rh >= r.y);
    if (overlaps) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }
  const floor = (x: number, y: number) => g.set(x, y, '.');
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) floor(x, y);
  }
  // korytarze w L miedzy srodkami kolejnych pokoi
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]!, b = rooms[i]!;
    const ax = a.x + (a.w >> 1), ay = a.y + (a.h >> 1);
    const bx = b.x + (b.w >> 1), by = b.y + (b.h >> 1);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) floor(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) floor(bx, y);
  }
  // obrys: kazda pusta komorka stykajaca sie z podloga -> '#'
  const bounds = g.bounds();
  if (bounds) {
    for (let y = bounds.minY - 1; y <= bounds.maxY + 1; y++) {
      for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++) {
        if (g.get(x, y)) continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          .some(([dx, dy]) => g.get(x + dx!, y + dy!) === '.');
        if (touches) g.set(x, y, '#');
      }
    }
  }
  return g;
}
