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

  function generate(kind: GeneratorKind): void {
    void runGenerator(
      ctx, kind, readNumber(widthInput, DEFAULT_W), readNumber(heightInput, DEFAULT_H),
      kind === 'dungeon' ? { roomTarget: readNumber(roomsInput, DEFAULT_ROOMS) } : undefined,
    );
  }

  // W i H stackowane pionowo (etykieta nad inputem, pelna szerokosc karty) zamiast rzedu obok siebie
  const sizes = el('div', 'field-col');
  sizes.append(labeledStack('W', widthInput), labeledStack('H', heightInput));
  const roomsField = labeledStack('Rooms', roomsInput);
  const genButtons = el('div', 'btn-row');
  genButtons.append(
    button('Maze', '', () => generate('maze')),
    button('Dungeon', '', () => generate('dungeon')),
  );
  generateBox.append(
    sizes, roomsField, genButtons,
    el('p', 'hint hint-small hint-gap', 'Generating replaces the active layer.'),
  );
}
