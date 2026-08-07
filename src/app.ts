import './styles.css';
import { createLevel, levelUsedChars } from './core/level';
import { parseProject } from './core/project';
import { openIdbStore } from './core/idb';
import {
  KvJsonStore, WORKSPACE_KEY, ensureSeed, type Kv, type LevelRecord, type WorkspaceStore,
} from './core/store';
import { Renderer, centeredPan, paperRect } from './ui/renderer';
import { applySavedLayout } from './ui/layout';
import { applyStoredMode } from './ui/mode';
import { setCenterFabVisible } from './ui/center';
import { InputController } from './ui/input';
import { strokeCommand, type CellChange } from './core/commands';
import {
  activeLayerOf, applyLevelToState, bumpContent, forEachFootprintCell, type EditorState,
} from './core/editorState';
// panele nie importuja app.ts - stan i callbacki dostaja przez initPanels, wiec nie ma cyklu
import { initPanels } from './ui/panels';
import {
  errorMessage, readCurrentRef, reportSaveError, setCurrentLevel, setGestureActiveGetter, setStore, toast,
} from './ui/panels/context';

/** Autozapis sprzed workspace: pojedyncza mapa w localStorage. Czytany raz, przy migracji. */
const LEGACY_KEY = 'ascii-level-editor-v2';
/** Po migracji stary wpis dostaje te nazwe - dane uzytkownika kasujemy dopiero na jego zyczenie. */
const LEGACY_BACKUP_KEY = 'ascii-level-editor-v2-backup';
/** Po tylu ms uznajemy otwarcie IndexedDB za wiszace i schodzimy na fallback. */
const IDB_OPEN_TIMEOUT_MS = 3000;

export type { EditorState };

export const state: EditorState = {
  level: createLevel(),
  activeLayer: 0,
  view: { panX: 0, panY: 0, scale: 32 },
  brush: '#',
  brushSize: 1,
  tool: 'brush',
  contentRev: 0,
  dimOthers: true,
  gridVisible: true,
  colorsEnabled: true,
};

const canvas = document.getElementById('map') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let dirty = true;
/** Zamawia przerysowanie w najblizszej klatce - rysujemy tylko po zmianach. */
export function markDirty(): void { dirty = true; }

/**
 * Docelowy pan wysrodkowujacy papier wzgledem srodka OKNA - sidebary moga na niego nachodzic,
 * mapa zawsze centruje sie na pelnym oknie (v2.9, patrz spec pkt 1). Czysta funkcja
 * (centeredPan w renderer.ts) - JEDYNA implementacja tej matematyki: centerOnPaper stosuje
 * wynik do widoku, isViewCentered porownuje go z biezacym panem (fab centrowania).
 *
 * w/h opcjonalne (domyslnie biezacy rozmiar canvasa) - resize handler potrzebuje policzyc
 * "czy BYL wycentrowany" dla rozmiaru SPRZED zmiany, a canvas.clientWidth/Height to CSS
 * (100vw/100vh) - przegladarka przelicza layout PRZED wyemitowaniem zdarzenia 'resize', wiec
 * w momencie handlera clientWidth juz pokazuje NOWY rozmiar. Jedyny sposob na stary rozmiar
 * to zapamietany zrzut sprzed zmiany (patrz lastViewportW/H nizej).
 */
function targetPan(w = canvas.clientWidth, h = canvas.clientHeight): { panX: number; panY: number } {
  return centeredPan(paperRect(state.level), state.view.scale, w, h);
}

function centerOnPaper(): void {
  const { panX, panY } = targetPan();
  state.view.panX = panX;
  state.view.panY = panY;
}

/** Prog roznicy pan (w px), ponizej ktorego widok liczy sie jako wycentrowany - fab centrowania
 * chowa sie wtedy. Male zaokraglenia zoomu/panu nie moga migotac przyciskiem. */
const CENTER_THRESHOLD_PX = 2;

/** Czy biezacy widok jest (w granicach progu) wycentrowany dla podanego rozmiaru (domyslnie
 * biezacy) - steruje widocznoscia faba, a z jawnym rozmiarem takze ocena "przed resize". */
