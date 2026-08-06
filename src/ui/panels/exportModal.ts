// Modal Export: kopiowanie i pobieranie mapy w formatach v2 oraz podglad legacy (v1).
// Modul buduje SAM modal - przycisk, ktory go otwiera, stoi w karcie Project (panels/project.ts).
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
import { PanelsCtx, copyToClipboard, download, errorMessage, guarded } from './context';

export interface ExportPanel {
  /** Otwiera modal Export ze swiezym podgladem legacy - wola go przycisk w karcie Project. */
  open(): void;
}

export function initExportModal(ctx: PanelsCtx): ExportPanel {
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

  // Legacy (v1): Array of strings / Array of arrays. Format Text pokrywa sie z Copy TXT wyzej,
  // wiec zostal usuniety z tego selecta (exportLegacy nadal go wspiera - Task 5, karta Map
  // w Simplified, zachowuje wszystkie trzy formaty). Pierwsza opcja = default = array-text.
  const legacySelect = el('select', 'scope-select');
  for (const [value, label] of [
    ['array-text', 'Array of strings'], ['array-array', 'Array of arrays'],
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

  return {
    open(): void {
      // podglad liczymy dopiero przy otwarciu - mapa zmieniala sie od ostatniego razu
      refreshLegacy();
      openModal('Export', exportBody);
    },
  };
}
