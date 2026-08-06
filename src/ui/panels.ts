// Panele boczne: kompozytor modulow z katalogu panels/.
// Modul celowo NIE importuje app.ts - stan i callbacki dostaje przez initPanels(ctx),
// dzieki czemu nie powstaje cykl importow (app.ts -> panels.ts, nigdy odwrotnie).
import type { Command } from '../core/history';
import type { EditorState } from '../core/editorState';
import { initCenterButton } from './center';
import { initLayout } from './layout';
import { initModeUi, isSimplified } from './mode';
import {
  PanelHooks, PanelsCtx, initAutosave, recenterView, requireEl, scheduleSave,
} from './panels/context';
import { initDraw } from './panels/draw';
import { initHistory } from './panels/history';
import { initLayers } from './panels/layers';
import { initLegend } from './panels/legend';
import { initGenerate } from './panels/generate';
import { initExportModal } from './panels/exportModal';
import { initImportModal } from './panels/importModal';
import { initMap } from './panels/map';
import { initExtra } from './panels/extra';
import { initProject } from './panels/project';

/**
 * Widoki pochodne tresci mapy (legenda, podglad w karcie Map) odswiezamy z debounce - pelny
 * re-render przy kazdej pomalowanej komorce byloby marnotrawstwem.
 */
const CONTENT_REFRESH_MS = 150;

// Re-eksporty dla zgodnosci: stara nazwa typu i helpery, ktore mieszkaja juz w innych modulach.
export type PanelsState = EditorState;
export { toast } from './panels/context';
export { activeGrid, trimLayers } from '../core/editorState';

export interface PanelsContext {
  state: EditorState;
  /** Zamawia przerysowanie canvasu. */
  markDirty(): void;
  /** Centruje widok na papierze - app zna rozmiar canvasu i offset panelu. */
  centerOnPaper(): void;
}

export interface Panels {
  /** Wolane przez app po kazdej mutacji mapy (malowanie, gumka). */
  onMutate(): void;
  /** Wpis do historii - app pcha tedy komende calego pociagniecia pedzla. */
  pushHistory(cmd: Command): void;
}

export function initPanels(ctx: PanelsContext): Panels {
  const { state } = ctx;
  const projectBox = requireEl('panel-project');
  const drawBox = requireEl('panel-draw');
  const layersBox = requireEl('panel-layers');
  const legendBox = requireEl('panel-legend');
  const generateBox = requireEl('panel-generate');
  const mapBox = requireEl('panel-map');
  const extraBox = requireEl('panel-extra');

  initAutosave(state);

  let refreshTimer = 0;

  function onMutate(): void {
    scheduleSave();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      hooks.renderLegend();
      hooks.renderMap();
    }, CONTENT_REFRESH_MS);
  }

  // zaslepki na czas skladania modulow - odwolania miedzy panelami sa cykliczne,
  // wiec prawdziwe funkcje podpinamy dopiero gdy wszystkie moduly powstana
  const hooks: PanelHooks = {
    renderLegend: () => {}, renderLayers: () => {}, renderMap: () => {},
    setBrush: () => {}, syncBrush: () => {},
  };
  const panelsCtx: PanelsCtx = { ...ctx, onMutate, hooks };

  // przed initDraw: oba dokladaja do #panel-draw, wiec rzad Undo/Redo laduje na gorze karty
  initHistory(panelsCtx, drawBox);
  const draw = initDraw(panelsCtx, drawBox);
  const layers = initLayers(panelsCtx, layersBox);
  const legend = initLegend(panelsCtx, legendBox);
  hooks.setBrush = draw.setBrush;
  hooks.renderLayers = layers.render;
  hooks.renderLegend = legend.render;

  initGenerate(panelsCtx, generateBox);
  // Export i Import nie maja wlasnej karty - moduly buduja same modale, a otwieraja je
  // dropdowny Export/Import w karcie Project, wiec init musi wyprzedzic initProject
  const exportPanel = initExportModal(panelsCtx);
  const importPanel = initImportModal(panelsCtx);
  // Load w karcie Map to ten sam import co wklejony tekst - karta dostaje gotowa sciezke
  // z modulu Import zamiast wlasnej kopii podmiany poziomu
  const map = initMap(panelsCtx, mapBox, importPanel.applyImported);
  hooks.renderMap = map.refresh;
  // pole Character z karty glownej ma nadazac za pedzlem ustawionym gdzie indziej (klawisz, chip)
  hooks.syncBrush = map.syncBrush;
  // karta Extra features czyta z karty glownej rozmiar mapy i chowa sie przez jej checkbox
  initExtra(panelsCtx, extraBox, map);
  // karta projektow czyta magazyn asynchronicznie i sama rejestruje sie na zdarzenie zapisu
  // (odswiezanie miniatury biezacego poziomu) - nie potrzebuje wpisu w hookach miedzypanelowych.
  // Dropdowny Export/Import poziomu dzialaja niezaleznie od magazynu/projektow (modale operuja
  // na state.level), wiec zostaja widoczne nawet w degenerowanych galeziach karty.
  const project = initProject(
    panelsCtx, projectBox, { openExport: exportPanel.open, openImport: importPanel.open },
  );

  draw.render();
  layers.render();
  legend.render();
  map.refresh();
  project.render();

  /**
   * Zmiana skladu widocznych kart (upuszczenie karty, przelaczenie trybu) zmienia szerokosci
   * kolumn, wiec mape przesuwamy TYLKO w poziomie o roznice offsetu - pelne centrowanie
   * skasowaloby reczne przewiniecie w pionie. Jedno zachowanie dla obu zrodel zmiany.
   */
  function shiftView(offsetShift: number): void {
    state.view.panX += offsetShift;
    ctx.markDirty();
  }

  // przeciaganie kart podpinamy na koncu: karty maja juz tresc, a przeniesienie <details>
  // miedzy kolumnami nie rusza ich sluchaczy (element zmienia rodzica, nie tozsamosc)
  initLayout(shiftView);

  // plywajacy Center: stoi poza kartami, wiec dziala w obu trybach i przy kazdym ukladzie kolumn
  initCenterButton(() => recenterView(panelsCtx));

  // przelacznik trybu (i pytanie o tryb przy pierwszym starcie) na samym koncu: modal wyboru
  // ma wypasc nad gotowym edytorem, a wejscie w Simplified musi zastac karte Map do odswiezenia
  initModeUi((offsetShift) => {
    shiftView(offsetShift);
    hooks.renderMap();
    // karta Draw (i jej gumka) jest w Simplified ukryta - narzedzie wraca do Brush, zeby
    // gumka nie mogla zostac wlaczona bez widocznej kontrolki do jej wylaczenia
    if (isSimplified() && state.tool !== 'brush') {
      state.tool = 'brush';
      draw.render();
    }
  });

  return { onMutate, pushHistory: (cmd) => hooks.pushHistory?.(cmd) };
}
