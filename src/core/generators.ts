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

/** Opcje generatora lochu - patrz {@link generateDungeonDetailed}. */
export interface DungeonOpts {
  /** Liczba prob postawienia pokoju gdy roomTarget nie jest podany (dotychczasowe zachowanie). */
  roomTries?: number;
  rng?: () => number;
  minRoom?: number;
  maxRoom?: number;
  /**
   * Docelowa liczba pokoi. Gdy podana (>=1), generator probuje stawiac pokoje az ja OSIAGNIE
   * albo wyczerpie wewnetrzny limit prob (roomTarget * 25) - roomTries jest wtedy ignorowane.
   */
  roomTarget?: number;
}

/**
 * Loch z prostokatnych pokoi polaczonych korytarzami w L. JEDYNA implementacja petli stawiania
 * pokoi - {@link generateDungeon} to nad nia cienki wrapper.
 * minRoom/maxRoom to bok pokoju (obie osie losowane z tego samego zakresu) - karta Extra features
 * wystawia je uzytkownikowi. Odwrocone wartosci zamieniamy miejscami zamiast rzucac: pole liczbowe
 * w UI latwo zostawic w takim stanie w trakcie pisania, a pusty zakres dalby ujemne boki pokoi.
 * Zwraca tez roomsPlaced - liczenie pokoi z gotowej siatki jest zawodne (korytarze zlepiaja podloge).
 *
 * Tryb roomTarget gwarantuje roomsPlaced === roomTarget, kiedy jest to geometrycznie mozliwe przy
 * minRoom: faza losowa degraduje gorna granice rozmiaru pokoju po serii nieudanych prob (male
 * pokoje latwiej wcisnac), a gdy proby losowe sie wyczerpia - deterministyczny scan dobija reszte.
 * Gdy nawet to nie wystarczy (nieszczesliwy uklad duzych pokoi z fazy losowej potrafi zablokowac
 * cala reszte planszy tak, ze ZADNA kolejna pozycja lo x lo juz sie nie miesci) - ostatnia deska
 * ratunku to siatka regularna: pakowanie identycznych kwadratow bez nakladania jest matematycznie
 * najgesciej upakowane wlasnie na regularnej siatce (zweryfikowane brute-force'em na malych
 * przypadkach), wiec to jedyny sposob na TWARDA gwarancje bez kosztownego, potencjalnie wolnego
 * backtrackingu (patrz komentarze przy hasTarget nizej).
 */
