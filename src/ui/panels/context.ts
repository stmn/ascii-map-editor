// Wspolny kontekst modulow panelu: stan, callbacki do app.ts, hooki miedzymodulowe
// oraz drobne narzedzia UI (toast, dzwiek, autozapis). Jedno miejsce zamiast kopii w kazdym module.
import { replaceCommand, snapshotLevel } from '../../core/commands';
import { applyLevelToState, bumpContent, type EditorState } from '../../core/editorState';
import type { Command } from '../../core/history';
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
  /**
   * Odswieza podglad mapy w karcie Map (tryb Simplified). Wolaj wszedzie tam, gdzie zmienila
   * sie TRESC poziomu - karta jest jej drugim widokiem pochodnym, obok legendy. W Advanced
   * karta jest ukryta i wywolanie jest tanim no-opem (patrz panels/map.ts).
   */
  renderMap(): void;
  setBrush(ch: string): void;
  /**
   * Rozsyla ustawiony wlasnie pedzel do pol POZA karta Draw (pole Character w karcie glownej).
   * Wola go setBrush, wiec kazda droga zmiany pedzla (klawisz, chip, legenda, pole Character)
   * konczy sie tak samo - to druga polowa dwustronnej synchronizacji.
   */
  syncBrush(ch: string): void;
  /**
   * Rozmiar pol Width/Height karty Map (Simplified) z obrysu tresci - patrz map.ts/syncSize.
   * Wolane przez applyLevelToPanels PRZY KAZDEJ calkowitej podmianie poziomu (import, przelaczenie
   * poziomu, undo/redo generatora/Clear/resize), zeby ramka podgladu zawsze pasowala do tego, co
   * faktycznie jest na mapie - bez tego np. Ctrl+Z po pomniejszeniu przywracalby tresc pod spodem,
   * ale podglad zostalby przyciety do starej (juz nieaktualnej) ramki.
   */
  syncMapSize(): void;
  /** Podpina panels/history.ts; do jego zlozenia (i w testach bez paneli) wywolania sa cichym no-op. */
  pushHistory?(cmd: Command): void;
}

