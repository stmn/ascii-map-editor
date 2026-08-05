// Panele boczne: brush, legenda, generatory, eksport i import.
// Modul celowo NIE importuje app.ts - stan i callbacki dostaje przez initPanels(ctx),
// dzieki czemu nie powstaje cykl importow (app.ts -> panels.ts, nigdy odwrotnie).
import { Bounds, Grid } from '../core/grid';
import { Legend } from '../core/legend';
import { Layer, Level, MAX_LAYERS, flattenLayers, levelUsedChars, makeLayer, unionBounds } from '../core/level';
import { parseProject, serializeProject } from '../core/project';
import { generateDungeon, generateMaze } from '../core/generators';
import { exportCsv, exportTxt } from '../export/text';
import { exportKaplay } from '../export/kaplay';
import { exportGodot } from '../export/godot';
import { exportTmx } from '../export/tiled';
import { exportXp, importXp } from '../export/rexpaint';
import { LegacyFormat, exportLegacy } from '../export/legacy';
import { button, el, labeled } from './dom';
import { ModalHandle, confirmModal, isModalOpen, openModal } from './modal';
import { isTypingTarget } from './input';
import type { View } from './renderer';
// import assetu przez Vite - bundler podmienia URL na wersje z hashem i relatywna baza
import popUrl from '../assets/pop.wav';

/** Klucz autozapisu w localStorage - app.ts czyta go przy starcie. */
export const STORAGE_KEY = 'ascii-level-editor-v2';
/** Autozapis jest debounce'owany - malowanie sypie mutacjami co komorke. */
const SAVE_DEBOUNCE_MS = 500;
/** Odswiezenie legendy tez debounce'ujemy - pelny re-render przy kazdej komorce byloby marnotrawstwem. */
const LEGEND_REFRESH_MS = 150;
/** Powyzej tego rozmiaru JSON-a nie zapisujemy - localStorage ma zwykle limit ~5MB. */
const MAX_SAVE_BYTES = 4.5 * 1024 * 1024;
const TOAST_MS = 3000;
const MAX_RECENT = 14;
/** Znaki startowe w pasku "recent" - typowe kafle poziomu. */
const DEFAULT_RECENT = ['#', '.', '@', 'S', 'E', '~', '+'];
const MIN_SIZE = 5;
const MAX_SIZE = 199;
const DEFAULT_W = 31;
const DEFAULT_H = 21;

/** Stan edytora widziany przez panele - app.ts przekazuje swoj obiekt state. */
export interface PanelsState {
  level: Level;
  activeLayer: number;
  view: View;
  brush: string;
}

/**
 * Indeks aktywnej warstwy przyciety do zakresu. Siatka bezpieczenstwa: usuniecie warstwy
 * albo import krotszego poziomu nie moze zostawic wiszacego indeksu i wywrocic malowania.
 */
function clampedActive(state: PanelsState): number {
  return Math.max(0, Math.min(state.activeLayer, state.level.layers.length - 1));
}

/** Warstwa wskazana przez activeLayer - jedyne miejsce indeksujace level.layers. */
function activeLayerOf(state: PanelsState): Layer {
  const { layers } = state.level;
  return layers[clampedActive(state)] ?? layers[0]!;
}

/** Import (i obcy autozapis) moze przyniesc wiecej warstw niz obslugujemy - zostawiamy najnizsze MAX_LAYERS. */
export function trimLayers(level: Level): boolean {
  if (level.layers.length <= MAX_LAYERS) return false;
  level.layers = level.layers.slice(0, MAX_LAYERS);
  return true;
}

/** Siatka aktywnej warstwy - tu trafia malowanie i stad czytaja panele. */
export function activeGrid(state: PanelsState): Grid {
  return activeLayerOf(state).grid;
}

export interface PanelsContext {
  state: PanelsState;
  /** Zamawia przerysowanie canvasu. */
  markDirty(): void;
  /** Centruje widok na papierze - app zna rozmiar canvasu i offset panelu. */
  centerOnPaper(): void;
}

export interface Panels {
  /** Wolane przez app po kazdej mutacji mapy (malowanie, gumka). */
  onMutate(): void;
}

// --- male helpery DOM ---------------------------------------------------------

