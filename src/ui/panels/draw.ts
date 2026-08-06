// Panel Draw: przelacznik narzedzia (Brush/Eraser), pole pedzla, rozmiar stopki,
// skrot klawiszowy i czyszczenie warstwy.
import { BRUSH_SIZES, activeLayerOf, type EditorState } from '../../core/editorState';
import { button, el, iconButton, labeled } from '../dom';
import { icon } from '../icons';
import { confirmModal, isModalOpen } from '../modal';
import { isTypingTarget } from '../input';
import { PanelsCtx, applyReplace } from './context';

export interface DrawPanel {
  setBrush(ch: string): void;
  render(): void;
}

/** Narzedzia karty Draw - kolejnosc w rzedzie przelacznika. */
const TOOLS: ReadonlyArray<{ tool: EditorState['tool']; icon: 'pencil' | 'eraser'; title: string }> = [
  { tool: 'brush', icon: 'pencil', title: 'Brush tool' },
  { tool: 'eraser', icon: 'eraser', title: 'Eraser tool' },
];

/**
 * Pasek chipow: wspolny dla rozmiarow stopki - rozni je tylko lista wartosci,
 * aktywny element i tooltip, wiec budowa chipa zostaje w jednym miejscu.
 */
function renderChipRow<T>(
  box: HTMLElement, items: readonly T[], active: T, title: (value: T) => string, pick: (value: T) => void,
): void {
  box.replaceChildren();
  for (const value of items) {
    const chip = button(String(value), value === active ? 'chip active' : 'chip', () => pick(value));
    chip.title = title(value);
    box.append(chip);
  }
}

export function initDraw(ctx: PanelsCtx, drawBox: HTMLElement): DrawPanel {
  const { state } = ctx;
  const toolRow = el('div', 'chips');
  const sizeChips = el('div', 'chips');
  const charInput = el('input', 'char-input');
  charInput.type = 'text';
  charInput.maxLength = 1;
  charInput.value = state.brush;
  charInput.setAttribute('aria-label', 'Brush character');

  /** Przelacznik narzedzia: aktywne narzedzie dostaje ta sama klase 'active' co chipy. */
  function renderToolRow(): void {
    toolRow.replaceChildren();
    for (const t of TOOLS) {
      const active = state.tool === t.tool;
      const btn = iconButton(icon(t.icon), active ? 'chip active' : 'chip', t.title, () => setTool(t.tool));
      toolRow.append(btn);
    }
  }

  function setTool(tool: EditorState['tool']): void {
    if (state.tool === tool) return;
    state.tool = tool;
    renderToolRow();
  }

  function renderSizeChips(): void {
    renderChipRow(sizeChips, BRUSH_SIZES, state.brushSize, (n) => `Brush size: ${n}x${n}`, setBrushSize);
  }

  /**
   * Jedyne miejsce ustawiajace pedzel (klawiatura, chip, legenda, pole Character z karty glownej).
   * Wpisanie znaku wyraza zamiar rysowania, wiec przelacza narzedzie z powrotem na Brush.
   * syncBrush rozsyla nowy znak do pol POZA ta karta - dzieki temu pole w trybie Simplified
   * nadaza za przelaczeniem pedzla klawiszem, a zadna karta nie musi znac drugiej.
   */
  function setBrush(ch: string): void {
    state.brush = ch;
    if (charInput.value !== ch) charInput.value = ch;
    setTool('brush');
    ctx.hooks.syncBrush(ch);
  }

  /** Rozmiar jest sesyjny (jak pedzel) - nie zapisujemy go, ale hover musi od razu zmienic rozmiar. */
  function setBrushSize(n: number): void {
    state.brushSize = n;
    renderSizeChips();
    ctx.markDirty();
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
    // migawke calego poziomu (nie samej warstwy) robi applyReplace: czyszczenie zmienia tez
    // liczniki legendy, a wspolna sciezka podmiany poziomu odtwarza jedno i drugie
    applyReplace(ctx, 'Clear layer', () => layer.grid.clear());
  }

  const clearRow = el('div', 'btn-row');
  clearRow.append(button('Clear layer', 'danger', () => void clearLayer()));

  drawBox.append(
    toolRow,
    labeled('Char', charInput),
    labeled('Size', sizeChips),
    clearRow,
    el('p', 'hint help-box hint-small hint-gap', 'Press any character key to switch the brush. Alt or Ctrl + drag also erases.'),
  );

  return {
    setBrush,
    render() { renderToolRow(); renderSizeChips(); },
  };
}
