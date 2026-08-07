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

// Original JavaScript code by Chirp Internet: chirpinternet.eu
// Please acknowledge use of this code by including this header.
//
// Port do siatki Grid v2 algorytmu recursive division z v1 (ascii-map-editor,
// src/vendor/MazeGenerator.js, klasa MazeBuilder - konstruktor + partition()). Adaptacje wobec
// oryginalu: rng wstrzykiwalne (byl globalny Math.random), znaki v2 zamiast tablic tagow
// ("wall"/"door"/"entrance"/"exit") - sciana '#', drzwi 'D', korytarz '.'. UWAGA: w v1 korytarz
// byl PUSTY (brak wpisu w siatce); tutaj celowo '.' - konwencja v2 nie zna pustych komorek na
// eksportowanej mapie (legenda/eksporty operuja na znakach). Logika key/placeKey/display z v1
// (szukanie klucza najdalej od wejscia i wyjscia) nie jest portowana - v1 sam jej nie uzywal
// w generateMaze() (patrz store.js), wiec nie jest czescia generatora w praktyce.
export function generateMaze(w: number, h: number, rng: () => number = Math.random): Grid {
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const cols = 2 * halfW + 1;
  const rows = 2 * halfH + 1;
  const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill('.'));

  const rand = (min: number, max: number) => min + Math.floor(rng() * (1 + max - min));
  const posToSpace = (x: number) => 2 * (x - 1) + 1;
  const posToWall = (x: number) => 2 * x;
  // Tasowanie Fisher-Yates identyczne z v1 (sauce: https://stackoverflow.com/a/12646864),
  // rng wstrzykiwalne zamiast Math.random.
  const shuffle = (arr: boolean[]): boolean[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]!; arr[i] = arr[j]!; arr[j] = tmp;
    }
    return arr;
  };

  // Poczatkowe sciany: gorny/dolny brzeg, lewy/prawy brzeg wierszy-komorek, i "slupki" siatki
  // (parzysty wiersz, parzysta kolumna). Reszta zostaje otwarta ('.') dopoki partition() nie
  // dostawi wewnetrznych scian.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1) cells[r]![c] = '#';
      else if (r % 2 === 1) { if (c === 0 || c === cols - 1) cells[r]![c] = '#'; }
      else if (c % 2 === 0) cells[r]![c] = '#';
    }
  }
  // Drzwi: wyjscie w gornym wierszu, wejscie w dolnym - dokladnie dwie komorki 'D'.
  cells[0]![posToSpace(rand(1, halfW))] = 'D';
  cells[rows - 1]![posToSpace(rand(1, halfW))] = 'D';

  // Recursive division (https://en.wikipedia.org/wiki/Maze_generation_algorithm#Recursive_division_method):
  // podziel komorke na cztery, postaw krzyz scian, zostaw 3 z 4 mozliwych przejsc otwarte.
  const partition = (r1: number, r2: number, c1: number, c2: number): void => {
    if (r2 < r1 || c2 < c1) return;

    let horiz: number;
    if (r1 === r2) horiz = r1;
    else {
      const x = r1 + 1, y = r2 - 1;
      horiz = rand(Math.round(x + (y - x) / 4), Math.round(x + (3 * (y - x)) / 4));
    }
    let vert: number;
    if (c1 === c2) vert = c1;
    else {
      const x = c1 + 1, y = c2 - 1;
      vert = rand(Math.round(x + (y - x) / 3), Math.round(x + (2 * (y - x)) / 3));
    }

    for (let i = posToWall(r1) - 1; i <= posToWall(r2) + 1; i++) {
      for (let j = posToWall(c1) - 1; j <= posToWall(c2) + 1; j++) {
        if (i === posToWall(horiz) || j === posToWall(vert)) cells[i]![j] = '#';
      }
    }

    const gaps = shuffle([true, true, true, false]);
    if (gaps[0]) cells[posToWall(horiz)]![posToSpace(rand(c1, vert))] = '.';
    if (gaps[1]) cells[posToWall(horiz)]![posToSpace(rand(vert + 1, c2 + 1))] = '.';
    if (gaps[2]) cells[posToSpace(rand(r1, horiz))]![posToWall(vert)] = '.';
    if (gaps[3]) cells[posToSpace(rand(horiz + 1, r2 + 1))]![posToWall(vert)] = '.';

    partition(r1, horiz - 1, c1, vert - 1);
    partition(horiz + 1, r2, c1, vert - 1);
    partition(r1, horiz - 1, vert + 1, c2);
    partition(horiz + 1, r2, vert + 1, c2);
  };
  partition(1, halfH - 1, 1, halfW - 1);

  const g = new Grid();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.set(x, y, cells[y]![x]!);
  return g;
}