function requireEl(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- toast --------------------------------------------------------------------

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

/** Pigulka na dole ekranu; jedna na raz, znika po 3 s. */
export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'ok'): void {
  if (!toastEl) {
    toastEl = el('div', 'toast');
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = kind === 'ok' ? 'toast' : `toast ${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.add('hidden'), TOAST_MS);
}

// --- dzwiek -------------------------------------------------------------------

let pop: HTMLAudioElement | null = null;

/** Krotki "pop" przy akcjach; blad odtwarzania ignorujemy (autoplay policy). */
function playPop(): void {
  if (!pop) {
    pop = new Audio(popUrl);
    pop.volume = 0.5;
  }
  pop.currentTime = 0;
  pop.play().catch(() => {});
}

// --- schowek i pobieranie plikow ---------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    playPop();
    toast('Copied');
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

function download(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // revoke dopiero po starcie pobierania - natychmiastowy potrafi je anulowac
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  playPop();
  toast(`Saved ${filename}`);
}

function countCells(grid: Grid): number {
  let n = 0;
  for (const _cell of grid.cells()) n++;
  return n;
}

// --- panele -------------------------------------------------------------------

export function initPanels(ctx: PanelsContext): Panels {
  const { state } = ctx;
  const drawBox = requireEl('panel-draw');
  const layersBox = requireEl('panel-layers');
  const legendBox = requireEl('panel-legend');
  const generateBox = requireEl('panel-generate');
  const exportBox = requireEl('panel-export');
  const importBox = requireEl('panel-import');

  // --- autozapis ---
  let saveTimer = 0;

  function saveNow(): void {
    try {
      const json = serializeProject(state.level);
      if (json.length > MAX_SAVE_BYTES) return; // za duza mapa - pomijamy zapis
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // brak miejsca albo zablokowany storage - autozapis jest opcjonalny
    }
  }

  function scheduleSave(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  /** Debounce gubi ostatnie pociagniecia przy natychmiastowym zamknieciu karty - domykamy zapis od razu. */
  function flushSave(): void {
    window.clearTimeout(saveTimer);
    saveNow();
  }

  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  // --- Draw ---
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
    layer.grid.clear();
    ctx.markDirty();
    renderLegend();
    scheduleSave();
    playPop();
  }

  const clearRow = el('div', 'btn-row');
  clearRow.append(button('Clear layer', 'danger', () => void clearLayer()));

  drawBox.append(
    chips,
    labeled('Char', charInput),
    clearRow,
    el('p', 'hint help-box', 'Press any character key to switch the brush. Alt or Ctrl + drag erases.'),
  );

  // --- Layers ---
  /** Wspolny epilog operacji na warstwach: przerysowanie canvasu, karty i autozapis. */
  function afterLayerChange(): void {
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

  function addLayer(): void {
    const { layers } = state.level;
    if (layers.length >= MAX_LAYERS) return;
    // nowa warstwa laduje NAD aktywna, czyli o jeden dalej w tablicy
    const index = clampedActive(state) + 1;
    layers.splice(index, 0, makeLayer(`layer ${layers.length + 1}`));
    state.activeLayer = index;
    afterLayerChange();
    playPop();
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
    renderLegend(); // znikniete komorki zmieniaja liczniki uzyc
    playPop();
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
  }

  function layerButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = button(label, 'layer-btn', onClick);
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }

  function layerRow(layer: Layer, index: number): HTMLElement {
    const { layers } = state.level;
    const row = el('div', index === state.activeLayer ? 'layer-row active' : 'layer-row');

    // znak oka zostaje ten sam - stan ukrycia niesie przekreslenie i wyszarzenie
    const eye = layerButton(
      'o',
      layer.visible ? `Hide layer "${layer.name}"` : `Show layer "${layer.name}"`,
      () => { layer.visible = !layer.visible; afterLayerChange(); },
    );
    eye.classList.add('layer-eye');
    if (!layer.visible) eye.classList.add('off');

    const name = el('input', 'layer-name');
    name.type = 'text';
    name.value = layer.name;
    name.setAttribute('aria-label', `Name of layer ${index + 1}`);
    // bez re-renderu karty - podmiana DOM w trakcie pisania zabralaby fokus
    name.addEventListener('input', () => { layer.name = name.value; scheduleSave(); });
    // pointerdown leci przed fokusem, a aktywacja nie przebudowuje karty - klik w nazwe robi obie rzeczy
    name.addEventListener('pointerdown', () => setActiveLayer(index));
    // pusta nazwa psulaby TMX i klucze slownika w Godot - wracamy do domyslnej z pozycji
    name.addEventListener('blur', () => {
      if (name.value.trim()) return;
      layer.name = `layer ${index + 1}`;
      name.value = layer.name;
      scheduleSave();
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

  // --- Legend ---
  function usageCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    // liczniki sumujemy po wszystkich warstwach, takze ukrytych
    for (const layer of state.level.layers) {
      for (const { ch } of layer.grid.cells()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    return counts;
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
      const charBtn = button(entry.ch, 'legend-char', () => setBrush(entry.ch));
      charBtn.style.color = entry.color;
      charBtn.title = `Use ${entry.ch} as brush`;

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
      color.addEventListener('input', () => {
        state.level.legend.upsert(entry.ch, { color: color.value });
        charBtn.style.color = color.value;
        ctx.markDirty();
        scheduleSave();
      });

      row.append(charBtn, name, color, el('span', 'legend-count', String(counts.get(entry.ch) ?? 0)));
      legendBox.append(row);
    }
  }

  // --- Generate ---
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
    // generator podmienia siatke tylko aktywnej warstwy - reszta stosu zostaje nietknieta
    layer.grid = kind === 'maze' ? generateMaze(w, h) : generateDungeon(w, h);
    state.level.legend.syncWith(levelUsedChars(state.level));
    ctx.centerOnPaper();
    ctx.markDirty();
    renderLegend();
    scheduleSave();
    playPop();
    toast(`Generated ${kind} ${w}x${h}`);
  }

  const sizes = el('div', 'field-row');
  sizes.append(labeled('W', widthInput), labeled('H', heightInput));
  const genButtons = el('div', 'btn-row');
  genButtons.append(
    button('Maze', '', () => void generate('maze')),
    button('Dungeon', '', () => void generate('dungeon')),
  );
  generateBox.append(sizes, genButtons, el('p', 'hint', 'Generating replaces the active layer.'));

  // --- Export ---
  const scopeSelect = el('select', 'scope-select');
  for (const [value, label] of [['active', 'Active layer'], ['flat', 'Flattened']] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    scopeSelect.append(option);
  }
  scopeSelect.setAttribute('aria-label', 'Export scope');

  /** Siatka wybrana przez dropdown Scope - tylko dla TXT/CSV, reszta eksportow bierze caly level. */
  function scopeGrid(): Grid {
    return scopeSelect.value === 'flat' ? flattenLayers(state.level.layers) : activeGrid(state);
  }

  /** Wspolne obrysowanie wszystkich warstw - dzieki temu pliki z roznych warstw sa wyrownane. */
  function scopeBounds(): Bounds | undefined {
    return unionBounds(state.level.layers) ?? undefined;
  }

  const exportButtons = el('div', 'btn-col');
  exportButtons.append(
    button('Copy TXT', '', () => void copyToClipboard(exportTxt(scopeGrid(), scopeBounds()))),
    button('Copy CSV', '', () => void copyToClipboard(exportCsv(scopeGrid(), scopeBounds()))),
    button('Copy KaPlay', '', () => void copyToClipboard(exportKaplay(state.level))),
    button('Copy Godot', '', () => void copyToClipboard(exportGodot(state.level))),
    button('Download .tmx', '', () => download(exportTmx(state.level), 'map.tmx', 'application/xml')),
    button('Download .xp', '', () => void downloadXp()),
    button('Download .json', '', () => download(
      serializeProject(state.level), 'project.json', 'application/json',
    )),
  );

  // Legacy (v1): ten sam zestaw formatow co pole SWITCH FORMAT w pierwszym edytorze.
  const legacySelect = el('select', 'scope-select');
  for (const [value, label] of [
    ['text', 'Text'], ['array-text', 'Array of strings'], ['array-array', 'Array of arrays'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    legacySelect.append(option);
  }
  legacySelect.setAttribute('aria-label', 'Legacy format');

  const legacyText = el('textarea', 'modal-text');
  legacyText.readOnly = true;
  legacyText.setAttribute('aria-label', 'Legacy export preview');

  /** Podglad zalezy od Scope i formatu - odswiezamy przy otwarciu modalu i kazdej zmianie. */
  function refreshLegacy(): void {
    legacyText.value = exportLegacy(scopeGrid(), legacySelect.value as LegacyFormat, scopeBounds());
  }

  scopeSelect.addEventListener('change', refreshLegacy);
  legacySelect.addEventListener('change', refreshLegacy);

  const exportBody = el('div');
  exportBody.append(
    labeled('Scope', scopeSelect),
    exportButtons,
    el('p', 'hint', 'Scope applies to TXT, CSV and Legacy. .json keeps every layer and the legend for later import.'),
    el('p', 'modal-heading', 'Legacy (v1)'),
    labeled('Format', legacySelect),
    legacyText,
    button('Copy legacy', 'btn-full', () => void copyToClipboard(legacyText.value)),
  );

  exportBox.append(button('Export...', 'btn-full', () => {
    refreshLegacy();
    openModal('Export', exportBody);
  }));

  async function downloadXp(): Promise<void> {
    try {
      const bytes = await exportXp(state.level);
      download(bytes.slice(), 'map.xp', 'application/octet-stream');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  // --- Import ---
  const fileInput = el('input', 'file-input');
  fileInput.type = 'file';
  fileInput.accept = '.json,.txt,.xp';
  const fileLabel = el('label', 'file-btn', 'Load file...');
  fileLabel.append(fileInput);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    // reset od razu, zeby ponowny wybor tego samego pliku znowu wywolal change
    fileInput.value = '';
    if (file) void importFile(file);
  });

  /** Uchwyt otwartego modalu Import - udany import go zamyka, blad zostawia otwarty. */
  let importModal: ModalHandle | null = null;

  /** Podmiana poziomu po udanym imporcie - wspolna sciezka pliku i wklejonego tekstu. */
  function applyImported(level: Level): void {
    state.level = level;
    state.activeLayer = 0;
    const trimmed = trimLayers(state.level);
    state.level.legend.syncWith(levelUsedChars(state.level));
    ctx.centerOnPaper();
    ctx.markDirty();
    renderLayers();
    renderLegend();
    scheduleSave();
    playPop();
    let cells = 0;
    for (const layer of state.level.layers) cells += countCells(layer.grid);
    // jeden toast na raz - ostrzezenie o przycieciu doklejamy do komunikatu importu
    if (trimmed) toast(`Imported ${cells} cells, trimmed to ${MAX_LAYERS} layers`, 'info');
    else toast(`Imported ${cells} cells`);
    importModal?.close();
  }

  async function importFile(file: File): Promise<void> {
    try {
      if (file.name.toLowerCase().endsWith('.xp')) {
        const { layers, colors } = await importXp(new Uint8Array(await file.arrayBuffer()));
        // .xp niesie same warstwy i kolory - legende budujemy od zera
        const level: Level = { layers: layers.map((l) => makeLayer(l.name, l.grid)), legend: new Legend() };
        for (const [ch, hex] of colors) level.legend.upsert(ch, { color: hex });
        applyImported(level);
      } else {
        applyImported(parseProject(await file.text()));
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  const pasteArea = el('textarea', 'modal-text');
  pasteArea.placeholder = 'Paste map here';
  pasteArea.setAttribute('aria-label', 'Map to import');

  /** Wklejony tekst idzie przez ten sam parser co pliki - .json, plain text i obie tablice z v1. */
  function importPasted(): void {
    try {
      applyImported(parseProject(pasteArea.value));
      pasteArea.value = '';
    } catch (e) {
      // blad zostawia modal otwarty, zeby dalo sie poprawic wklejona tresc
      toast(errorMessage(e), 'error');
    }
  }

  const importBody = el('div');
  importBody.append(
    fileLabel,
    el('p', 'hint', 'Accepts .json, .txt and REXPaint .xp files.'),
    el('hr', 'modal-sep'),
    pasteArea,
    button('Load', 'success btn-full', importPasted),
    el('p', 'hint', 'Accepts project .json, plain text and both v1 array formats.'),
  );

  importBox.append(button('Import...', 'success btn-full', () => {
    importModal = openModal('Import', importBody);
  }));

  // --- start ---
  let legendTimer = 0;

  function onMutate(): void {
    scheduleSave();
    window.clearTimeout(legendTimer);
    legendTimer = window.setTimeout(renderLegend, LEGEND_REFRESH_MS);
  }

  renderChips();
  renderLayers();
  renderLegend();

  return { onMutate };
}
