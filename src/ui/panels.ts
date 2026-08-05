// Panele boczne: brush, legenda, generatory, eksport i import.
// Modul celowo NIE importuje app.ts - stan i callbacki dostaje przez initPanels(ctx),
// dzieki czemu nie powstaje cykl importow (app.ts -> panels.ts, nigdy odwrotnie).
import { Grid } from '../core/grid';
import { Legend } from '../core/legend';
import { Layer, Level, flattenLayers, levelUsedChars, makeLayer } from '../core/level';
import { parseProject, serializeProject } from '../core/project';
import { generateDungeon, generateMaze } from '../core/generators';
import { exportCsv, exportTxt } from '../export/text';
import { exportKaplay } from '../export/kaplay';
import { exportGodot } from '../export/godot';
import { exportTmx } from '../export/tiled';
import { exportXp, importXp } from '../export/rexpaint';
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

/** Warstwa wskazana przez activeLayer - jedyne miejsce indeksujace level.layers. */
function activeLayerOf(state: PanelsState): Layer {
  return state.level.layers[state.activeLayer]!;
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function labeled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', 'field');
  l.append(el('span', undefined, text), control);
  return l;
}

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
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  if (!toastEl) {
    toastEl = el('div', 'toast');
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = kind === 'error' ? 'toast error' : 'toast';
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
    if (isTypingTarget(e.target)) return;
    if (e.key.length !== 1 || e.key === ' ') return;
    setBrush(e.key);
  });

  /** Czysci mape, ale zostawia legende - nazwy i kolory znakow przezywaja, liczniki spadaja do zera. */
  function clearMap(): void {
    if (activeGrid(state).isEmpty()) return;
    if (!window.confirm('Clear the whole map?')) return;
    activeGrid(state).clear();
    ctx.markDirty();
    renderLegend();
    scheduleSave();
    playPop();
  }

  const clearRow = el('div', 'btn-row');
  clearRow.append(button('Clear', 'danger', clearMap));

  drawBox.append(
    chips,
    labeled('Char', charInput),
    clearRow,
    el('p', 'hint help-box', 'Press any character key to switch the brush. Alt or Ctrl + drag erases.'),
  );

  // --- Legend ---
  function usageCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { ch } of activeGrid(state).cells()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
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

  function generate(kind: 'maze' | 'dungeon'): void {
    if (!activeGrid(state).isEmpty() && !window.confirm('Replace the current map?')) return;
    const w = readSize(widthInput, DEFAULT_W);
    const h = readSize(heightInput, DEFAULT_H);
    // na razie generator podmienia siatke aktywnej warstwy - wybor zakresu przyjdzie z panelem warstw
    activeLayerOf(state).grid = kind === 'maze' ? generateMaze(w, h) : generateDungeon(w, h);
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
    button('Maze', '', () => generate('maze')),
    button('Dungeon', '', () => generate('dungeon')),
  );
  generateBox.append(sizes, genButtons, el('p', 'hint', 'Generating replaces the current map.'));

  // --- Export ---
  const exportButtons = el('div', 'btn-col');
  exportButtons.append(
    button('Copy TXT', '', () => void copyToClipboard(exportTxt(activeGrid(state)))),
    button('Copy CSV', '', () => void copyToClipboard(exportCsv(activeGrid(state)))),
    button('Copy KaPlay', '', () => void copyToClipboard(exportKaplay(state.level))),
    button('Copy Godot', '', () => void copyToClipboard(exportGodot(state.level))),
    button('Download .tmx', '', () => download(exportTmx(state.level), 'map.tmx', 'application/xml')),
    button('Download .xp', '', () => void downloadXp()),
    button('Download .json', '', () => download(
      serializeProject(state.level), 'project.json', 'application/json',
    )),
  );
  exportBox.append(exportButtons, el('p', 'hint', '.json keeps map and legend for later import.'));

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

  async function importFile(file: File): Promise<void> {
    try {
      if (file.name.toLowerCase().endsWith('.xp')) {
        const { layers, colors } = await importXp(new Uint8Array(await file.arrayBuffer()));
        // .xp niesie same warstwy i kolory - legende budujemy od zera
        state.level = { layers: layers.map((l) => ({ ...makeLayer(l.name), grid: l.grid })), legend: new Legend() };
        state.activeLayer = 0;
        for (const [ch, hex] of colors) state.level.legend.upsert(ch, { color: hex });
      } else {
        state.level = parseProject(await file.text());
        state.activeLayer = 0;
      }
      state.level.legend.syncWith(levelUsedChars(state.level));
      ctx.centerOnPaper();
      ctx.markDirty();
      renderLegend();
      scheduleSave();
      playPop();
      toast(`Imported ${countCells(flattenLayers(state.level.layers))} cells`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  importBox.append(fileLabel, el('p', 'hint', 'Accepts .json, .txt and REXPaint .xp files.'));

  // --- start ---
  let legendTimer = 0;

  function onMutate(): void {
    scheduleSave();
    window.clearTimeout(legendTimer);
    legendTimer = window.setTimeout(renderLegend, LEGEND_REFRESH_MS);
  }

  renderChips();
  renderLegend();

  return { onMutate };
}
