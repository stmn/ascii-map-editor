import { describe, expect, it } from 'vitest';
import { generateDungeon, generateDungeonDetailed, generateMaze, mulberry32 } from '../src/core/generators';

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

describe('generateDungeonDetailed: wypelnienie calej ramki', () => {
  it('kazda komorka [0,w)x[0,h) jest ustawiona (# lub .), bounds == w x h', () => {
    const w = 40, h = 24;
    const { grid } = generateDungeonDetailed(w, h, { roomTries: 30, rng: mulberry32(7) });
    expect(grid.bounds()).toEqual({ minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(grid.get(x, y)).not.toBeNull();
      }
    }
  });

  // Petla stawiania pokoi jest nietknieta - ta sama liczba pokoi dla tego samego seeda co przed fixem.
  it('roomsPlaced dla seeda 7 (roomTries=30) jest bez zmian', () => {
    const { roomsPlaced } = generateDungeonDetailed(40, 24, { roomTries: 30, rng: mulberry32(7) });
    expect(roomsPlaced).toBe(7);
  });
});

describe('generateDungeonDetailed: roomTarget', () => {
  // Duza plansza (60x40) z domyslnym zakresem boku pokoju (4-10) miesci cel bez trudu -
  // wewnetrzny limit prob (roomTarget * 25) nie powinien byc w ogole potrzebny.
  it('trafia dokladnie w zadana liczbe pokoi na duzej planszy', () => {
    const { roomsPlaced } = generateDungeonDetailed(60, 40, { roomTarget: 3, rng: mulberry32(1) });
    expect(roomsPlaced).toBe(3);
  });

  it('nigdy nie przekracza roomTarget, niezaleznie od seeda', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { roomsPlaced } = generateDungeonDetailed(60, 40, { roomTarget: 8, rng: mulberry32(seed) });
      expect(roomsPlaced).toBeLessThanOrEqual(8);
    }
  });

  // Ciasna plansza (10x8) z domyslnym zakresem boku pokoju (4-10) fizycznie nie pomiesci
  // 50 nienakladajacych sie pokoi - test dowodzi, ze wewnetrzny limit prob (roomTarget * 25)
  // faktycznie przerywa petle zamiast zawieszac generator.
  it('na ciasnej planszy konczy sie bez zawieszenia i nie osiaga nierealnego celu', () => {
    const { roomsPlaced } = generateDungeonDetailed(10, 8, { roomTarget: 50, rng: mulberry32(1) });
    expect(roomsPlaced).toBeLessThan(50);
  });

  // Test rownowaznosci "wrapper vs Detailed" bylby tautologiczny - wrapper i tak tylko wola
  // Detailed w srodku, wiec taki test dowodzi jedynie przekazania parametrow, a nie zgodnosci
  // z oryginalna (sprzed refaktoru) petla. Zamiast tego zamrazamy DOKLADNY output generateDungeon
  // dla ustalonego seeda jako zloty wzorzec (golden): wartosc ponizej zostala recznie zweryfikowana
  // jako identyczna z wynikiem sprzed refaktoru (ta sama liczba iteracji petli i ta sama kolejnosc
  // wywolan ri() dla trybu bez roomTarget) - jesli kiedys rozjedzie sie z Detailed, ten test to wylapie.
  //
  // UWAGA: golden ponizej zostal SWIADOMIE zaktualizowany dla FIX "wypelnij cala ramke" (2026-08-07,
  // zgloszenie usera) - wczesniej obrys byl cienki (tylko '#' stykajace sie z podloga), reszta planszy
  // pusta. Zweryfikowano probka porownawcza: pozycje podlogi ('.') sa identyczne co do komorki
  // (272 komorki, ten sam zestaw x,y) wzgledem golden sprzed fixu - roznica jest WYLACZNIE w tym,
  // ze puste komorki w ramce 40x24 sa teraz '#' zamiast spacji/nieobecne, a bounds() to teraz caly
  // zamowiony prostokat (0,0)-(39,23) zamiast ciasnego obrysu wokol podlogi.
  // Zgloszenie usera: Rooms 2/3, Min 6, Max 12 na mapie ~24x16 czasami stawia tylko 1 pokoj.
  // Duze pokoje wzgledem malej mapy latwo koliduja w fazie losowej - fix ma to gwarantowac
  // zawsze (degradacja rozmiaru + deterministyczny scan fallback), gdy jest to geometrycznie mozliwe.
  it('reprodukcja zgloszenia: 24x16, target 3, min 6 max 12 - zawsze trafia 3 pokoje', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { roomsPlaced } = generateDungeonDetailed(24, 16, {
        roomTarget: 3, minRoom: 6, maxRoom: 12, rng: mulberry32(seed),
      });
      expect(roomsPlaced).toBe(3);
    }
  });

  // Fix round 2 (review): na tym samym scenariuszu faza 3 (siatka regularna) jest DOMINUJACA
  // sciezka (80-86% seedow wg pomiaru recenzenta) - bez rozrostu wszystkie 3 pokoje wychodzily
  // identycznymi kwadratami lo x lo, wiec maxRoom byl po cichu martwy (nowy wymiar tego samego
  // "slabo respektowane ustawienia"). Test odtwarza problem estetyczny: rozmiary NIE moga byc
  // wszystkie identyczne w wiekszosci seedow.
  it('rozrost siatkowych pokoi: rozmiary nie sa wszystkie identyczne lo x lo (>=15/20 seedow)', () => {
    let diverse = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { rooms } = generateDungeonDetailed(24, 16, {
        roomTarget: 3, minRoom: 6, maxRoom: 12, rng: mulberry32(seed),
      });
      const distinctSizes = new Set(rooms.map((r) => `${r.w}x${r.h}`));
      if (distinctSizes.size >= 2) diverse++;
    }
    expect(diverse).toBeGreaterThanOrEqual(15);
  });

  // Ten sam scenariusz: rozrost nie moze zlamac twardych granic - zaden pokoj nie przekracza
  // maxRoom (hi) na zadnej osi, zaden nie schodzi ponizej minRoom (lo), i zadne dwa pokoje po
  // rozroscie nie zachodza na siebie (kolizja liczona niezaleznie od wewnetrznej collides()).
  it('rozrost siatkowych pokoi: nikt nie przekracza hi, nikt nie schodzi ponizej lo, brak nakladania', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { rooms } = generateDungeonDetailed(24, 16, {
        roomTarget: 3, minRoom: 6, maxRoom: 12, rng: mulberry32(seed),
      });
      for (const r of rooms) {
        expect(r.w).toBeGreaterThanOrEqual(6);
        expect(r.w).toBeLessThanOrEqual(12);
        expect(r.h).toBeGreaterThanOrEqual(6);
        expect(r.h).toBeLessThanOrEqual(12);
      }
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i]!, b = rooms[j]!;
          const overlap = a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  // Ciasna plansza (10x8) z nierealnym celem (50 pokoi min 4x4) - fallback scan musi konczyc
  // sie deterministycznie zamiast zawieszac generator, i musi postawic co najmniej 1 pokoj.
  it('ciasna plansza z nierealnym celem konczy sie bez zawieszenia', () => {
    const { roomsPlaced } = generateDungeonDetailed(10, 8, {
      roomTarget: 50, minRoom: 4, rng: mulberry32(1),
    });
    expect(roomsPlaced).toBeGreaterThanOrEqual(1);
    expect(roomsPlaced).toBeLessThan(50);
  });

  // Recznie dobrana plansza gdzie zmiesci sie dokladnie k pokoi lo x lo (min === max, wiec rozmiar
  // pokoju jest ustalony): w=17,h=7,lo=4 -> maxX=11,maxY=1, siatka co (lo+1)=5 daje dokladnie
  // 3 kolumny x 1 rzad = 3 sloty. roomTarget=3 trafia dokladnie w ten geometryczny sufit -
  // dowodzi, ze fallback (scan + siatka regularna) dobija do maksimum, nie mniej.
  it('recznie dobrana plansza: zmiesci sie dokladnie k pokoi - roomsPlaced == k', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { roomsPlaced } = generateDungeonDetailed(17, 7, {
        roomTarget: 3, minRoom: 4, maxRoom: 4, rng: mulberry32(seed),
      });
      expect(roomsPlaced).toBe(3);
    }
  });

  // Ta sama plansza, ale cel (5) przekracza geometryczny sufit (3) - roomsPlaced ma sie zatrzymac
  // dokladnie na maksimum, nie mniej i nie wiecej (dowod, ze siatka regularna daje SUFIT, nie tylko
  // "cos wiecej niz przedtem").
  it('recznie dobrana plansza: cel powyzej geometrycznego sufitu zatrzymuje sie na suficie', () => {
    const { roomsPlaced } = generateDungeonDetailed(17, 7, {
      roomTarget: 5, minRoom: 4, maxRoom: 4, rng: mulberry32(3),
    });
    expect(roomsPlaced).toBe(3);
  });

  it('dungeon: legacy roomTries (bez roomTarget) daje zamrozony wynik dla seeda 7 (golden)', () => {
    const golden = [
      '########################################',
      '########################################',
      '#######.....############################',
      '#######.....############################',
      '#######.....###.......##################',
      '#######.....###.......##################',
      '#######.....###.......##########....####',
      '#######...............##########....####',
      '#######.....#.#.......##########....####',
      '#######.....#.#.......##########....####',
      '#######.....#.####.##.############.#####',
      '#######.....#.####.##.############.#####',
      '#########.###.####.##.############.#####',
      '#########.###.####......##########....##',
      '###.......###.####......##########....##',
      '###.............##....................##',
      '###...................................##',
      '###.............###.....################',
      '#########.......###.....################',
      '##########......########################',
      '##########......########################',
      '##########......########################',
      '########################################',
      '########################################',
    ];
    const lines = generateDungeon(40, 24, 30, mulberry32(7)).toLines();
    expect(lines).toEqual(golden);
  });
});
