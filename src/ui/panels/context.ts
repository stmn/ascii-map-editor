// Wspolny kontekst modulow panelu: stan, callbacki do app.ts, hooki miedzymodulowe
// oraz drobne narzedzia UI (toast, dzwiek, autozapis). Jedno miejsce zamiast kopii w kazdym module.
import type { EditorState } from '../../core/editorState';
import { serializeProject } from '../../core/project';
import { el } from '../dom';
// import assetu przez Vite - bundler podmienia URL na wersje z hashem i relatywna baza
import popUrl from '../../assets/pop.wav';

/** Klucz autozapisu w localStorage - app.ts czyta go przy starcie. */
export const STORAGE_KEY = 'ascii-level-editor-v2';
/** Autozapis jest debounce'owany - malowanie sypie mutacjami co komorke. */
const SAVE_DEBOUNCE_MS = 500;
/** Powyzej tego rozmiaru JSON-a nie zapisujemy - localStorage ma zwykle limit ~5MB. */
const MAX_SAVE_BYTES = 4.5 * 1024 * 1024;
const TOAST_MS = 3000;

/**
 * Odwolania miedzy panelami (import odswieza karte warstw i legende, operacje na warstwach
 * odswiezaja legende, legenda ustawia pedzel). Sa cykliczne, wiec zamiast importow trzymamy
 * je w jednym rejestrze - panels.ts podmienia zaslepki na prawdziwe funkcje po zlozeniu modulow.
 */
export interface PanelHooks {
  renderLegend(): void;
  renderLayers(): void;
  setBrush(ch: string): void;
}

export interface PanelsCtx {
  state: EditorState;
  /** Zamawia przerysowanie canvasu. */
  markDirty(): void;
  /** Centruje widok na papierze - app zna rozmiar canvasu i offset panelu. */
  centerOnPaper(): void;
  /** Wolane przez app po kazdej mutacji mapy (malowanie, gumka). */
  onMutate(): void;
  hooks: PanelHooks;
}

// --- male helpery DOM ---------------------------------------------------------

export function requireEl(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

export function errorMessage(e: unknown): string {
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
export function playPop(): void {
  if (!pop) {
    pop = new Audio(popUrl);
    pop.volume = 0.5;
  }
  pop.currentTime = 0;
  pop.play().catch(() => {});
}

// --- autozapis ----------------------------------------------------------------

/** Referencja na obiekt stanu (nie na level - import go podmienia). */
let saveState: EditorState | null = null;
let saveTimer = 0;

function saveNow(): void {
  if (!saveState) return;
  try {
    const json = serializeProject(saveState.level);
    if (json.length > MAX_SAVE_BYTES) return; // za duza mapa - pomijamy zapis
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // brak miejsca albo zablokowany storage - autozapis jest opcjonalny
  }
}

export function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, SAVE_DEBOUNCE_MS);
}

/** Debounce gubi ostatnie pociagniecia przy natychmiastowym zamknieciu karty - domykamy zapis od razu. */
export function flushSave(): void {
  window.clearTimeout(saveTimer);
  saveNow();
}

/** Podpiecie autozapisu do stanu; wolane raz przez panels.ts. */
export function initAutosave(state: EditorState): void {
  saveState = state;
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}
