// Panel Legend: znak, nazwa, kolor i licznik uzyc dla kazdego wpisu legendy.
import { bumpContent } from '../../core/editorState';
import type { Command } from '../../core/history';
import type { LegendEntry } from '../../core/legend';
import { remapChar } from '../../core/remap';
import { button, el, iconButton } from '../dom';
import { promptModal } from '../modal';
import { PanelsCtx, errorMessage, playPop, scheduleSave, toast } from './context';

export interface LegendPanel {
  render(): void;
}

export function initLegend(ctx: PanelsCtx, legendBox: HTMLElement): LegendPanel {
  const { state } = ctx;

  function usageCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    // liczniki sumujemy po wszystkich warstwach, takze ukrytych
    for (const layer of state.level.layers) {
      for (const { ch } of layer.grid.cells()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Zmiana znaku wpisu: promptModal -> remapChar -> odswiezenie legendy/warstw.
   * Blad (kolizja albo zly znak) konczy sie samym toastem - mapa i legenda zostaja bez zmian.
   */
  async function editChar(entry: LegendEntry): Promise<void> {
    const answer = await promptModal('Change character', entry.ch);
    if (answer === null || answer === entry.ch) return; // Cancel/Esc albo bez zmiany
    try {
      remapChar(state.level, entry.ch, answer);
    } catch (e) {
      toast(errorMessage(e), 'error');
      return;
    }
    bumpContent(state);
    ctx.markDirty();
    scheduleSave();
    // po zamknieciu modala fokus wraca na klikniety przycisk edycji (wewnatrz legendBox) -
    // bez zdjecia fokusu straznik "nie przerywaj edycji w toku" w renderLegend przerwalby odswiezenie
    if (document.activeElement instanceof HTMLElement && legendBox.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    renderLegend();
    ctx.hooks.renderLayers();
    playPop();
    const cmd: Command = {
      label: 'Change character',
      undo: () => { remapChar(state.level, answer, entry.ch); },
      redo: () => { remapChar(state.level, entry.ch, answer); },
    };
    ctx.hooks.pushHistory?.(cmd);
  }

  function renderLegend(): void {
    // nie przerywamy edycji nazwy/koloru przez podmiane DOM pod palcami
    if (legendBox.contains(document.activeElement)) return;
    const counts = usageCounts();
    const entries = state.level.legend.entries();
    legendBox.replaceChildren();
    if (entries.length === 0) {
      legendBox.append(el('p', 'hint', 'Paint something to fill the legend.'));
      return;
    }
    for (const entry of entries) {
      const row = el('div', 'legend-row');
      const charBtn = button(entry.ch, 'legend-char', () => ctx.hooks.setBrush(entry.ch));
      charBtn.style.color = entry.color;
      charBtn.title = `Use ${entry.ch} as brush`;

      const editBtn = iconButton('e', 'legend-edit', 'Change character', () => void editChar(entry));

      const name = el('input', 'legend-name');
      name.type = 'text';
      name.value = entry.name;
      name.setAttribute('aria-label', `Name of ${entry.ch}`);
      name.addEventListener('input', () => {
        state.level.legend.upsert(entry.ch, { name: name.value });
        scheduleSave();
      });

      const color = el('input', 'legend-color');
      color.type = 'color';
      color.value = entry.color;
      color.setAttribute('aria-label', `Color of ${entry.ch}`);
      // kolor czyta renderer prosto z legendy przy rysowaniu - splaszczenie warstw sie nie zmienia,
      // wiec wystarczy markDirty bez bumpContent
      color.addEventListener('input', () => {
        state.level.legend.upsert(entry.ch, { color: color.value });
        charBtn.style.color = color.value;
        ctx.markDirty();
        scheduleSave();
      });

      row.append(charBtn, editBtn, name, color, el('span', 'legend-count', String(counts.get(entry.ch) ?? 0)));
      legendBox.append(row);
    }
  }

  return { render: renderLegend };
}
