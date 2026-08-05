// Panel Layers: karta warstw (widocznosc, nazwa, kolejnosc, usuwanie) i dodawanie nowych.
import {
  layerAddCommand, layerMoveCommand, layerRemoveCommand, layerRenameCommand, layerVisibilityCommand,
} from '../../core/commands';
import { bumpContent, clampedActive } from '../../core/editorState';
import { Layer, MAX_LAYERS, makeLayer } from '../../core/level';
import { button, el, iconButton } from '../dom';
import { confirmModal } from '../modal';
import { PanelsCtx, playPop, scheduleSave } from './context';

export interface LayersPanel {
  render(): void;
}

export function initLayers(ctx: PanelsCtx, layersBox: HTMLElement): LayersPanel {
  const { state } = ctx;

  /** Wspolny epilog operacji na warstwach: przerysowanie canvasu, karty i autozapis. */
  function afterLayerChange(): void {
    // kazda z tych operacji zmienia splaszczenie (sklad, kolejnosc albo widocznosc warstw)
    bumpContent(state);
    ctx.markDirty();
    renderLayers();
    scheduleSave();
  }

  /** Wiersze karty w kolejnosci tablicy warstw - do przelaczania podswietlenia bez przebudowy DOM. */
  const rowEls: HTMLElement[] = [];

  function setActiveLayer(index: number): void {
    if (state.activeLayer === index) return;
    state.activeLayer = index;
    // aktywna warstwa to stan sesji - nie ma czego zapisywac, a sama klasa oszczedza nam
    // przebudowy karty, wiec klik w pole nazwy nie zabiera sobie fokusu
    rowEls.forEach((row, i) => row.classList.toggle('active', i === index));
    ctx.markDirty();
  }

  /** Pierwsza wolna nazwa "layer N" - unika duplikatow, ktore psulyby klucze eksportu Godot. */
  function nextLayerName(layers: Layer[]): string {
    const used = new Set(layers.map((l) => l.name));
    let n = 1;
    while (used.has(`layer ${n}`)) n++;
    return `layer ${n}`;
  }

  function addLayer(): void {
    const { layers } = state.level;
    if (layers.length >= MAX_LAYERS) return;
    // nowa warstwa laduje NAD aktywna, czyli o jeden dalej w tablicy
    const index = clampedActive(state) + 1;
    // ten SAM obiekt warstwy wraca przy redo - dzieki temu jego id (a wiec i komendy
    // pociagniec, ktore juz na nie wskazuja) przezywa cofniecie dodania
    const layer = makeLayer(nextLayerName(layers));
    layers.splice(index, 0, layer);
    state.activeLayer = index;
    afterLayerChange();
    playPop();
    ctx.hooks.pushHistory?.(layerAddCommand(state, index, layer));
  }

  async function removeLayer(index: number): Promise<void> {
    const { layers } = state.level;
    if (layers.length <= 1) return; // ostatniej warstwy nie usuwamy
    const layer = layers[index]!;
    if (!layer.grid.isEmpty() && !await confirmModal(`Delete layer "${layer.name}"?`, 'Delete')) return;
    // po awaicie sklad warstw moze byc inny - kasujemy tylko gdy wiersz dalej wskazuje ta sama warstwe
    if (layers.length <= 1 || layers[index] !== layer) return;
    layers.splice(index, 1);
    // aktywna zostaje ta sama warstwa; gdy zniknela - schodzimy na sasiada
    if (state.activeLayer === index) state.activeLayer = Math.min(index, layers.length - 1);
    else if (state.activeLayer > index) state.activeLayer -= 1;
    afterLayerChange();
    ctx.hooks.renderLegend(); // znikniete komorki zmieniaja liczniki uzyc
    playPop();
    ctx.hooks.pushHistory?.(layerRemoveCommand(state, index, layer));
  }

  /** dir = +1 przesuwa warstwe w gore listy (dalej w tablicy = blizej wierzchu). */
  function moveLayer(index: number, dir: 1 | -1): void {
    const { layers } = state.level;
    const target = index + dir;
    if (target < 0 || target >= layers.length) return;
    const moved = layers[index]!;
    layers[index] = layers[target]!;
    layers[target] = moved;
    if (state.activeLayer === index) state.activeLayer = target;
    else if (state.activeLayer === target) state.activeLayer = index;
    afterLayerChange();
    playPop();
    ctx.hooks.pushHistory?.(layerMoveCommand(state, index, target));
  }

  function layerButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    return iconButton(label, 'layer-btn', title, onClick);
  }

  function layerRow(layer: Layer, index: number): HTMLElement {
    const { layers } = state.level;
    const row = el('div', index === state.activeLayer ? 'layer-row active' : 'layer-row');

    // znak oka zostaje ten sam - stan ukrycia niesie przekreslenie i wyszarzenie
    const eye = layerButton(
      'o',
      layer.visible ? `Hide layer "${layer.name}"` : `Show layer "${layer.name}"`,
      () => {
        layer.visible = !layer.visible;
        afterLayerChange();
        ctx.hooks.pushHistory?.(layerVisibilityCommand(state, layer.id));
      },
    );
    eye.classList.add('layer-eye');
    if (!layer.visible) eye.classList.add('off');

    const name = el('input', 'layer-name');
    name.type = 'text';
    name.value = layer.name;
    name.setAttribute('aria-label', `Name of layer ${index + 1}`);
    // bez re-renderu karty - podmiana DOM w trakcie pisania zabralaby fokus;
    // nazwa jest czysto UI (nie zmienia tego, co widac na canvasie), wiec bez bumpContent
    name.addEventListener('input', () => { layer.name = name.value; scheduleSave(); });
    // pointerdown leci przed fokusem, a aktywacja nie przebudowuje karty - klik w nazwe robi obie rzeczy
    name.addEventListener('pointerdown', () => setActiveLayer(index));
    // nazwa sprzed edycji: historia dostaje JEDEN wpis na cala sesje pisania, nie na kazdy znak
    let nameBefore = layer.name;
    name.addEventListener('focus', () => { nameBefore = layer.name; });
    // blur, a nie change: pusta nazwa dostaje tu jeszcze domyslna wartosc, wiec komenda
    // zapisuje to, co naprawde zostalo, a nie chwilowy pusty string
    name.addEventListener('blur', () => {
      // pusta nazwa psulaby TMX i klucze slownika w Godot - wracamy do domyslnej z pozycji
      if (!name.value.trim()) {
        layer.name = `layer ${index + 1}`;
        name.value = layer.name;
        scheduleSave();
      }
      if (layer.name === nameBefore) return;
      ctx.hooks.pushHistory?.(layerRenameCommand(state, layer.id, nameBefore, layer.name));
      nameBefore = layer.name;
    });

    const up = layerButton('^', `Move layer "${layer.name}" up`, () => moveLayer(index, 1));
    up.disabled = index === layers.length - 1;
    const down = layerButton('v', `Move layer "${layer.name}" down`, () => moveLayer(index, -1));
    down.disabled = index === 0;

    const del = layerButton('X', `Delete layer "${layer.name}"`, () => void removeLayer(index));
    del.classList.add('layer-del');
    del.disabled = layers.length <= 1;

    // klik w tlo wiersza aktywuje warstwe; klikniecia w kontrolki zostawiamy im
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, input')) return;
      setActiveLayer(index);
    });

    row.append(eye, name, up, down, del);
    return row;
  }

  // Karte przebudowujemy tylko przy zmianie skladu warstw (nie przy aktywacji ani pisaniu w nazwie),
  // wiec podmiana DOM nigdy nie wpada uzytkownikowi w srodek edycji.
  function renderLayers(): void {
    const { layers } = state.level;
    // podswietlony wiersz ma zawsze pokazywac warstwe, na ktora trafia pedzel
    state.activeLayer = clampedActive(state);
    layersBox.replaceChildren();
    rowEls.length = 0;
    // gora listy = wierzch stosu, czyli koniec tablicy (jak w Tiled)
    for (let i = layers.length - 1; i >= 0; i--) {
      rowEls[i] = layerRow(layers[i]!, i);
      layersBox.append(rowEls[i]!);
    }
    const add = button('Add layer', '', addLayer);
    add.disabled = layers.length >= MAX_LAYERS;
    add.title = add.disabled ? `Limit is ${MAX_LAYERS} layers` : 'Add a layer above the active one';
    layersBox.append(add);
  }

  return { render: renderLayers };
}
