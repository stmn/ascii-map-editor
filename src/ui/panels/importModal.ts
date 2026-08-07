// Modal Import: krok 1 wsad (plik dowolnego rozszerzenia LUB wklejony tekst), krok 2 automatyczna
// detekcja (detectImport) - dialog pokazuje TYLKO co realnie rozpoznal i adekwatne akcje.
// Modul buduje SAM modal - przycisk, ktory go otwiera, stoi w karcie Project (panels/project.ts).
import { replaceCommand, snapshotLevel } from '../../core/commands';
import { DetectedImport, detectImport } from '../../core/importDetect';
import { Level, MAX_LAYERS } from '../../core/level';
import { mergeLegendKeepingOld } from '../../core/legend';
import { importProject, nextName, type WorkspaceStore } from '../../core/store';
import { decompressXpBytes } from '../../export/rexpaint';
import { button, el } from '../dom';
import { ModalHandle, openModal } from '../modal';
import {
  PanelsCtx, applyLevelToPanels, errorMessage, getSaveErrorCount, guarded, playPop,
  scheduleSave, setCurrentLevel, toast,
} from './context';
import { makeLevelRecord } from './project';

/**
 * Kontekst magazynu przekazywany przy otwarciu - ten sam wzorzec co ExportProjectContext w
 * exportModal.ts (patrz 1d8d30f). Bez niego akcje na store (Add as new level/Add project(s))
 * sa disabled z krotkim hintem; Replace current level dziala zawsze (operuje na state.level).
 * onChanged to jedyna roznica wzgledem Exportu: Import faktycznie zmienia magazyn, wiec
 * wolajacy (karta Project, Task 5) dostaje tedy sygnal do odswiezenia swojej listy -
 * modal sam nie zna projektow/poziomow wolajacego.
 */
export interface ImportProjectContext {
  store?: WorkspaceStore;
  projectId?: string;
  onChanged?: () => void;
}

export interface ImportPanel {
  /** Otwiera modal Import - wola go przycisk w karcie Project. */
  open(projectCtx?: ImportProjectContext): void;
  /**
   * Wspolna sciezka podmiany poziomu po udanym imporcie. Wystawiona na zewnatrz dla karty Map
   * (tryb Simplified), ktorej przycisk Load jest tym samym importem wklejonego tekstu - dzieki
   * temu obie drogi maja identyczne migawki historii, toasty i odswiezenia kart.
   * explicitLegend: czy `level` przyniosl wlasna legende (v2/v3 json, .xp) - gdy nie, znaki
   * obecne w DOTYCHCZASOWEJ legendzie zachowuja swoj name/color (patrz mergeLegendKeepingOld).
   */
  applyImported(level: Level, explicitLegend: boolean): void;
}

function countCells(level: Level): number {
  let n = 0;
  for (const layer of level.layers) for (const _cell of layer.grid.cells()) n++;
  return n;
}

/** Toast wspolny dla Replace i Add as new level - obie sciezki "importuja" ten sam Level. */
function toastImportedLevel(level: Level, trimmed: boolean): void {
  const cells = countCells(level);
  // jeden toast na raz - ostrzezenie o przycieciu doklejamy do komunikatu importu
  if (trimmed) toast(`Imported ${cells} cells, trimmed to ${MAX_LAYERS} layers`, 'info');
  else toast(`Imported ${cells} cells`);
}

