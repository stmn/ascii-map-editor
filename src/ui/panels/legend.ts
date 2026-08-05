// Panel Legend: znak, nazwa, kolor i licznik uzyc dla kazdego wpisu legendy.
import { legendEditCommand, remapCommand } from '../../core/commands';
import { bumpContent } from '../../core/editorState';
import type { LegendEntry } from '../../core/legend';
import { remapChar } from '../../core/remap';
import { button, el, iconButton, isDarkColor } from '../dom';
import { icon } from '../icons';
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
    // wpis mogl zniknac w miedzyczasie (undo/redo, remap z innego rzedu) - remap na martwym
    // znaku bylby cichym no-op, a komenda z niego pchnieta mialaby zla inwersje
    if (!state.level.legend.get(entry.ch)) return;
    try {
      remapChar(state.level, entry.ch, answer);
    } catch (e) {
      toast(errorMessage(e), 'error');
      return;
    }
    bumpContent(state);
    ctx.markDirty();
    scheduleSave();
    // fokus wraca po modalu na przycisk edycji, ale straznik renderLegend patrzy juz tylko na
    // pola tekstowe, wiec odswiezenie idzie normalnie - zdejmowanie fokusu nie jest potrzebne
    renderLegend();
    ctx.hooks.renderLayers();
    playPop();
    ctx.hooks.pushHistory?.(remapCommand(state, entry.ch, answer));
  }

  function renderLegend(): void {
    // Nie przerywamy pisania w nazwie przez podmiane DOM pod palcami. Straznik celowo obejmuje
    // TYLKO pole tekstowe: przycisk (znak, edycja znaku) nie trzyma zadnego stanu edycji, a fokus
    // na nim po zamknieciu modala blokowalby odswiezenie karty po undo/redo.
    const focused = document.activeElement;
    // text (nazwa) i color (probnik OS) trzymaja otwarty stan edycji - podmiana DOM pod nimi
    // przerwalaby pisanie albo zamknela probnik koloru w trakcie wyboru
    if (focused instanceof HTMLInputElement && (focused.type === 'text' || focused.type === 'color') && legendBox.contains(focused)) return;
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

      const editBtn = iconButton(icon('pencil'), 'legend-edit', 'Change character', () => void editChar(entry));

      const name = el('input', 'legend-name');
      name.type = 'text';
      name.value = entry.name;
      name.setAttribute('aria-label', `Name of ${entry.ch}`);
      name.addEventListener('input', () => {
        state.level.legend.upsert(entry.ch, { name: name.value });
        scheduleSave();
      });
      // wartosc sprzed edycji lapiemy na fokusie, a komende pchamy na change (blur/Enter):
      // jeden wpis w historii na cala sesje pisania zamiast wpisu na kazdy znak
      let nameBefore = entry.name;
      name.addEventListener('focus', () => { nameBefore = entry.name; });
      name.addEventListener('change', () => {
        if (name.value === nameBefore) return;
        ctx.hooks.pushHistory?.(legendEditCommand(state, entry.ch, 'name', nameBefore, name.value));
        nameBefore = name.value;
      });

      const color = el('input', 'legend-color');
      color.type = 'color';
      color.value = entry.color;
      color.setAttribute('aria-label', `Color of ${entry.ch}`);

      // licznik siedzi NA swatchu (wrapper .legend-swatch, position:relative) - pointer-events:none
      // na spanie, wiec klik i tak trafia w input i otwiera color picker
      const count = el('span', 'legend-count', String(counts.get(entry.ch) ?? 0));
      count.style.color = isDarkColor(entry.color) ? '#ffffff' : '#000000';

      // kolor czyta renderer prosto z legendy przy rysowaniu - splaszczenie warstw sie nie zmienia,
      // wiec wystarczy markDirty bez bumpContent
      color.addEventListener('input', () => {
        state.level.legend.upsert(entry.ch, { color: color.value });
        charBtn.style.color = color.value;
        count.style.color = isDarkColor(color.value) ? '#ffffff' : '#000000';
        ctx.markDirty();
        scheduleSave();
      });
      // input leci przy kazdym ruchu w probniku - do historii idzie dopiero zatwierdzony kolor
      let colorBefore = entry.color;
      color.addEventListener('change', () => {
        if (color.value === colorBefore) return;
        ctx.hooks.pushHistory?.(legendEditCommand(state, entry.ch, 'color', colorBefore, color.value));
        colorBefore = color.value;
      });

      const swatch = el('div', 'legend-swatch');
      swatch.append(color, count);

      row.append(charBtn, editBtn, name, swatch);
      legendBox.append(row);
    }
  }

  return { render: renderLegend };
}
