// Panel Generate: rozmiar mapy i dwa generatory (labirynt, loch) na aktywnej warstwie.
// Sama sciezka generowania (potwierdzenie + podmiana siatki + wpis w historii) mieszka nizej
// w runGenerator - korzysta z niej takze karta Extra features z trybu Simplified.
import { activeLayerOf } from '../../core/editorState';
import { levelUsedChars } from '../../core/level';
import { generateDungeon, generateMaze } from '../../core/generators';
import { button, el, labeledStack, numberInput, readNumber } from '../dom';
import { confirmModal } from '../modal';
import { PanelsCtx, applyReplace, toast } from './context';

const MIN_SIZE = 5;
const MAX_SIZE = 199;
const DEFAULT_W = 31;
const DEFAULT_H = 21;
/** Liczba prob postawienia pokoju w generatorze lochu - nie jest wystawiona w UI. */
const ROOM_TRIES = 30;

export type GeneratorKind = 'maze' | 'dungeon';

/** Zakres boku pokoju dla lochu; karta glowna ich nie podaje i zostaja domyslne z generatora. */
export interface RoomRange { minRoom: number; maxRoom: number }

/**
 * Wygenerowanie mapy na aktywnej warstwie - JEDYNA implementacja tej sciezki (karta Generate
 * w Advanced i karta Extra features w Simplified). Niepusta warstwa wymaga potwierdzenia, bo
 * generator zasypuje ja bezpowrotnie; reszta stosu zostaje nietknieta.
 * Zwraca true gdy mapa faktycznie powstala - wolajacy odswieza wtedy swoje pola z rozmiarem.
 */
export async function runGenerator(
  ctx: PanelsCtx, kind: GeneratorKind, w: number, h: number, rooms?: RoomRange,
): Promise<boolean> {
  const { state } = ctx;
  const layer = activeLayerOf(state);
  if (!layer.grid.isEmpty() && !await confirmModal(`Replace layer "${layer.name}"?`, 'Replace')) return false;
  applyReplace(ctx, kind === 'maze' ? 'Generate maze' : 'Generate dungeon', () => {
    layer.grid = kind === 'maze'
      ? generateMaze(w, h)
      : generateDungeon(w, h, ROOM_TRIES, Math.random, rooms?.minRoom, rooms?.maxRoom);
    state.level.legend.syncWith(levelUsedChars(state.level));
  }, true);
  toast(`Generated ${kind} ${w}x${h}`);
  return true;
}

export function initGenerate(ctx: PanelsCtx, generateBox: HTMLElement): void {
  const widthInput = numberInput(DEFAULT_W, 'Width', MIN_SIZE, MAX_SIZE);
  const heightInput = numberInput(DEFAULT_H, 'Height', MIN_SIZE, MAX_SIZE);

  function generate(kind: GeneratorKind): void {
    void runGenerator(ctx, kind, readNumber(widthInput, DEFAULT_W), readNumber(heightInput, DEFAULT_H));
  }

  // W i H stackowane pionowo (etykieta nad inputem, pelna szerokosc karty) zamiast rzedu obok siebie
  const sizes = el('div', 'field-col');
  sizes.append(labeledStack('W', widthInput), labeledStack('H', heightInput));
  const genButtons = el('div', 'btn-row');
  genButtons.append(
    button('Maze', '', () => generate('maze')),
    button('Dungeon', '', () => generate('dungeon')),
  );
  generateBox.append(
    sizes, genButtons,
    el('p', 'hint hint-small hint-gap', 'Generating replaces the active layer.'),
  );
}
