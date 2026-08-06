// Modal Export: dwa zakresy w jednym dialogu.
// "This level" - lista formatow jako klikalne wiersze (radio), z opcjami warstw kontekstowymi
// dla formatu i zywym podgladem. "Whole project" - caly projekt jako project.json (dziala
// tylko gdy wolajacy przekazal store+projectId przy otwarciu - patrz open()).
// Akcje sa zawsze te same dwa przyciski w tym samym miejscu (Copy/Save file), retargetowane
// na aktualnie wybrany format/zakres - nie ma osobnej pary przyciskow na kazdy wiersz.
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
import { exportProject, type WorkspaceStore } from '../../core/store';
import { button, el, labeled } from '../dom';
import { openModal } from '../modal';
import { PanelsCtx, copyToClipboard, download, errorMessage, flushSave, guarded } from './context';

/** Kontekst projektu przekazywany przy otwarciu - opcjonalny, dopoki karta Project (Task 5) go nie dostarcza. */
export interface ExportProjectContext {
  store?: WorkspaceStore;
  projectId?: string;
}

export interface ExportPanel {
  /** Otwiera modal Export ze swiezym podgladem - wola go przycisk w karcie Project.
   *  Bez argumentu dziala zawsze (poziom operuje na state.level); z kontekstem odblokowuje zakres Whole project. */
  open(projectCtx?: ExportProjectContext): void;
}

type Scope = 'level' | 'project';
type LayersMode = 'merged' | 'active' | 'each';
type FormatKey = 'txt' | 'csv' | 'kaplay' | 'godot' | 'tmx' | 'xp' | 'json' | 'legacy';

interface FormatSpec {
  key: FormatKey;
  label: string;
  desc: string;
  badge: 'flattened' | 'kept';
  filename: string;
  mime: string;
  /** null = format nie ma opcji Layers (bierze zawsze cale warstwy - Godot/tmx/xp/json). */
  layerChoices: LayersMode[] | null;
  /** Tylko Legacy: druga linia opcji z wyborem wariantu array-text/array-array. */
  legacyVariant: boolean;
}

const LAYERS_ALL: LayersMode[] = ['merged', 'active', 'each'];
const LAYERS_NO_EACH: LayersMode[] = ['merged', 'active'];

const LAYERS_LABELS: Record<LayersMode, string> = {
  merged: 'All merged', active: 'Active layer', each: 'Each layer separately',
};

// Kolejnosc = kolejnosc wierszy w dialogu. Opisy i nazwy formatow sa verbatim ze specyfikacji
// Taska 3 - nie parafrazowac, testy odbiorcze porownuja dokladnie ten tekst.
const FORMATS: FormatSpec[] = [
  {
    key: 'txt', label: 'TXT', desc: 'Plain text grid, one char per cell', badge: 'flattened',
    filename: 'map.txt', mime: 'text/plain', layerChoices: LAYERS_ALL, legacyVariant: false,
  },
  {
    key: 'csv', label: 'CSV', desc: 'Comma separated grid', badge: 'flattened',
    filename: 'map.csv', mime: 'text/csv', layerChoices: LAYERS_ALL, legacyVariant: false,
  },
  {
    key: 'kaplay', label: 'KaPlay', desc: 'addLevel snippet for kaplayjs.com', badge: 'flattened',
    filename: 'kaplay.js', mime: 'text/javascript', layerChoices: LAYERS_NO_EACH, legacyVariant: false,
  },
  {
    key: 'godot', label: 'Godot', desc: 'GDScript dictionaries, one per layer', badge: 'kept',
    filename: 'godot.gd', mime: 'text/plain', layerChoices: null, legacyVariant: false,
  },
  {
    key: 'tmx', label: 'Tiled .tmx', desc: 'One tile layer per editor layer', badge: 'kept',
    filename: 'map.tmx', mime: 'application/xml', layerChoices: null, legacyVariant: false,
  },
  {
    key: 'xp', label: 'REXPaint .xp', desc: 'Native multi-layer format', badge: 'kept',
    filename: 'map.xp', mime: 'application/octet-stream', layerChoices: null, legacyVariant: false,
  },
  {
    key: 'json', label: 'Level .json', desc: 'Full level for re-import: layers and legend', badge: 'kept',
    filename: 'level.json', mime: 'application/json', layerChoices: null, legacyVariant: false,
  },
  {
    key: 'legacy', label: 'Legacy v1', desc: 'Array formats of the original editor', badge: 'flattened',
    filename: 'legacy.txt', mime: 'text/plain', layerChoices: LAYERS_NO_EACH, legacyVariant: true,
  },
];

