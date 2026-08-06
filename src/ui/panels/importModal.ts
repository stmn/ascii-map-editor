// Modal Import: wczytanie pliku (.json/.txt/.xp) albo wklejonego tekstu przez wspolny parser.
// Modul buduje SAM modal - przycisk, ktory go otwiera, stoi w karcie Project (panels/project.ts).
import { replaceCommand, snapshotLevel } from '../../core/commands';
import { Grid } from '../../core/grid';
import { Legend } from '../../core/legend';
import { Level, MAX_LAYERS, makeLayer } from '../../core/level';
import { parseProject } from '../../core/project';
import { importXp } from '../../export/rexpaint';
import { button, el } from '../dom';
import { ModalHandle, openModal } from '../modal';
import { PanelsCtx, applyLevelToPanels, errorMessage, playPop, scheduleSave, toast } from './context';

function countCells(grid: Grid): number {
  let n = 0;
  for (const _cell of grid.cells()) n++;
  return n;
}

export interface ImportPanel {
  /** Otwiera modal Import - wola go przycisk w karcie Project. */
  open(): void;
  /**
   * Wspolna sciezka podmiany poziomu po udanym imporcie. Wystawiona na zewnatrz dla karty Map
   * (tryb Simplified), ktorej przycisk Load jest tym samym importem wklejonego tekstu - dzieki
   * temu obie drogi maja identyczne migawki historii, toasty i odswiezenia kart.
   */
  applyImported(level: Level): void;
}

export function initImportModal(ctx: PanelsCtx): ImportPanel {
  const { state } = ctx;
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
    // import POZIOMU jest odwracalny (inaczej niz przelaczenie poziomu czy import projektu),
    // wiec zanim podmienimy stan, robimy migawke tego, co uzytkownik wlasnie traci
    const before = snapshotLevel(state.level);
    // wspolny helper podmiany poziomu; importowi dokladamy zapis, pop i podsumowanie
    const trimmed = applyLevelToPanels(ctx, level);
    scheduleSave();
    playPop();
    let cells = 0;
    for (const layer of state.level.layers) cells += countCells(layer.grid);
    // jeden toast na raz - ostrzezenie o przycieciu doklejamy do komunikatu importu
    if (trimmed) toast(`Imported ${cells} cells, trimmed to ${MAX_LAYERS} layers`, 'info');
    else toast(`Imported ${cells} cells`);
    importModal?.close();
    ctx.hooks.pushHistory?.(replaceCommand(
      'Import', before, snapshotLevel(state.level), (imported) => { applyLevelToPanels(ctx, imported); },
    ));
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

  return {
    open(): void {
      // uchwyt zapamietujemy przy kazdym otwarciu - udany import zamyka wlasnie ten modal
      importModal = openModal('Import', importBody);
    },
    applyImported,
  };
}