function isViewCentered(w = canvas.clientWidth, h = canvas.clientHeight): boolean {
  const t = targetPan(w, h);
  return Math.abs(state.view.panX - t.panX) <= CENTER_THRESHOLD_PX
    && Math.abs(state.view.panY - t.panY) <= CENTER_THRESHOLD_PX;
}

/**
 * Rozmiar canvasa z OSTATNIEGO przetworzonego resize (albo z bootu, zanim pierwszy resize
 * nadejdzie) - jedyne miejsce, z ktorego resize handler moze odczytac rozmiar SPRZED biezacej
 * zmiany (zobacz komentarz przy targetPan). Aktualizowane wylacznie w handlerze nizej.
 */
let lastViewportW = canvas.clientWidth;
let lastViewportH = canvas.clientHeight;

// --- pociagniecie pedzla jako jedna komenda historii ---------------------------

/**
 * Komorki zmienione w TRWAJACYM gescie, klucz "id warstwy + pozycja". Powtorne przejscie
 * pedzla po tej samej komorce ma zostawic PIERWSZE before i OSTATNIE after, wiec wpis
 * dopisujemy raz, a potem tylko podmieniamy after.
 */
const strokeCells = new Map<string, CellChange>();

/**
 * Zapis jednej komorki aktywnej warstwy z odnotowaniem zmiany. Wartosc po zapisie czytamy
 * z siatki, bo Grid normalizuje wejscie (spacja to brak wpisu, z dluzszego stringa zostaje
 * pierwszy znak) - bez tego undo probowaloby wracac do wartosci, ktorej nigdy tam nie bylo.
 */
function strokeSet(x: number, y: number, ch: string): void {
  const layer = activeLayerOf(state);
  const before = layer.grid.get(x, y) ?? ' ';
  layer.grid.set(x, y, ch);
  const after = layer.grid.get(x, y) ?? ' ';
  const key = `${layer.id} ${x},${y}`;
  const seen = strokeCells.get(key);
  if (seen) seen.after = after;
  else strokeCells.set(key, { layerId: layer.id, x, y, before, after });
}

/**
 * Jedno dotkniecie pedzla: cala stopka n x n wokol komorki kursora. Interpolacja Bresenhama
 * wola to dla kazdego kroku linii, wiec szybkie przeciagniecie zostawia gruba, ciagla kreske,
 * a wszystkie komorki stopki ida do tego samego gestu historii (dedupe w strokeSet).
 */
function strokeFootprint(x: number, y: number, ch: string): void {
  forEachFootprintCell(x, y, state.brushSize, (cx, cy) => strokeSet(cx, cy, ch));
}

/** localStorage potrafi rzucac (tryb prywatny) - blad odczytu traktujemy jak brak wpisu. */
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Kv na localStorage dla magazynu fallback; blad zapisu obsluguje KvJsonStore przez onWriteError. */
const localStorageKv: Kv = {
  getItem: readLocal,
  setItem: (key, value) => { localStorage.setItem(key, value); },
};

/** Jedyne miejsce tworzace magazyn fallback - boot uzywa go i do zapisu, i do odczytu porzuconej kopii. */
function fallbackStore(): KvJsonStore {
  return new KvJsonStore(localStorageKv, undefined, reportSaveError);
}

/**
 * IndexedDB, a gdy niedostepne (tryb prywatny, blokada) - caly workspace w jednym wpisie localStorage.
 * Otwarcie bazy potrafi tez nigdy nie odpowiedziec (blokada przez inna karte, uszkodzony profil),
 * wiec scigamy je z timeoutem - bez tego caly boot stalby w miejscu i edytor zostalby bez paneli.
 * Spozniony wynik jest ignorowany (przegral wyscig) i od razu zamykamy jego polaczenie, zeby nie
 * trzymalo blokady wersji bazy; ewentualne pozne odrzucenie polykamy, bo fallback juz dziala.
 */
