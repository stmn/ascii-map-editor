// Panel Draw: pasek ostatnich znakow, pole pedzla, skrot klawiszowy i czyszczenie warstwy.
import { replaceCommand, snapshotLevel } from '../../core/commands';
import { activeLayerOf, bumpContent } from '../../core/editorState';
import { button, el, labeled } from '../dom';
import { confirmModal, isModalOpen } from '../modal';
import { isTypingTarget } from '../input';
import { PanelsCtx, applyLevelToPanels, playPop, scheduleSave } from './context';

const MAX_RECENT = 14;
/** Znaki startowe w pasku "recent" - typowe kafle poziomu. */
const DEFAULT_RECENT = ['#', '.', '@', 'S', 'E', '~', '+'];

export interface DrawPanel {
  setBrush(ch: string): void;
  render(): void;
}

export function initDraw(ctx: PanelsCtx, drawBox: HTMLElement): DrawPanel {
  const { state } = ctx;
  const chips = el('div', 'chips');
  const charInput = el('input', 'char-input');
  charInput.type = 'text';
  charInput.maxLength = 1;
  charInput.value = state.brush;
  charInput.setAttribute('aria-label', 'Brush character');

  const recent: string[] = [...DEFAULT_RECENT];

  function pushRecent(ch: string): void {
    if (recent.includes(ch)) return;
    recent.push(ch);
    // usuwamy najstarszy, ale nigdy aktywnego pedzla - musi zostac widoczny na liscie
    if (recent.length > MAX_RECENT) recent.splice(recent[0] === state.brush ? 1 : 0, 1);
  }

  function renderChips(): void {
    chips.replaceChildren();
    for (const ch of recent) {
      const chip = button(ch, ch === state.brush ? 'chip active' : 'chip', () => setBrush(ch));
      chip.title = `Brush: ${ch}`;
      chips.append(chip);
    }
  }

  function setBrush(ch: string): void {
    state.brush = ch;
    pushRecent(ch);
    if (charInput.value !== ch) charInput.value = ch;
    renderChips();
  }

  charInput.addEventListener('input', () => {
    const ch = charInput.value;
    if (!ch || ch === ' ') return;
    setBrush(ch[0]!);
  });
  // pole ma maxlength=1, wiec zaznaczamy zawartosc - kolejny znak po prostu ja zastapi
  charInput.addEventListener('focus', () => charInput.select());

  // dowolny drukowalny klawisz ustawia pedzel - poza polami tekstowymi i skrotami z modyfikatorem
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || isModalOpen()) return;
    if (e.key.length !== 1 || e.key === ' ') return;
    setBrush(e.key);
  });

  /** Czysci aktywna warstwe, ale zostawia legende - nazwy i kolory znakow przezywaja. */
  async function clearLayer(): Promise<void> {
    const layer = activeLayerOf(state);
    if (layer.grid.isEmpty()) return;
    if (!await confirmModal(`Clear layer "${layer.name}"?`, 'Clear')) return;
    // stan mogl sie zmienic w trakcie potwierdzania - druga kontrola jest tania
    if (layer.grid.isEmpty()) return;
    // migawka calego poziomu (nie samej warstwy): czyszczenie zmienia tez liczniki legendy,
    // a wspolna sciezka podmiany poziomu odtwarza jedno i drugie
    const before = snapshotLevel(state.level);
    layer.grid.clear();
    bumpContent(state);
    ctx.markDirty();
    ctx.hooks.renderLegend();
    scheduleSave();
    playPop();
    ctx.hooks.pushHistory?.(replaceCommand(
      'Clear layer', before, snapshotLevel(state.level), (level) => { applyLevelToPanels(ctx, level); },
    ));
  }

  const clearRow = el('div', 'btn-row');
  clearRow.append(button('Clear layer', 'danger', () => void clearLayer()));

  drawBox.append(
    chips,
    labeled('Char', charInput),
    clearRow,
    el('p', 'hint help-box', 'Press any character key to switch the brush. Alt or Ctrl + drag erases.'),
  );

  return { setBrush, render: renderChips };
}