/** Prostokat pokoju w wynikowej siatce lochu - lisc BSP (bez obwodki scian: wnetrze). */
export interface DungeonRoom { x: number; y: number; w: number; h: number }

/** Opcje generatora lochu - patrz {@link generateDungeonDetailed}. */
export interface DungeonOpts {
  rng?: () => number;
  minRoom?: number;
  maxRoom?: number;
  /**
   * Docelowa liczba pokoi. Gdy podana (>=1), po obowiazkowej fazie splitow generator probuje
   * DOCIAGNAC do tej liczby dodatkowymi splitami (patrz {@link generateDungeonDetailed}).
   */
  roomTarget?: number;
}

/** Wezel drzewa BSP: lisc (bez left/right) albo wezel wewnetrzny po splicie. */
interface BspNode {
  x: number; y: number; w: number; h: number;
  dir?: 'V' | 'H';
  left?: BspNode;
  right?: BspNode;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Port 1:1 v1 randomIndexBetweenValues: liczba calkowita z [min, max] wlacznie.
function ri(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// Port v1 randomDirection + getSplitOptions: wybor kierunku sposrod dostepnych opcji. Gdy tylko
// jedna opcja jest dostepna, nie zuzywamy losowania (w oryginale randomIndexBetweenValues(0,0)
// i tak zawsze zwraca 0 - u nas po prostu pomijamy zbedne wywolanie rng()).
function pickDir(canH: boolean, canV: boolean, rng: () => number): 'H' | 'V' {
  if (canH && !canV) return 'H';
  if (canV && !canH) return 'V';
  return rng() < 0.5 ? 'H' : 'V';
}

// Port v1 split(): dzieli node na left/right wzdluz danego kierunku, indeks z zakresu
// [lo, rozmiar-lo] (obie polowki >= lo), jak getIndexToSplit(). Zabezpieczenie clampInt ponizej
// to jedyna realna roznica wobec v1: przy zdegenerowanych kombinacjach min/max (rozmiar < 2*lo)
// oryginalny wzor moze policzyc indeks spoza [1, rozmiar-1] (w v1 taki zapis do tablicy przez
// slice/index po prostu cicho nie trafia w komorke - tutaj zamiast cichej "dziury" przycinamy do
// najblizszej poprawnej wartosci, zeby nigdy nie powstal pokoj o ujemnej/zerowej szerokosci).
function splitNode(node: BspNode, dir: 'H' | 'V', lo: number, rng: () => number): void {
  if (dir === 'V') {
    const idx = clampInt(ri(lo, node.w - lo, rng), 1, node.w - 1);
    node.left = { x: node.x, y: node.y, w: idx, h: node.h };
    node.right = { x: node.x + idx, y: node.y, w: node.w - idx, h: node.h };
  } else {
    const idx = clampInt(ri(lo, node.h - lo, rng), 1, node.h - 1);
    node.left = { x: node.x, y: node.y, w: node.w, h: idx };
    node.right = { x: node.x, y: node.y + idx, w: node.w, h: node.h - idx };
  }
  node.dir = dir;
}

// Faza obowiazkowa (v1 split()): dopoki wymiar > maxRoomSize, dziel dalej. Kierunek ograniczony
// do osi, ktora faktycznie przekracza max (getSplitOptions) - jak w oryginale.
function mandatorySplit(node: BspNode, lo: number, hi: number, rng: () => number): void {
  const needH = node.h > hi;
  const needV = node.w > hi;
  if (!needH && !needV) return;
  splitNode(node, pickDir(needH, needV, rng), lo, rng);
  mandatorySplit(node.left!, lo, hi, rng);
  mandatorySplit(node.right!, lo, hi, rng);
}

function collectLeaves(node: BspNode, out: BspNode[]): void {
  if (node.left && node.right) { collectLeaves(node.left, out); collectLeaves(node.right, out); } else out.push(node);
}

function collectInternal(node: BspNode, out: BspNode[]): void {
  if (node.left && node.right) { out.push(node); collectInternal(node.left, out); collectInternal(node.right, out); }
}

// Adaptacja "roomTarget" (kontrolka Rooms, nie istnieje w v1): gdy faza obowiazkowa dala mniej
// lisci niz target, DOCIAGAMY splitujac dalej - zawsze najwiekszy (pole w*h) lisc, ktory da sie
// jeszcze podzielic tak, zeby OBIE polowki miescily sie w [lo, ...] (w >= 2*lo lub h >= 2*lo).
// Kierunek/indeks liczone tym samym splitNode() co faza obowiazkowa. Gdy zaden lisc juz nie
// nadaje sie do podzialu - target jest geometrycznie nieosiagalny, zatrzymujemy sie na tym, co
// jest (nie ma tu "cofania" ani scalania). Gdy faza obowiazkowa dala WIECEJ lisci niz target,
// funkcja w ogole nie jest wolana (patrz generateDungeonDetailed) - nadmiar nie jest scalany.
function extendToTarget(root: BspNode, target: number, lo: number, rng: () => number): void {
  const leaves: BspNode[] = [];
  collectLeaves(root, leaves);
  while (leaves.length < target) {
    let bestIdx = -1, bestArea = -1;
    for (let i = 0; i < leaves.length; i++) {
      const n = leaves[i]!;
      if (n.w < 2 * lo && n.h < 2 * lo) continue;
      const area = n.w * n.h;
      if (area > bestArea) { bestArea = area; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    const node = leaves[bestIdx]!;
    splitNode(node, pickDir(node.h >= 2 * lo, node.w >= 2 * lo, rng), lo, rng);
    leaves.splice(bestIdx, 1, node.left!, node.right!);
  }
}

/**
 * Loch z pomieszczen prostokatnych i korytarzy - port algorytmu BSP z v1
 * (ascii-map-editor, src/vendor/DungeonGenerator.js, NewDungeon/Dungeon.split/connectRooms).
 * Rekurencyjnie dzieli caly obszar w x h (VERTICAL/HORIZONTAL, na przemian wedlug tego, ktory
 * wymiar przekracza maxRoom) dopoki kazdy lisc miesci sie w [?, maxRoom], kazdy lisc dostaje
 * obwodke scian (1 komorka wokol wnetrza), a kazde polaczenie dwoch podregionow przy scalaniu
 * przebija 2-komorkowe przejscie w scianie na granicy podzialu (jak AddRoomBoundaries +
 * connectRooms w v1). W przeciwienstwie do poprzedniego generatora (prostokaty losowane bez
 * kolizji na pustej siatce) BSP z natury pokrywa CALY obszar w x h - nie ma pustych marginesow.
 *
 * Adaptacje wobec v1: (a) rng wstrzykiwalne zamiast globalnego Math.random - kazde losowanie
 * (kierunek splitu, indeks splitu, pozycja korytarza) idzie przez rng; (b) mapowanie na znaki v2
 * - sciana '#', podloga '.' (w v1 sciana=1, podloga=0/id-pokoju, oba niescianowe traktowane jak
 * podloga); (c) minRoom/maxRoom odpowiadaja minRoomSize/maxRoomSize z v1, ta sama semantyka
 * splitu (indeks tak, zeby obie polowki >= minRoom, split dopoki wymiar > maxRoom); odwrocone
 * min/max sa zamieniane miejscami (lo/hi), tak jak dotychczasowa v2 konwencja UI (patrz
 * extra.ts) - pole liczbowe latwo zostawic odwrocone w trakcie pisania. (d) roomTarget (kontrolka
 * Rooms, nie ma odpowiednika w v1) - patrz {@link extendToTarget}. (e) caly obszar w x h jest
 * pokryty (# lub .) - BSP z natury nie zostawia pustych marginesow.
 */
export function generateDungeonDetailed(
  w: number, h: number, opts: DungeonOpts = {},
): { grid: Grid; roomsPlaced: number; rooms: ReadonlyArray<DungeonRoom> } {
  const { rng = Math.random, minRoom = 4, maxRoom = 10, roomTarget } = opts;
  // lo/hi: patrz (c) w komentarzu funkcji - zamiana miejscami zamiast odrzucenia odwroconych
  // wartosci; Math.max(1, ...) to twarda podloga przed lo<=0 (nieosiagalne z UI - MIN_ROOM=2 w
  // extra.ts - ale generateDungeonDetailed jest tez wolana wprost z testow/API).
  const lo = Math.max(1, Math.min(minRoom, maxRoom));
  const hi = Math.max(minRoom, maxRoom);

  const root: BspNode = { x: 0, y: 0, w, h };
  mandatorySplit(root, lo, hi, rng);
  if (typeof roomTarget === 'number' && roomTarget >= 1) extendToTarget(root, roomTarget, lo, rng);

  const leaves: BspNode[] = [];
  collectLeaves(root, leaves);
  const internal: BspNode[] = [];
  collectInternal(root, internal);

  const cells: string[][] = Array.from({ length: h }, () => Array(w).fill('#'));
  // Nigdy nie przebijaj zewnetrznej krawedzi calej mapy (x/y == 0 lub w-1/h-1) - wnetrza lisci
  // sa tego z konstrukcji bezpieczne (zawsze wciete o 1 od brzegu liscia), ale korytarz na
  // zdegenerowanym (bardzo waskim) liesciu przy samej krawedzi mapy teoretycznie mogby probowac
  // tam siegnac (patrz clampInt w splitNode) - ta bariera jest ostatecznym gwarantem.
  const setFloor = (x: number, y: number): void => {
    if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return;
    cells[y]![x] = '.';
  };

  const rooms: DungeonRoom[] = leaves.map((leaf) => ({
    x: leaf.x + 1, y: leaf.y + 1, w: Math.max(0, leaf.w - 2), h: Math.max(0, leaf.h - 2),
  }));
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setFloor(x, y);
  }

  // Port v1 connectRooms(): dla kazdego wezla wewnetrznego przebij 2-komorkowe przejscie na
  // granicy left/right, w losowym miejscu wzdluz tej granicy (margines 1 od koncow, jak w v1).
  for (const node of internal) {
    if (node.dir === 'V') {
      const y = node.y + clampInt(ri(1, node.h - 2, rng), 0, node.h - 1);
      const leftW = node.left!.w;
      setFloor(node.x + leftW - 1, y); setFloor(node.x + leftW - 2, y);
      setFloor(node.right!.x, y); setFloor(node.right!.x + 1, y);
    } else {
      const x = node.x + clampInt(ri(1, node.w - 2, rng), 0, node.w - 1);
      const topH = node.left!.h;
      setFloor(x, node.y + topH - 1); setFloor(x, node.y + topH - 2);
      setFloor(x, node.right!.y); setFloor(x, node.right!.y + 1);
    }
  }

  const g = new Grid();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.set(x, y, cells[y]![x]!);
  return { grid: g, roomsPlaced: leaves.length, rooms };
}

/**
 * Cienki wrapper nad {@link generateDungeonDetailed} - zachowuje historyczna sygnature
 * pozycyjna. roomTries pochodzil z poprzedniego algorytmu (losowe proby stawiania nienakladajacych
 * sie prostokatow) - loch BSP nie ma pojecia "prob" (dzieli obszar deterministycznie na podstawie
 * min/max), wiec parametr jest PRZYJMOWANY I IGNOROWANYM (deprecated) - zeby nie lamac istniejacych
 * wywolan pozycyjnych.
 */
export function generateDungeon(
  w: number, h: number, roomTries = 30, rng: () => number = Math.random,
  minRoom = 4, maxRoom = 10,
): Grid {
  void roomTries;
  return generateDungeonDetailed(w, h, { rng, minRoom, maxRoom }).grid;
}