async function openStore(): Promise<{ store: WorkspaceStore; idb: boolean }> {
  const opening = openIdbStore();
  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), IDB_OPEN_TIMEOUT_MS);
  });
  try {
    const store = await Promise.race([opening, timeout]);
    if (store) return { store, idb: true };
  } catch {
    // blad otwarcia idzie ta sama sciezka co timeout - fallback nizej
  }
  opening.then((late) => late.close?.()).catch(() => {});
  toast('Storage fallback: browser storage limited', 'info');
  return { store: fallbackStore(), idb: false };
}

/**
 * Praca osierocona przez fallback: sesja bez IndexedDB zapisala caly workspace do localStorage,
 * a teraz baza dziala i jest pusta. Bez przepisania uzytkownik zobaczylby pusty edytor, majac
 * dane tuz obok. Id zostaja bez zmian (wskaznik biezacego poziomu dalej pasuje), a klucz
 * kasujemy dopiero po udanym przepisaniu calosci.
 */
async function promoteFallbackWorkspace(store: WorkspaceStore): Promise<void> {
  if ((await store.listProjects()).length > 0) return;
  const fallback = fallbackStore();
  const projects = await fallback.listProjects();
  if (projects.length === 0) return;
  for (const project of projects) {
    await store.putProject(project);
    for (const level of await fallback.listLevels(project.id)) await store.putLevel(level);
  }
  try {
    localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // brak dostepu do localStorage - dane sa juz w bazie, wiec kopia moze zostac
  }
  toast('Recovered workspace from browser storage', 'info');
}

/** Rekord do otwarcia: wskaznik z poprzedniej sesji, a gdy go nie ma (albo znikl) - poziom z ensureSeed. */
async function pickLevel(store: WorkspaceStore, seedLevelId: string): Promise<LevelRecord | null> {
  const ref = readCurrentRef();
  if (ref) {
    const record = await store.getLevel(ref.levelId);
    if (record) return record;
  }
  return store.getLevel(seedLevelId);
}