export function generateDungeonDetailed(
  w: number, h: number, opts: DungeonOpts = {},
): { grid: Grid; roomsPlaced: number } {
  const { roomTries = 30, rng = Math.random, minRoom = 4, maxRoom = 10, roomTarget } = opts;
  const lo = Math.min(minRoom, maxRoom), hi = Math.max(minRoom, maxRoom);
  const g = new Grid();
  interface Room { x: number; y: number; w: number; h: number }
  const rooms: Room[] = [];
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  // jedna funkcja kolizji dla obu faz trybu roomTarget (losowej i scan fallbacku) oraz dla trybu roomTries.
  const collides = (rx: number, ry: number, rw: number, rh: number) => rooms.some((r) =>
    rx <= r.x + r.w && rx + rw >= r.x && ry <= r.y + r.h && ry + rh >= r.y);

  // tryb "roomTries" (roomTarget nie podany): stala liczba prob niezaleznie od trafien - dotychczasowe
  // zachowanie. tryb "roomTarget": probuje az postawi tyle pokoi ile trzeba, z twardym limitem prob,
  // zeby ciasna plansza z nieosiagalnym celem nie zawiesila generatora.
  const hasTarget = typeof roomTarget === 'number' && roomTarget >= 1;
  const maxAttempts = hasTarget ? roomTarget * 25 : roomTries;

  if (!hasTarget) {
    // GALAZ NIETKNIETA: dokladnie ta sama sekwencja wywolan ri() i logika co przed fixem
    // (golden test w generators.test.ts pilnuje braku regresji).
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const rw = ri(lo, hi), rh = ri(lo, hi);
      const rx = ri(1, Math.max(1, w - rw - 2));
      const ry = ri(1, Math.max(1, h - rh - 2));
      if (collides(rx, ry, rw, rh)) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh });
    }
  } else {
    // Faza 1: losowe proby jak dotad, ale z degradacja - po kazdych SHRINK_AFTER nieudanych
    // probach z rzedu obnizamy efektywne hi o 1 (nie ponizej lo). Male pokoje latwiej wcisnac
    // na ciasnej mapie, wiec degradacja zwieksza szanse trafienia bez zmiany trybu roomTries.
    const SHRINK_AFTER = 10;
    let effHi = hi;
    let failStreak = 0;
    let attempts = 0;
    while (attempts < maxAttempts && rooms.length < roomTarget) {
      attempts++;
      const rw = ri(lo, effHi), rh = ri(lo, effHi);
      const rx = ri(1, Math.max(1, w - rw - 2));
      const ry = ri(1, Math.max(1, h - rh - 2));
      if (collides(rx, ry, rw, rh)) {
        failStreak++;
        if (failStreak >= SHRINK_AFTER && effHi > lo) { effHi--; failStreak = 0; }
        continue;
      }
      failStreak = 0;
      rooms.push({ x: rx, y: ry, w: rw, h: rh });
    }
    // Faza 2 (deterministyczny fallback): losowej fazie nie udalo sie dobic do celu - skanuj
    // WSZYSTKIE pozycje (x,y) dla pokoju lo x lo (krok 1 komorki, margines 1 od krawedzi jak
    // w fazie 1), zbierz kandydatow bez kolizji i wybierz losowo z listy (rng, wiec deterministycznie
    // przy ustalonym seedzie). Powtarzaj az roomTarget albo brak kandydatow.
    const maxX = Math.max(1, w - lo - 2);
    const maxY = Math.max(1, h - lo - 2);
    while (rooms.length < roomTarget) {
      const candidates: Array<[number, number]> = [];
      for (let y = 1; y <= maxY; y++) {
        for (let x = 1; x <= maxX; x++) {
          if (!collides(x, y, lo, lo)) candidates.push([x, y]);
        }
      }
      if (!candidates.length) break;
      const [cx, cy] = candidates[Math.floor(rng() * candidates.length)]!;
      rooms.push({ x: cx, y: cy, w: lo, h: lo });
    }
    // Faza 3 (siatka regularna - ostateczna gwarancja): fazy 1+2 utknely, bo konkretny uklad
    // duzych pokoi z fazy losowej moze zablokowac reszte planszy tak, ze zaden kolejny lo x lo
    // juz nigdzie nie wejdzie - mimo ze wolne miejsce GDZIE INDZIEJ nadal by starczylo. Jedyny
    // sposob na twarda gwarancje: zaczac od zera i rozstawic pokoje lo x lo NA REGULARNEJ SIATCE
    // (odstep lo+1 miedzy poczatkami komorek) - to dowiedzione (patrz komentarz przy funkcji)
    // NAJGESTSZE mozliwe upakowanie identycznych kwadratow bez nakladania, wiec zawsze osiaga
    // maksymalna liczbe pokoi mieszczaca sie na planszy przy tym minRoom. Kolejnosc komorek siatki
    // tasujemy przez rng, zeby wynik nie byl zawsze tym samym rogiem planszy.
    if (rooms.length < roomTarget) {
      rooms.length = 0;
      const step = lo + 1;
      const cols = Math.floor((maxX - 1) / step) + 1;
      const rows = Math.floor((maxY - 1) / step) + 1;
      const slots: Array<[number, number]> = [];
      for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) slots.push([1 + rx * step, 1 + ry * step]);
      }
      const need = Math.min(roomTarget, slots.length);
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rng() * (slots.length - i));
        const tmp = slots[i]!; slots[i] = slots[j]!; slots[j] = tmp;
        const [sx, sy] = slots[i]!;
        rooms.push({ x: sx, y: sy, w: lo, h: lo });
      }
    }
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
  // lita skala: kazda komorka ramki [0,w) x [0,h) ktora nie jest podloga -> '#'
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g.get(x, y) !== '.') g.set(x, y, '#');
    }
  }
  return { grid: g, roomsPlaced: rooms.length };
}

/**
 * Cienki wrapper nad {@link generateDungeonDetailed} - zachowuje dotychczasowa sygnature i
 * zwraca sama siatke, bez roomTarget (petla stawiania pokoi zyje wylacznie w Detailed).
 */
export function generateDungeon(
  w: number, h: number, roomTries = 30, rng: () => number = Math.random,
  minRoom = 4, maxRoom = 10,
): Grid {
  return generateDungeonDetailed(w, h, { roomTries, rng, minRoom, maxRoom }).grid;
}
