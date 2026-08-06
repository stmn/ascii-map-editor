// Karta Extra features (tryb Simplified): generatory z v1 wyjete poza karte glowna.
// Rozmiar mapy bierze z pol Width/Height karty glownej, a caly przebieg generowania
// (potwierdzenie, podmiana siatki, wpis w historii, toast) jest wspolny z karta Generate.
import { button, el, iconButton, labeledStack, numberInput, readNumber } from '../dom';
import { icon } from '../icons';
import { PanelsCtx } from './context';
import { GeneratorKind, RoomRange, runGenerator } from './generate';
import type { MapPanel } from './map';

/** Bok pokoju: mniej niz 2 nie da sciany, wiecej niz 40 i tak nie zmiesci sie na mapie. */
const MIN_ROOM = 2;
const MAX_ROOM = 40;
const DEFAULT_MIN_ROOM = 4;
const DEFAULT_MAX_ROOM = 8;

export function initExtra(ctx: PanelsCtx, extraBox: HTMLElement, map: MapPanel): void {
  const minRoom = numberInput(DEFAULT_MIN_ROOM, 'Minimum room size', MIN_ROOM, MAX_ROOM);
  const maxRoom = numberInput(DEFAULT_MAX_ROOM, 'Maximum room size', MIN_ROOM, MAX_ROOM);

  /**
   * Generowanie z rozmiarem z karty glownej. Po udanym przebiegu odswiezamy tam pola W/H:
   * generator lekko koryguje wymiary (labirynt schodzi do nieparzystych, loch obrysowuje pokoje),
   * wiec bez tego pola klamalyby o tym, co naprawde lezy na papierze.
   */
  async function generate(kind: GeneratorKind, rooms?: RoomRange): Promise<void> {
    const { w, h } = map.size();
    if (await runGenerator(ctx, kind, w, h, rooms)) map.syncSize();
  }

  const rooms = el('div', 'field-col');
  rooms.append(labeledStack('Min. room size:', minRoom), labeledStack('Max. room size:', maxRoom));

  extraBox.append(
    el('p', 'card-heading', 'Maze generator'),
    button('Generate', 'btn-full', () => void generate('maze')),
    el('hr', 'card-sep'),
    el('p', 'card-heading', 'Dungeon generator'),
    rooms,
    button('Generate', 'btn-full', () => void generate('dungeon', {
      // odczyt dopiero w chwili klikniecia - pola przycinaja sie same do swojego zakresu,
      // a odwrocone min/max generator zamienia miejscami (patrz core/generators.ts)
      minRoom: readNumber(minRoom, DEFAULT_MIN_ROOM),
      maxRoom: readNumber(maxRoom, DEFAULT_MAX_ROOM),
    })),
    el('p', 'hint hint-small hint-gap', 'Generating replaces the whole map.'),
  );

  // X w naglowku karty - odznacza checkbox "Extra features" w karcie glownej (jedyna droga
  // chowania karty, zeby checkbox i widocznosc nigdy sie nie rozjechaly).
  const summary = extraBox.closest('details')?.querySelector<HTMLElement>(':scope > summary');
  if (!summary) return;
  const close = iconButton(icon('x'), 'card-x', 'Hide extra features', map.hideExtra);
  // klik w summary domyslnie zwija karte, a przeciaganie jej naglowka przenosi ja miedzy
  // kolumnami - X ma robic tylko swoje, wiec zatrzymujemy oba zachowania
  close.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  close.draggable = false;
  summary.append(close);
}