/** Otwarcie magazynu, migracja starego autozapisu i wczytanie biezacego poziomu. */
async function restoreWorkspace(): Promise<void> {
  const { store, idb } = await openStore();
  setStore(store);

  if (idb) {
    try {
      await promoteFallbackWorkspace(store);
    } catch (e) {
      // niepelne przepisanie: klucz fallbacku zostaje (kasujemy go dopiero po calosci),
      // wiec dane sa nadal pod reka - boot leci dalej z tym, co juz wpadlo do bazy
      reportSaveError(e);
    }
  }

  const legacy = readLocal(LEGACY_KEY);
  const seed = await ensureSeed(store, Date.now(), legacy);
  if (seed.migrated && legacy !== null) {
    try {
      // stary klucz zmienia nazwe, a nie znika: gdyby migracja wyszla krzywo, dane wciaz sa pod reka.
      // Powtorki nie ma, bo przy niepustym magazynie ensureSeed juz nie migruje.
      localStorage.setItem(LEGACY_BACKUP_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // brak miejsca na kopie - dane sa juz w magazynie, wiec tylko zostaje stary wpis
    }
    toast('Migrated your map to My project / Level 1', 'info');
  }

  const record = await pickLevel(store, seed.levelId);
  if (!record) return; // magazyn zgubil wlasnie zapisany rekord - startujemy od pustego poziomu
  setCurrentLevel(record);
  try {
    applyLevelToState(state, parseProject(record.data).level);
  } catch (e) {
    toast(errorMessage(e), 'error');
    // uszkodzony rekord: pusty poziom, ale rekord zostaje biezacy - pierwszy zapis go naprawi
    applyLevelToState(state, createLevel());
  }
}

renderer.resize();
// tryb i uklad kolumn PRZED pierwszym malowaniem i przed centrowaniem: oba zapisy leza
// w localStorage (odczyt synchroniczny), a boot czeka na magazyn nawet kilka sekund - bez tego
// uzytkownik zobaczylby najpierw uklad domyslny z pelnym zestawem kart i skok mapy.
// Sam przelacznik i pytanie o tryb przy pierwszym starcie dokladaja panele (initModeUi).
applyStoredMode();
applySavedLayout();
centerOnPaper();

async function boot(): Promise<void> {
  try {
    await restoreWorkspace();
  } catch (e) {
    // awaria magazynu nie moze zabrac edytora - startujemy bez autozapisu
    toast(errorMessage(e), 'error');
  }
  centerOnPaper();

  // panele dostaja stan i callbacki - nie importuja app.ts, wiec nie ma cyklu
  const panels = initPanels({ state, markDirty, centerOnPaper });

  const input = new InputController(canvas, {
    paint(x, y) {
      strokeFootprint(x, y, state.brush);
      // syncWith zbiera i sortuje wszystkie znaki - wolamy tylko gdy pedzel nie ma jeszcze wpisu
      if (!state.level.legend.get(state.brush)) state.level.legend.syncWith(levelUsedChars(state.level));
      bumpContent(state);
      markDirty();
      panels.onMutate();
    },
    erase(x, y) {
      strokeFootprint(x, y, ' ');
      bumpContent(state);
      markDirty();
      panels.onMutate();
    },
    strokeEnd() {
      // gest, ktory niczego nie zmienil (malowanie po tym samym znaku, gumka po pustym),
      // nie zasluguje na wpis w historii - inaczej Ctrl+Z zjadalby "puste" kroki
      const cells = [...strokeCells.values()].filter((c) => c.before !== c.after);
      strokeCells.clear();
      if (cells.length === 0) return;
      panels.pushHistory(strokeCommand(state, cells));
    },
    hover(x, y, erasing) {
      const h = renderer.hover;
      if (h && h.x === x && h.y === y && renderer.eraseHover === erasing) return;
      renderer.hover = { x, y };
      renderer.eraseHover = erasing;
      markDirty();
    },
    viewChanged: markDirty,
    eraserActive: () => state.tool === 'eraser',
  }, state.view);
  setGestureActiveGetter(() => input.isGesturing());

  markDirty();
}

// magazyn jest asynchroniczny; do czasu jego otwarcia (kilkadziesiat ms) rysujemy pusty papier
void boot();

canvas.addEventListener('pointerleave', () => {
  if (!renderer.hover) return;
  renderer.hover = null;
  markDirty();
});

window.addEventListener('resize', () => {
  // wasCentered liczony z lastViewportW/H (rozmiar SPRZED tej zmiany) - NIE z canvas.clientWidth,
  // bo to CSS (100vw/100vh) i przegladarka przelicza layout zanim w ogole wyemituje 'resize',
  // wiec w tym miejscu clientWidth juz pokazuje NOWY rozmiar (patrz komentarz przy targetPan).
  // Boot przy schowanym embedzie (itch) potrafi zlapac canvas 0x0 lub bardzo maly - wtedy pan wychodzi
  // rowny centeredPan(0) i widok liczy sie jako wycentrowany, wiec pierwszy realny resize po ujawnieniu
  // embedu poprawnie wysrodkuje mape zamiast zostawic ja w rogu (zob. zgloszenie usera).
  const wasCentered = isViewCentered(lastViewportW, lastViewportH);
  renderer.resize();
  lastViewportW = canvas.clientWidth;
  lastViewportH = canvas.clientHeight;
  // Widok przesuniety recznie przez usera zostaje NIETKNIETY - poprawiamy pan absolutny tylko wtedy,
  // gdy przed resize mapa byla (w granicach progu) wycentrowana.
  if (wasCentered) centerOnPaper();
  markDirty();
});

// font laduje sie asynchronicznie - po jego gotowosci przerysuj znaki
document.fonts?.ready.then(markDirty).catch(() => {});

function frame(): void {
  if (dirty) {
    dirty = false;
    renderer.draw(state);
    // zoom/pan/resize/przelaczenie trybu/przeciagniecie karty/klik faba koncza sie wszystkie
    // markDirty - jedna sciezka tu wystarcza, zeby fab byl aktualny po kazdym z nich
    setCenterFabVisible(!isViewCentered());
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