export function initExportModal(ctx: PanelsCtx): ExportPanel {
  const { state } = ctx;

  // --- stan dialogu: przezywa miedzy otwarciami jak dawny scopeSelect/legacySelect,
  // poza samym scope - ten wraca do "This level" przy kazdym otwarciu (patrz open()). ---
  let scope: Scope = 'level';
  let format: FormatKey = 'txt';
  let layersMode: LayersMode = 'merged';
  let legacyVariant: LegacyFormat = 'array-text';
  let projectCtx: ExportProjectContext = {};
  let projectName: string | null = null;
  let fetchToken = 0;

  // --- siatki i tresc wg wybranych opcji -----------------------------------------

  /** Wspolny obrys wszystkich warstw - pliki z roznych warstw wychodza wyrownane (patrz "each"). */
  function levelBounds(): Bounds | undefined {
    return unionBounds(state.level.layers) ?? undefined;
  }

  function modeGrid(mode: 'merged' | 'active'): Grid {
    return mode === 'active' ? activeGrid(state) : flattenLayers(state.level.layers);
  }

  /** Blok na warstwe: naglowek (marker/komentarz) + jej wlasna tresc na wspolnym obrysie. */
  function eachLayerBlocks(
    header: (name: string) => string, exportOne: (grid: Grid, bounds?: Bounds) => string,
  ): string[] {
    const bounds = levelBounds();
    return state.level.layers.map((l) => header(l.name) + exportOne(l.grid, bounds));
  }

  /** TXT each-layer: bloki rozdzielone linia markera - nie trzeba dodatkowego odstepu. */
  function txtEachLayers(): string {
    return eachLayerBlocks((name) => `:: ${name}\n`, exportTxt).join('');
  }

  /** CSV each-layer: pusta linia + komentarz przed kolejnym blokiem (prosty, "grep-owalny" format). */
  function csvEachLayers(): string {
    return eachLayerBlocks((name) => `# ${name}\n`, exportCsv).join('\n');
  }

  /** .xp jest binarny (gzip) - podglad to zwykly tekst pierwszej warstwy, albo info gdy pusta. */
  function xpPreview(): string {
    const layer = state.level.layers[0];
    const bounds = layer?.grid.bounds() ?? null;
    if (!layer || !bounds) return '(binary format - nothing to preview)';
    return exportTxt(layer.grid, bounds);
  }

  /**
   * Tresc formatu do podgladu i (poza .xp) do Copy/Save file. .xp ma tu tylko podglad -
   * prawdziwy zapis idzie osobna asynchroniczna sciezka (gzip), a Copy jest dla niego wylaczony.
   */
  function formatText(spec: FormatSpec): string {
    const bounds = levelBounds();
    const merged = layersMode === 'active' ? 'active' : 'merged';
    switch (spec.key) {
      case 'txt':
        return layersMode === 'each' ? txtEachLayers() : exportTxt(modeGrid(merged), bounds);
      case 'csv':
        return layersMode === 'each' ? csvEachLayers() : exportCsv(modeGrid(merged), bounds);
      case 'kaplay':
        return exportKaplay(state.level, layersMode === 'active' ? activeGrid(state) : undefined);
      case 'godot':
        return exportGodot(state.level);
      case 'tmx':
        return exportTmx(state.level);
      case 'json':
        return serializeProject(state.level);
      case 'legacy':
        return exportLegacy(modeGrid(merged), legacyVariant, bounds);
      case 'xp':
        return xpPreview();
    }
  }

  function safePreview(spec: FormatSpec): string {
    try {
      return formatText(spec);
    } catch (e) {
      // podglad odswieza sie przy kazdej zmianie opcji, wiec blad pokazujemy w samym polu
      // (readonly) zamiast zasypywac uzytkownika toastami
      return errorMessage(e);
    }
  }

  async function copyLevelFormat(spec: FormatSpec): Promise<void> {
    await copyToClipboard(formatText(spec));
  }

  async function saveLevelFormat(spec: FormatSpec): Promise<void> {
    if (spec.key === 'xp') {
      download((await exportXp(state.level)).slice(), spec.filename, spec.mime);
      return;
    }
    download(formatText(spec), spec.filename, spec.mime);
  }

  async function copyProject(): Promise<void> {
    const { store, projectId } = projectCtx;
    if (!store || !projectId) return;
    flushSave(); // plik ma zawierac to, co widac - ostatnie pociagniecia pedzla wisza w debounce
    await copyToClipboard(await exportProject(store, projectId));
  }

  async function saveProject(): Promise<void> {
    const { store, projectId } = projectCtx;
    if (!store || !projectId) return;
    flushSave();
    download(await exportProject(store, projectId), 'project.json', 'application/json');
  }

  // --- akcje: jedna para przyciskow, retargetowana na aktualny format/zakres -----

  let doCopy: () => unknown = () => {};
  let doSave: () => unknown = () => {};
  const copyBtn = button('Copy', '', guarded(() => doCopy()));
  const saveBtn = button('Save file', '', guarded(() => doSave()));
  const actionsRow = el('div', 'btn-row');
  actionsRow.append(copyBtn, saveBtn);

  // --- Legacy: select wariantu (array-text/array-array), budowany raz - wartosc przezywa otwarcia. ---
  const legacySelect = el('select', 'scope-select');
  for (const [value, label] of [
    ['array-text', 'Array of strings'], ['array-array', 'Array of arrays'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    legacySelect.append(option);
  }
  legacySelect.setAttribute('aria-label', 'Legacy format');
  legacySelect.addEventListener('change', () => {
    legacyVariant = legacySelect.value as LegacyFormat;
    render();
  });

  /** Podglad, wspolny dla kazdego formatu This level - budowany raz, przenoszony miedzy renderami. */
  const previewText = el('textarea', 'modal-text');
  previewText.readOnly = true;
  previewText.setAttribute('aria-label', 'Export preview');

  // --- budowa DOM ------------------------------------------------------------------

  function setScope(next: Scope): void {
    scope = next;
    render();
  }

  function setFormat(key: FormatKey): void {
    format = key;
    render();
  }

  function setLayersMode(mode: LayersMode): void {
    layersMode = mode;
    render();
  }

  function scopePill(): HTMLElement {
    const projectReady = !!(projectCtx.store && projectCtx.projectId);
    const pill = el('div', 'scope-switch');
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Export scope');
    const levelBtn = button('This level', scope === 'level' ? 'scope-seg active' : 'scope-seg', () => setScope('level'));
    levelBtn.setAttribute('aria-pressed', String(scope === 'level'));
    const projectBtn = button('Whole project', scope === 'project' ? 'scope-seg active' : 'scope-seg', () => setScope('project'));
    projectBtn.setAttribute('aria-pressed', String(scope === 'project'));
    projectBtn.disabled = !projectReady;
    projectBtn.title = projectReady ? '' : 'Open a project to enable whole-project export';
    pill.append(levelBtn, projectBtn);
    return pill;
  }

  function layersPill(choices: LayersMode[]): HTMLElement {
    const pill = el('div', 'scope-switch');
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Layers');
    for (const mode of choices) {
      const btn = button(LAYERS_LABELS[mode], mode === layersMode ? 'scope-seg active' : 'scope-seg', () => setLayersMode(mode));
      btn.setAttribute('aria-pressed', String(mode === layersMode));
      pill.append(btn);
    }
    return pill;
  }

  /** Wiersz formatu: klik gdziekolwiek w label zaznacza radio - bez recznej delegacji zdarzen. */
  function formatRow(f: FormatSpec): HTMLElement {
    const row = el('label', format === f.key ? 'format-row active' : 'format-row');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'export-format';
    radio.value = f.key;
    radio.checked = format === f.key;
    radio.setAttribute('aria-label', f.label);
    radio.addEventListener('change', () => setFormat(f.key));
    const main = el('div', 'format-main');
    main.append(el('span', 'format-name', f.label), el('span', 'format-desc', f.desc));
    row.append(radio, main, el('span', 'format-badge', `layers: ${f.badge}`));
    return row;
  }

  function levelPanel(): HTMLElement {
    const box = el('div', 'field-col');
    const spec = FORMATS.find((f) => f.key === format)!;
    // klamruje layersMode do tego, co dany format wspiera (np. "each" zostawione po TXT nie
    // moze zostac wybrane niewidocznie pod KaPlay/Legacy, ktore go nie oferuja)
    if (spec.layerChoices && !spec.layerChoices.includes(layersMode)) layersMode = 'merged';

    const list = el('div', 'btn-col');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Export format');
    for (const f of FORMATS) list.append(formatRow(f));
    box.append(list);

    if (spec.layerChoices) box.append(labeled('Layers', layersPill(spec.layerChoices)));
    if (spec.legacyVariant) box.append(labeled('Format', legacySelect));

    previewText.value = safePreview(spec);
    box.append(previewText);

    copyBtn.disabled = spec.key === 'xp';
    copyBtn.title = spec.key === 'xp' ? 'Binary format - save as file' : '';
    doCopy = () => copyLevelFormat(spec);
    doSave = () => saveLevelFormat(spec);
    return box;
  }

  function projectPanel(): HTMLElement {
    const box = el('div');
    const ready = !!(projectCtx.store && projectCtx.projectId);
    const desc = ready
      ? `Whole project '${projectName ?? '...'}' with all its levels as project.json`
      : 'No project open - export Whole project from an active project.';
    box.append(el('p', 'hint', desc));
    copyBtn.disabled = !ready;
    copyBtn.title = ready ? '' : 'Open a project to export it as a whole';
    saveBtn.disabled = !ready;
    saveBtn.title = copyBtn.title;
    doCopy = copyProject;
    doSave = saveProject;
    return box;
  }

  const body = el('div');

  function render(): void {
    copyBtn.disabled = false;
    copyBtn.title = '';
    saveBtn.disabled = false;
    saveBtn.title = '';
    const panel = scope === 'level' ? levelPanel() : projectPanel();
    body.replaceChildren(scopePill(), panel, actionsRow);
  }

  return {
    open(openCtx: ExportProjectContext = {}): void {
      projectCtx = openCtx;
      projectName = null;
      scope = 'level';
      // nazwa projektu przychodzi asynchronicznie (magazyn) - token odrzuca odpowiedz
      // spozniona wzgledem kolejnego otwarcia/zmiany kontekstu
      const token = ++fetchToken;
      if (openCtx.store && openCtx.projectId) {
        const { store, projectId } = openCtx;
        store.listProjects().then((projects) => {
          if (token !== fetchToken) return;
          projectName = projects.find((p) => p.id === projectId)?.name ?? null;
          if (scope === 'project') render();
        }).catch(() => {
          // brak nazwy nie blokuje eksportu - opis wtedy pokazuje placeholder
        });
      }
      render();
      openModal('Export', body);
    },
  };
}