export function initImportModal(ctx: PanelsCtx): ImportPanel {
  const { state } = ctx;

  /** Kontekst z ostatniego open() - domyslnie pusty, wiec akcje na store startuja disabled. */
  let projectCtx: ImportProjectContext = {};
  /** Uchwyt otwartego modalu Import - udana akcja go zamyka, blad zostawia otwarty. */
  let importModal: ModalHandle | null = null;

  /** Podmiana poziomu po udanym imporcie - jedyna implementacja tej sciezki (Replace i karta Map). */
  function applyImported(level: Level, explicitLegend: boolean): void {
    // Zrodlo bez jawnej legendy (plain text, v1, warianty map/rows/tiles/cells) nie ma prawa
    // zresetowac wlasnych ustawien uzytkownika - znaki obecne w DOTYCHCZASOWEJ legendzie trzymaja
    // swoj name/color, nowe zostaja z auto-palety (level.legend juz jest po syncWith - parseProject).
    // Plik z WLASNA legenda (v2/v3 json, .xp) wygrywa w calosci - bez zmian, jak dotad.
    if (!explicitLegend) level.legend = mergeLegendKeepingOld(state.level.legend, level.legend);
    // import POZIOMU jest odwracalny (inaczej niz przelaczenie poziomu czy import projektu),
    // wiec zanim podmienimy stan, robimy migawke tego, co uzytkownik wlasnie traci
    const before = snapshotLevel(state.level);
    const trimmed = applyLevelToPanels(ctx, level);
    scheduleSave();
    playPop();
    toastImportedLevel(state.level, trimmed);
    importModal?.close();
    ctx.hooks.pushHistory?.(replaceCommand(
      'Import', before, snapshotLevel(state.level), (imported) => { applyLevelToPanels(ctx, imported); },
    ));
  }

  /**
   * Add as new level: sciezka jak "New level" w project.ts (nastepny wolny numer po istniejacych
   * nazwach, order za ostatnim poziomem), z tym ze dane rekordu to WGRANY poziom zamiast pustego.
   * Operacja na store bez historii - setCurrentLevel przelacza tozsamosc biezacego poziomu, co
   * (jak kazde przelaczenie) czysci historie undo/redo poprzedniego poziomu.
   */
  async function addAsNewLevel(store: WorkspaceStore, projectId: string, level: Level): Promise<void> {
    const levels = await store.listLevels(projectId);
    const order = levels.reduce((max, l) => Math.max(max, l.order), 0) + 1;
    // ksztalt rekordu zyje w JEDNYM miejscu (project.ts) - tu tylko WGRANY poziom zamiast pustego
    const record = makeLevelRecord(projectId, nextName('Level', levels.map((l) => l.name)), order, level);
    await store.putLevel(record);
    setCurrentLevel(record);
    const trimmed = applyLevelToPanels(ctx, level);
    playPop();
    toastImportedLevel(state.level, trimmed);
    importModal?.close();
    projectCtx.onChanged?.();
  }

  /** Add project(s): istniejaca sciezka merge-add importProject (core/store.ts). */
  async function addProjects(store: WorkspaceStore, json: string): Promise<void> {
    // magazyn fallback polyka bledy zapisu (miekki kontrakt KvJsonStore), wiec importProject
    // moze wrocic "sukcesem" mimo niezapisanych rekordow - licznik bledow to jedyny slad
    const errorsBefore = getSaveErrorCount();
    const added = await importProject(store, json, Date.now());
    playPop();
    if (getSaveErrorCount() > errorsBefore) {
      toast('Import may be incomplete - storage errors occurred', 'error');
    } else {
      toast(`Imported ${added.projects} projects, ${added.levels} levels`);
    }
    importModal?.close();
    projectCtx.onChanged?.();
  }

  // --- Krok 1: wsad - plik dowolnego rozszerzenia LUB wklejony tekst -------------------------

  const fileInput = el('input', 'file-input');
  fileInput.type = 'file';
  const fileLabel = el('label', 'file-btn', 'Load file...');
  fileLabel.append(fileInput);

  const pasteArea = el('textarea', 'modal-text');
  pasteArea.placeholder = 'Paste map, level or project here';
  pasteArea.setAttribute('aria-label', 'Data to import');

  // --- Krok 2: rozpoznanie - podsumowanie detectImport + adekwatne akcje ---------------------

  const resultBox = el('div');

  function showError(message: string): void {
    resultBox.replaceChildren(el('p', 'import-error', message));
  }

  function actionButtons(detected: DetectedImport): HTMLElement {
    const row = el('div', 'btn-row');
    switch (detected.kind) {
      case 'level': {
        const { level, explicitLegend } = detected;
        row.append(button(
          'Replace current level', 'success', guarded(() => applyImported(level, explicitLegend)),
        ));
        const ready = !!(projectCtx.store && projectCtx.projectId);
        // Add as new level: bez merge legendy - to nowy poziom, dostaje dokladnie to co przyszlo
        // (auto-paleta gdy bez jawnej legendy, plik w calosci gdy z jawna) - patrz addAsNewLevel.
        const add = button('Add as new level', '', guarded(() => {
          const { store, projectId } = projectCtx;
          if (store && projectId) return addAsNewLevel(store, projectId, level);
        }));
        add.disabled = !ready;
        add.title = ready ? '' : 'Open a project to add a new level';
        row.append(add);
        break;
      }
      case 'project':
      case 'projects': {
        const ready = !!projectCtx.store;
        const noun = detected.kind === 'project' ? 'project' : 'projects';
        const add = button(`Add ${noun}`, '', guarded(() => {
          const { store } = projectCtx;
          if (store) return addProjects(store, detected.json);
        }));
        add.disabled = !ready;
        add.title = ready ? '' : `Storage unavailable - cannot add ${noun}`;
        row.append(add);
        break;
      }
    }
    return row;
  }

  function showResult(detected: DetectedImport): void {
    resultBox.replaceChildren(el('p', 'modal-message', detected.summary), actionButtons(detected));
  }

  /** Wspolna detekcja pliku i wklejonego tekstu - jedyne miejsce, ktore wola detectImport. */
  function runDetect(payload: string | Uint8Array): void {
    try {
      showResult(detectImport(payload));
    } catch (e) {
      // blad zostaje w dialogu (nie toast), zeby wsad dalo sie poprawic bez ponownego otwarcia
      showError(errorMessage(e));
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    // reset od razu, zeby ponowny wybor tego samego pliku znowu wywolal change
    fileInput.value = '';
    if (file) void handleFile(file);
  });

  async function handleFile(file: File): Promise<void> {
    // wybor pliku zastepuje wklejony tekst jako aktualny wsad - jeden wynik na raz
    pasteArea.value = '';
    try {
      if (file.name.toLowerCase().endsWith('.xp')) {
        // .xp na dysku jest gzip (patrz rexpaint.ts) - detectImport dostaje juz rozpakowany
        // surowy layout, tak samo jak jego testowa fixture (buildXpBytes, bez kompresji)
        const raw = await decompressXpBytes(new Uint8Array(await file.arrayBuffer()));
        runDetect(raw);
      } else {
        runDetect(await file.text());
      }
    } catch (e) {
      showError(errorMessage(e));
    }
  }

  // wklejenie/wpisanie leci przez ten sam runDetect co plik - bez osobnego przycisku Load
  pasteArea.addEventListener('input', () => {
    const text = pasteArea.value;
    if (!text.trim()) { resultBox.replaceChildren(); return; } // pusty wsad - krok 2 znika
    runDetect(text);
  });

  const importBody = el('div');
  importBody.append(
    fileLabel,
    el('p', 'hint help-box hint-small', 'Accepts a level, project or legacy workspace - JSON, plain text or REXPaint .xp.'),
    el('hr', 'modal-sep'),
    pasteArea,
    resultBox,
  );

  return {
    open(openCtx: ImportProjectContext = {}): void {
      projectCtx = openCtx;
      // krok 1 pusty przy kazdym otwarciu - poprzedni wsad/wynik nie ma sensu dla nowego importu
      pasteArea.value = '';
      resultBox.replaceChildren();
      importModal = openModal('Import', importBody);
    },
    applyImported,
  };
}
