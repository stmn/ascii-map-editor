// Panel Generate: rozmiar mapy i dwa generatory (labirynt, loch) na aktywnej warstwie.
// Sama sciezka generowania (potwierdzenie + podmiana siatki + wpis w historii) mieszka nizej
// w runGenerator - korzysta z niej takze karta Extra features z trybu Simplified.
import { activeLayerOf } from '../../core/editorState';
import { levelUsedChars } from '../../core/level';
import { generateDungeonDetailed, generateMaze } from '../../core/generators';
import { button, el, labeledStack, numberInput, readNumber } from '../dom';
import { confirmModal } from '../modal';
import { PanelsCtx, applyReplace, toast } from './context';

const MIN_SIZE = 5;
const MAX_SIZE = 199;
const DEFAULT_W = 31;
const DEFAULT_H = 21;
/** Zakres i domyslna wartosc pola Rooms - wspolne dla karty Generate i karty Extra features. */
export const MIN_ROOMS = 1;
export const MAX_ROOMS = 50;
export const DEFAULT_ROOMS = 8;
/**
 * Zakres i domyslna wartosc bok pokoju (Min./Max. room size) - wspolne dla karty Generate
 * i karty Extra features. Mniej niz 2 nie da sciany, wiecej niz 40 i tak nie zmiesci sie na
 * mapie. Domyslne 4/10 to defaulty silnika (patrz minRoom/maxRoom w generateDungeonDetailed),
 * nie osobny wybor UI - stad jedna para stalych zamiast kopii w kazdej karcie.
 */
export const MIN_ROOM = 2;
export const MAX_ROOM = 40;
export const DEFAULT_MIN_ROOM = 4;
export const DEFAULT_MAX_ROOM = 10;

export type GeneratorKind = 'maze' | 'dungeon';

/**
 * Parametry lochu dla runGenerator. minRoom/maxRoom (bok pokoju) i roomTarget (docelowa liczba
 * pokoi) sa niezalezne - karta glowna podaje tylko roomTarget i zostaje na domyslnym zakresie boku.
 */
export interface RoomRange { minRoom?: number; maxRoom?: number; roomTarget?: number }

/**
 * Wygenerowanie mapy na aktywnej warstwie - JEDYNA implementacja tej sciezki (karta Generate
 * w Advanced i karta Extra features w Simplified). Niepusta warstwa wymaga potwierdzenia, bo
 * generator zasypuje ja bezpowrotnie; reszta stosu zostaje nietknieta.
 * Podane w i h sa ZAMOWIENIEM rozmiaru - zaden wolajacy nie przepisuje potem swoich pol
 * obrysem wyniku (patrz panels/extra.ts), bo generator moze wypelnic mniej niz zamowiono.
 * Loch wola Detailed bezposrednio (nie prosty generateDungeon) - to jedyny sposob przekazania
 * roomTarget dalej; roomsPlaced z wyniku nie jest tu jeszcze wykorzystywane przez UI.
 */
export async function runGenerator(
  ctx: PanelsCtx, kind: GeneratorKind, w: number, h: number, rooms?: RoomRange,
): Promise<void> {
  const { state } = ctx;
  const layer = activeLayerOf(state);
  if (!layer.grid.isEmpty() && !await confirmModal(`Replace layer "${layer.name}"?`, 'Replace')) return;
  applyReplace(ctx, kind === 'maze' ? 'Generate maze' : 'Generate dungeon', () => {
    layer.grid = kind === 'maze'
      ? generateMaze(w, h)
      : generateDungeonDetailed(w, h, {
        rng: Math.random,
        minRoom: rooms?.minRoom,
        maxRoom: rooms?.maxRoom,
        roomTarget: rooms?.roomTarget,
      }).grid;
    state.level.legend.syncWith(levelUsedChars(state.level));
  }, true);
  toast(`Generated ${kind} ${w}x${h}`);
}

export function initGenerate(ctx: PanelsCtx, generateBox: HTMLElement): void {
  const widthInput = numberInput(DEFAULT_W, 'Width', MIN_SIZE, MAX_SIZE);
  const heightInput = numberInput(DEFAULT_H, 'Height', MIN_SIZE, MAX_SIZE);
  const roomsInput = numberInput(DEFAULT_ROOMS, 'Rooms', MIN_ROOMS, MAX_ROOMS);
  const minRoomInput = numberInput(DEFAULT_MIN_ROOM, 'Minimum room size', MIN_ROOM, MAX_ROOM);
  const maxRoomInput = numberInput(DEFAULT_MAX_ROOM, 'Maximum room size', MIN_ROOM, MAX_ROOM);

  function generate(kind: GeneratorKind): void {
    void runGenerator(
      ctx, kind, readNumber(widthInput, DEFAULT_W), readNumber(heightInput, DEFAULT_H),
      kind === 'dungeon' ? {
        roomTarget: readNumber(roomsInput, DEFAULT_ROOMS),
        minRoom: readNumber(minRoomInput, DEFAULT_MIN_ROOM),
        maxRoom: readNumber(maxRoomInput, DEFAULT_MAX_ROOM),
      } : undefined,
    );
  }

  // Width i Height obok siebie 50/50 w jednym rzedzie (etykieta nad kazdym polem) - ten sam
  // wzorzec co w karcie Map (Simplified), patrz .field-row w styles.css. Rozmiar dotyczy OBU
  // generatorow nizej, wiec stoi nad nimi, poza ktorakolwiek sekcja.
  const sizes = el('div', 'field-row');
  sizes.append(labeledStack('Width:', widthInput), labeledStack('Height:', heightInput));

  const rooms = el('div', 'field-col');
  rooms.append(
    labeledStack('Rooms:', roomsInput),
    labeledStack('Min. room size:', minRoomInput), labeledStack('Max. room size:', maxRoomInput),
  );

  // Naglowek+przycisk per generator jak w karcie Extra features (Simplified) - te same klasy
  // (card-heading, card-sep, btn-full), zeby obie karty czytaly sie tak samo mimo osobnych DOM
  // (patrz panels/extra.ts). Dzieki temu widac na pierwszy rzut oka, ze Width/Height wyzej
  // sa wspolne dla obu sekcji, a nie naleza do zadnej z nich.
  generateBox.append(
    sizes,
    el('p', 'card-heading', 'Maze generator'),
    button('Generate', 'btn-full', () => generate('maze')),
    el('hr', 'card-sep'),
    el('p', 'card-heading', 'Dungeon generator'),
    rooms,
    button('Generate', 'btn-full', () => generate('dungeon')),
    el('p', 'hint help-box hint-small hint-gap', 'Generating replaces the active layer.'),
  );
}
