// Wspolny kontekst modulow panelu: stan, callbacki do app.ts, hooki miedzymodulowe
// oraz drobne narzedzia UI (toast, dzwiek, autozapis). Jedno miejsce zamiast kopii w kazdym module.
import type { EditorState } from '../../core/editorState';
import { serializeProject } from '../../core/project';
import type { LevelRecord, WorkspaceStore } from '../../core/store';
import { el } from '../dom';
import { renderThumb } from '../thumb';
// import assetu przez Vite - bundler podmienia URL na wersje z hashem i relatywna baza
import popUrl from '../../assets/pop.wav';

/** Wskaznik ostatnio otwartego poziomu w localStorage: {"projectId":"...","levelId":"..."}. */
const CURRENT_KEY = 'ascii-level-editor-current';
/** Autozapis jest debounce'owany - malowanie sypie mutacjami co komorke. */
const SAVE_DEBOUNCE_MS = 500;
/** Blad zapisu przy malowaniu powtarza sie co komorke - toast pokazujemy najwyzej raz na tyle ms. */
const SAVE_ERROR_TOAST_MS = 10_000;
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

// --- workspace store i biezacy poziom -----------------------------------------

/** Wskaznik na rekord poziomu; tyle trafia do localStorage pod CURRENT_KEY. */
export interface CurrentRef { projectId: string; levelId: string }

// Jedyne miejsce trzymajace uchwyt magazynu i biezacy rekord - autozapis (nizej)
// i panel projektow (Task 5) czytaja stad, zeby nie powstala druga kopia prawdy.
let store: WorkspaceStore | null = null;
let currentRecord: LevelRecord | null = null;

/** Uchwyt magazynu; null gdy bootstrap w app.ts sie nie powiodl (edytor dziala wtedy bez zapisu). */
export function getStore(): WorkspaceStore | null { return store; }

export function setStore(s: WorkspaceStore): void { store = s; }

/**
 * Rekord biezacego poziomu - trzymamy caly (nie samo id), bo autozapis musi odtworzyc
 * name/order/projectId bez dodatkowego odczytu z magazynu przy kazdym pociagnieciu pedzla.
 */
export function getCurrentLevel(): LevelRecord | null { return currentRecord; }

/**
 * Podmiana biezacego rekordu (boot, przelaczenie poziomu, zmiana nazwy). Wolaj PRZED
 * podmiana state.level, bo domykamy tu zawieszony autozapis - inaczej debounce zapisalby
 * tresc nowego poziomu pod stary rekord.
 */
export function setCurrentLevel(record: LevelRecord): void {
  flushSave();
  currentRecord = record;
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ projectId: record.projectId, levelId: record.id }));
  } catch {
    // wskaznik to tylko wygoda (boot ma fallback na pierwszy poziom) - blad ignorujemy
  }
}

/** Odczyt wskaznika z poprzedniej sesji; null gdy brak, uszkodzony albo storage zablokowany. */
export function readCurrentRef(): CurrentRef | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CurrentRef>;
    if (typeof parsed?.projectId !== 'string' || typeof parsed?.levelId !== 'string') return null;
    return { projectId: parsed.projectId, levelId: parsed.levelId };
  } catch {
    return null;
  }
}

// --- autozapis ----------------------------------------------------------------

/** Referencja na obiekt stanu (nie na level - import go podmienia). */
let saveState: EditorState | null = null;
let saveTimer = 0;
let lastSaveErrorAt = 0;

/**
 * Toast o nieudanym zapisie - z limitem czestosci, bo blad (brak miejsca, zamknieta baza)
 * powtarza sie przy KAZDEJ komorce malowania. Tu trafiaja tez bledy zapisu KvJsonStore.
 */
export function reportSaveError(e: unknown): void {
  const now = Date.now();
  if (now - lastSaveErrorAt < SAVE_ERROR_TOAST_MS) return;
  lastSaveErrorAt = now;
  toast(errorMessage(e), 'error');
}

function saveNow(): void {
  if (!saveState || !store || !currentRecord) return;
  const record: LevelRecord = {
    ...currentRecord,
    data: serializeProject(saveState.level),
    thumb: renderThumb(saveState.level),
    updatedAt: Date.now(),
  };
  currentRecord = record;
  // fire-and-forget: zapis nie moze blokowac malowania. Transakcja IndexedDB startuje
  // synchronicznie w putLevel, wiec flush z pagehide zdazy ja otworzyc przed zamknieciem karty.
  store.putLevel(record).catch(reportSaveError);
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
