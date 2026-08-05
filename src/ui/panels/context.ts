// Wspolny kontekst modulow panelu: stan, callbacki do app.ts, hooki miedzymodulowe
// oraz drobne narzedzia UI (toast, dzwiek, autozapis). Jedno miejsce zamiast kopii w kazdym module.
import { applyLevelToState, type EditorState } from '../../core/editorState';
import type { Level } from '../../core/level';
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

/**
 * Wstawienie poziomu do stanu wraz z odswiezeniem widoku i kart - warstwa UI nad
 * applyLevelToState (jedyna implementacja podmiany level). Wspolna sciezka importu pliku
 * i przelaczania poziomow. Zapis zostawiamy wolajacemu: import musi zapisac nowa tresc,
 * przelaczenie poziomu nie ma czego zapisywac (tresc wlasnie przyszla z magazynu).
 * Zwraca true gdy warstwy zostaly przyciete.
 */
export function applyLevelToPanels(ctx: PanelsCtx, level: Level): boolean {
  const trimmed = applyLevelToState(ctx.state, level);
  ctx.centerOnPaper();
  ctx.markDirty();
  ctx.hooks.renderLayers();
  ctx.hooks.renderLegend();
  return trimmed;
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

// --- pobieranie pliku ---------------------------------------------------------

/**
 * Zapis danych na dysk uzytkownika przez sztuczny <a download>. Jedna implementacja dla
 * modalu Export (mapa) i karty Project (kopia workspace) - z popem i toastem o nazwie pliku.
 */
export function download(data: BlobPart, filename: string, type: string): void {
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
 * To ZYWY obiekt: modyfikuj go wylacznie przez updateCurrentLevel, nigdy przez wlasna kopie.
 */
export function getCurrentLevel(): LevelRecord | null { return currentRecord; }

function writePointer(record: LevelRecord): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ projectId: record.projectId, levelId: record.id }));
  } catch {
    // wskaznik to tylko wygoda (boot ma fallback na pierwszy poziom) - blad ignorujemy
  }
}

/**
 * Podmiana biezacego rekordu - TYLKO przy prawdziwym przelaczeniu poziomu (boot, wybor
 * innego poziomu). Wolaj PRZED podmiana state.level, bo domykamy tu zawieszony autozapis:
 * inaczej debounce zapisalby tresc nowego poziomu pod stary rekord.
 */
export function setCurrentLevel(record: LevelRecord): void {
  flushSave();
  currentRecord = record;
  writePointer(record);
}

/**
 * Zmiana pol biezacego rekordu w miejscu (nazwa, order, dane). Task 5 MUSI puszczac tedy
 * kazda zmiane nazwy i kolejnosci biezacego poziomu - autozapis czyta ten sam zywy obiekt,
 * wiec wlasna kopia z getCurrentLevel() zostalaby nadpisana przy najblizszym pociagnieciu pedzla.
 * Zapis do magazynu nalezy do wolajacego (putLevel albo scheduleSave).
 */
export function updateCurrentLevel(patch: Partial<LevelRecord>): void {
  if (!currentRecord) return;
  // wskaznik przepisujemy tylko gdy zmienia sie tozsamosc rekordu - nazwa go nie dotyczy
  const identityChanged = (patch.id !== undefined && patch.id !== currentRecord.id)
    || (patch.projectId !== undefined && patch.projectId !== currentRecord.projectId);
  Object.assign(currentRecord, patch);
  if (identityChanged) writePointer(currentRecord);
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
/** Czy od ostatniego zapisu byla mutacja - bez tego flush przy kazdym schowaniu karty klamalby updatedAt. */
let pendingSave = false;
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

/**
 * Jedyny punkt rejestracji obserwatora zapisu - karta Project odswieza nim miniature
 * biezacego poziomu (bez przebudowy listy, wiec nie zabiera fokusu z pola nazwy).
 */
let savedHook: (() => void) | null = null;

export function setOnSaved(fn: () => void): void { savedHook = fn; }

function saveNow(): void {
  if (!saveState || !store || !currentRecord) return;
  pendingSave = false;
  updateCurrentLevel({
    data: serializeProject(saveState.level),
    thumb: renderThumb(saveState.level),
    updatedAt: Date.now(),
  });
  // kopia do magazynu, zeby dalsze edycje zywego rekordu nie ruszaly tego, co poszlo do zapisu.
  // Fire-and-forget: zapis nie moze blokowac malowania, a transakcja IndexedDB startuje
  // synchronicznie w putLevel, wiec flush z pagehide zdazy ja otworzyc przed zamknieciem karty.
  store.putLevel({ ...currentRecord }).catch(reportSaveError);
  savedHook?.();
}

export function scheduleSave(): void {
  pendingSave = true;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, SAVE_DEBOUNCE_MS);
}

/**
 * Debounce gubi ostatnie pociagniecia przy natychmiastowym zamknieciu karty - domykamy zapis od razu.
 * Bez zawieszonej mutacji nie robimy nic: pusty zapis podbijalby updatedAt przy kazdym schowaniu karty.
 */
export function flushSave(): void {
  if (!pendingSave) return;
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
