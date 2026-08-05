// Panel Generate: rozmiar mapy i dwa generatory (labirynt, loch) na aktywnej warstwie.
import { replaceCommand, snapshotLevel } from '../../core/commands';
import { activeLayerOf, bumpContent } from '../../core/editorState';
import { levelUsedChars } from '../../core/level';
import { generateDungeon, generateMaze } from '../../core/generators';
import { button, el, labeled } from '../dom';
import { confirmModal } from '../modal';
import { PanelsCtx, applyLevelToPanels, playPop, scheduleSave, toast } from './context';

const MIN_SIZE = 5;
const MAX_SIZE = 199;
const DEFAULT_W = 31;
const DEFAULT_H = 21;

export function initGenerate(ctx: PanelsCtx, generateBox: HTMLElement): void {
  const { state } = ctx;

  function sizeInput(value: number, label: string): HTMLInputElement {
    const input = el('input', 'size-input');
    input.type = 'number';
    input.min = String(MIN_SIZE);
    input.max = String(MAX_SIZE);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    return input;
  }

  const widthInput = sizeInput(DEFAULT_W, 'Width');
  const heightInput = sizeInput(DEFAULT_H, 'Height');

  function readSize(input: HTMLInputElement, fallback: number): number {
    const raw = Math.round(Number(input.value));
    const value = Number.isFinite(raw) && raw > 0
      ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, raw))
      : fallback;
    input.value = String(value);
    return value;
  }

  async function generate(kind: 'maze' | 'dungeon'): Promise<void> {
    const layer = activeLayerOf(state);
    if (!layer.grid.isEmpty() && !await confirmModal(`Replace layer "${layer.name}"?`, 'Replace')) return;
    const w = readSize(widthInput, DEFAULT_W);
    const h = readSize(heightInput, DEFAULT_H);
    // migawka przed podmiana siatki - generator zasypuje warstwe bezpowrotnie
    const before = snapshotLevel(state.level);
    // generator podmienia siatke tylko aktywnej warstwy - reszta stosu zostaje nietknieta
    layer.grid = kind === 'maze' ? generateMaze(w, h) : generateDungeon(w, h);
    state.level.legend.syncWith(levelUsedChars(state.level));
    bumpContent(state);
    ctx.centerOnPaper();
    ctx.markDirty();
    ctx.hooks.renderLegend();
    scheduleSave();
    playPop();
    toast(`Generated ${kind} ${w}x${h}`);
    ctx.hooks.pushHistory?.(replaceCommand(
      kind === 'maze' ? 'Generate maze' : 'Generate dungeon',
      before, snapshotLevel(state.level), (level) => { applyLevelToPanels(ctx, level); },
    ));
  }

  const sizes = el('div', 'field-row');
  sizes.append(labeled('W', widthInput), labeled('H', heightInput));
  const genButtons = el('div', 'btn-row');
  genButtons.append(
    button('Maze', '', () => void generate('maze')),
    button('Dungeon', '', () => void generate('dungeon')),
  );
  generateBox.append(sizes, genButtons, el('p', 'hint', 'Generating replaces the active layer.'));
}
