// Panele boczne: kompozytor modulow z katalogu panels/.
// Modul celowo NIE importuje app.ts - stan i callbacki dostaje przez initPanels(ctx),
// dzieki czemu nie powstaje cykl importow (app.ts -> panels.ts, nigdy odwrotnie).
import type { EditorState } from '../core/editorState';
import { PanelHooks, PanelsCtx, initAutosave, requireEl, scheduleSave } from './panels/context';
import { initDraw } from './panels/draw';
import { initLayers } from './panels/layers';
import { initLegend } from './panels/legend';
import { initGenerate } from './panels/generate';
import { initExportModal } from './panels/exportModal';
import { initImportModal } from './panels/importModal';

/** Odswiezenie legendy debounce'ujemy - pelny re-render przy kazdej komorce byloby marnotrawstwem. */
const LEGEND_REFRESH_MS = 150;

// Re-eksporty dla zgodnosci: stara nazwa typu i helpery, ktore mieszkaja juz w innych modulach.
export type PanelsState = EditorState;
export { STORAGE_KEY, toast } from './panels/context';
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
}

export function initPanels(ctx: PanelsContext): Panels {
  const { state } = ctx;
  const drawBox = requireEl('panel-draw');
  const layersBox = requireEl('panel-layers');
  const legendBox = requireEl('panel-legend');
  const generateBox = requireEl('panel-generate');
  const exportBox = requireEl('panel-export');
  const importBox = requireEl('panel-import');

  initAutosave(state);

  let legendTimer = 0;

  function onMutate(): void {
    scheduleSave();
    window.clearTimeout(legendTimer);
    legendTimer = window.setTimeout(() => hooks.renderLegend(), LEGEND_REFRESH_MS);
  }

  // zaslepki na czas skladania modulow - odwolania miedzy panelami sa cykliczne,
  // wiec prawdziwe funkcje podpinamy dopiero gdy wszystkie moduly powstana
  const hooks: PanelHooks = { renderLegend: () => {}, renderLayers: () => {}, setBrush: () => {} };
  const panelsCtx: PanelsCtx = { ...ctx, onMutate, hooks };

  const draw = initDraw(panelsCtx, drawBox);
  const layers = initLayers(panelsCtx, layersBox);
  const legend = initLegend(panelsCtx, legendBox);
  hooks.setBrush = draw.setBrush;
  hooks.renderLayers = layers.render;
  hooks.renderLegend = legend.render;

  initGenerate(panelsCtx, generateBox);
  initExportModal(panelsCtx, exportBox);
  initImportModal(panelsCtx, importBox);

  draw.render();
  layers.render();
  legend.render();

  return { onMutate };
}
