// Modal Export: kopiowanie i pobieranie mapy w formatach v2 oraz podglad legacy (v1).
import { Bounds, Grid } from '../../core/grid';
import { activeGrid } from '../../core/editorState';
import { flattenLayers, unionBounds } from '../../core/level';
import { serializeProject } from '../../core/project';
import { exportCsv, exportTxt } from '../../export/text';
import { exportKaplay } from '../../export/kaplay';
import { exportGodot } from '../../export/godot';
import { exportTmx } from '../../export/tiled';
import { exportXp } from '../../export/rexpaint';
import { LegacyFormat, exportLegacy } from '../../export/legacy';
import { button, el, labeled } from '../dom';
import { openModal } from '../modal';
import { PanelsCtx, download, errorMessage, playPop, toast } from './context';

/**
 * Wspolna oslona akcji eksportu. Kazdy format potrafi rzucic (np. cap bounds z assertExportableBounds),
 * a taki blad ma wyladowac na czerwonym toascie zamiast po cichu w konsoli. Jedno miejsce zamiast
 * try/catch w kazdym przycisku - obsluguje tez akcje asynchroniczne (.xp, schowek).
 */
function guarded(run: () => unknown): () => void {
  return () => {
    try {
      const done = run();
      if (done instanceof Promise) void done.catch((e: unknown) => toast(errorMessage(e), 'error'));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  playPop();
  toast('Copied');
}

export function initExportModal(ctx: PanelsCtx, exportBox: HTMLElement): void {
  const { state } = ctx;
  const scopeSelect = el('select', 'scope-select');
  for (const [value, label] of [['active', 'Active layer'], ['flat', 'Flattened']] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    scopeSelect.append(option);
  }
  scopeSelect.setAttribute('aria-label', 'Export scope');

  /** Siatka wybrana przez dropdown Scope - tylko dla TXT/CSV, reszta eksportow bierze caly level. */
  function scopeGrid(): Grid {
    return scopeSelect.value === 'flat' ? flattenLayers(state.level.layers) : activeGrid(state);
  }

  /** Wspolne obrysowanie wszystkich warstw - dzieki temu pliki z roznych warstw sa wyrownane. */
  function scopeBounds(): Bounds | undefined {
    return unionBounds(state.level.layers) ?? undefined;
  }

  async function downloadXp(): Promise<void> {
    const bytes = await exportXp(state.level);
    download(bytes.slice(), 'map.xp', 'application/octet-stream');
  }

  const exportButtons = el('div', 'btn-col');
  exportButtons.append(
    button('Copy TXT', '', guarded(() => copyToClipboard(exportTxt(scopeGrid(), scopeBounds())))),
    button('Copy CSV', '', guarded(() => copyToClipboard(exportCsv(scopeGrid(), scopeBounds())))),
    button('Copy KaPlay', '', guarded(() => copyToClipboard(exportKaplay(state.level)))),
    button('Copy Godot', '', guarded(() => copyToClipboard(exportGodot(state.level)))),
    button('Download .tmx', '', guarded(() => download(exportTmx(state.level), 'map.tmx', 'application/xml'))),
    button('Download .xp', '', guarded(downloadXp)),
    button('Download .json', '', guarded(() => download(
      serializeProject(state.level), 'project.json', 'application/json',
    ))),
  );

  // Legacy (v1): ten sam zestaw formatow co pole SWITCH FORMAT w pierwszym edytorze.
  const legacySelect = el('select', 'scope-select');
  for (const [value, label] of [
    ['text', 'Text'], ['array-text', 'Array of strings'], ['array-array', 'Array of arrays'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    legacySelect.append(option);
  }
  legacySelect.setAttribute('aria-label', 'Legacy format');

  const legacyText = el('textarea', 'modal-text');
  legacyText.readOnly = true;
  legacyText.setAttribute('aria-label', 'Legacy export preview');

  /** Podglad zalezy od Scope i formatu - odswiezamy przy otwarciu modalu i kazdej zmianie. */
  function refreshLegacy(): void {
    try {
      legacyText.value = exportLegacy(scopeGrid(), legacySelect.value as LegacyFormat, scopeBounds());
    } catch (e) {
      // podglad odswieza sie przy kazdej zmianie pola, wiec blad pokazujemy w samym polu
      // (readonly) zamiast zasypywac uzytkownika toastami
      legacyText.value = errorMessage(e);
    }
  }

  scopeSelect.addEventListener('change', refreshLegacy);
  legacySelect.addEventListener('change', refreshLegacy);

  const exportBody = el('div');
  exportBody.append(
    labeled('Scope', scopeSelect),
    exportButtons,
    el('p', 'hint', 'Scope applies to TXT, CSV and Legacy. .json keeps every layer and the legend for later import.'),
    el('p', 'modal-heading', 'Legacy (v1)'),
    labeled('Format', legacySelect),
    legacyText,
    button('Copy legacy', 'btn-full', guarded(() => copyToClipboard(legacyText.value))),
  );

  exportBox.append(button('Export...', 'btn-full', () => {
    refreshLegacy();
    openModal('Export', exportBody);
  }));
}