export interface PanelsCtx {
  state: EditorState;
  /** Zamawia przerysowanie canvasu. */
  markDirty(): void;
  /** Centruje widok na papierze - zawsze wzgledem srodka okna. */
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
 * Historii tu NIE czyscimy - ta sama sciezka wstawia stan cofniety przez komende migawki;
 * kasuje ja wylacznie setCurrentLevel, czyli faktyczne przelaczenie poziomu.
 */
export function applyLevelToPanels(ctx: PanelsCtx, level: Level): boolean {
  const trimmed = applyLevelToState(ctx.state, level);
  ctx.centerOnPaper();
  ctx.markDirty();
  ctx.hooks.renderLayers();
  ctx.hooks.renderLegend();
  ctx.hooks.syncMapSize();
  ctx.hooks.renderMap();
  return trimmed;
}

/**
 * Odwracalna zmiana TRESCI poziomu w miejscu: migawka przed, mutacja, odswiezenie widoku i kart,
 * autozapis, "pop" i wpis w historii. JEDYNA implementacja tej sekwencji - jada nia czyszczenie
 * warstwy (Draw), czyszczenie calej mapy (karta glowna) i oba generatory. Wolajacy dostarcza
 * tylko etykiete historii i sama mutacje; dokladanie kroku (np. toast) nalezy do niego.
 * `center` wlaczaja generatory - podmieniona siatka zmienia rozmiar mapy, wiec widok musi za nia pojsc.
 */
export function applyReplace(
  ctx: PanelsCtx, label: string, mutate: () => void, center = false,
): void {
  const before = snapshotLevel(ctx.state.level);
  mutate();
  bumpContent(ctx.state);
  if (center) ctx.centerOnPaper();
  ctx.markDirty();
  ctx.hooks.renderLegend();
  ctx.hooks.renderMap();
  scheduleSave();
  playPop();
  ctx.hooks.pushHistory?.(replaceCommand(
    label, before, snapshotLevel(ctx.state.level), (level) => { applyLevelToPanels(ctx, level); },
  ));
}

/**
 * Wycentrowanie widoku na papierze. To ustawienie WIDOKU, wiec bez historii i bez autozapisu
 * (jak dim w karcie Layers). Jedna implementacja dla obu przyciskow Center: tego w karcie
 * glownej (replika v1) i plywajacego na dole ekranu (ui/center.ts).
 */
export function recenterView(ctx: PanelsCtx): void {
  ctx.centerOnPaper();
  ctx.markDirty();
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

/**
 * Wspolna oslona akcji, ktora potrafi rzucic (eksport przy zbyt duzych bounds, odmowa schowka).
 * Blad ma wyladowac na czerwonym toascie zamiast po cichu w konsoli - jedno miejsce zamiast
 * try/catch w kazdym przycisku. Obsluguje tez akcje asynchroniczne (.xp, schowek).
 */
export function guarded(run: () => unknown): () => void {
  return () => {
    try {
      const done = run();
      if (done instanceof Promise) void done.catch((e: unknown) => toast(errorMessage(e), 'error'));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
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

// --- schowek ------------------------------------------------------------------

/**
 * Kopia do schowka z popem i toastem - jedna implementacja dla modalu Export i karty Map.
 * Odmowa uprawnien odrzuca obietnice; wolajacy owija to w guarded(), zeby poszla na toast.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  playPop();
  toast('Copied');
}

// --- pobieranie pliku ---------------------------------------------------------

/**
 * Zapis danych na dysk uzytkownika przez sztuczny <a download>. Jedna implementacja dla
 * modalu Export (poziom) i karty Project (caly projekt) - z popem i toastem o nazwie pliku.
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
 * Zaczep przelaczenia poziomu - rejestruje go panels/history.ts, zeby wyczyscic historie.
 * Ten sam wzorzec co setOnSaved: setCurrentLevel jest funkcja modulu (wola ja tez boot
 * w app.ts, jeszcze przed zlozeniem paneli), wiec nie ma dostepu do hookow z PanelsCtx.
 */
let levelSwitchHook: (() => void) | null = null;

export function setOnLevelSwitch(fn: () => void): void { levelSwitchHook = fn; }

/**
 * Getter aktywnego gestu (malowanie/gumka) z InputController - wpiety dopiero po jego
 * utworzeniu w app.ts, wiec skroty undo/redo (panels/history.ts) pytaja o niego przez
 * ten posrednik, a nie wprost o instancje kontrolera.
 */
let gestureActiveGetter: (() => boolean) | null = null;

export function setGestureActiveGetter(fn: () => boolean): void { gestureActiveGetter = fn; }

export function isGestureActive(): boolean { return gestureActiveGetter?.() ?? false; }

/**
 * Podmiana biezacego rekordu - TYLKO przy prawdziwym przelaczeniu poziomu (boot, wybor
 * innego poziomu). Wolaj PRZED podmiana state.level, bo domykamy tu zawieszony autozapis:
 * inaczej debounce zapisalby tresc nowego poziomu pod stary rekord.
 */
export function setCurrentLevel(record: LevelRecord): void {
  flushSave();
  currentRecord = record;
  writePointer(record);
  // komendy dotycza poziomu, ktory wlasnie opuszczamy - ich cofniecie nie mialoby juz sensu
  levelSwitchHook?.();
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
let saveErrorCount = 0;

/**
 * Licznik WSZYSTKICH bledow zapisu, takze tych, ktorych toast nie pokazal przez limit czestosci.
 * Operacje wsadowe (import projektu) porownuja go przed i po, zeby nie chwalic sie sukcesem,
 * gdy magazyn fallback po cichu polknal czesc zapisow.
 */
export function getSaveErrorCount(): number { return saveErrorCount; }

/**
 * Toast o nieudanym zapisie - z limitem czestosci, bo blad (brak miejsca, zamknieta baza)
 * powtarza sie przy KAZDEJ komorce malowania. Tu trafiaja tez bledy zapisu KvJsonStore.
 */
export function reportSaveError(e: unknown): void {
  saveErrorCount++;
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
