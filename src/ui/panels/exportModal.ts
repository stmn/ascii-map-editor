// Modal Export: dwa zakresy w jednym dialogu.
// "This level" - kafelki formatow w siatce 3 kolumn (radio, jak dawniej wiersze - tylko wyglad
// sie zmienil), kazdy z statycznym "screenshotem kodu" u gory, z opcjami warstw kontekstowymi
// dla formatu i zywym podgladem. "Whole project" - caly projekt jako project.json (dziala
// tylko gdy wolajacy przekazal store+projectId przy otwarciu - patrz open()).
// Akcje sa zawsze te same dwa przyciski w tym samym miejscu (Copy/Save file), retargetowane
// na aktualnie wybrany format/zakres - nie ma osobnej pary przyciskow na kazdy kafelek.
//
// Fokus klawiatury (fix round 1, finding 1): kontrolki, ktore MOGA miec fokus (przyciski pigulek,
// radia formatow, textarea podgladu, Copy/Save) sa budowane RAZ i zyja przez caly czas zycia
// modalu - zmiana wyboru przelacza tylko klasy/checked/aria na istniejacych wezlach (jak
// setActiveLayer w layers.ts), nigdy ich nie zastepuje. Przebudowie (replaceChildren) podlega
// WYLACZNIE sekcja opcji formatu (optionsSlot) i to tylko przy zmianie samego formatu - wtedy
// fokus i tak stoi na klikanym radiu, ktorego przebudowa nie dotyka.
//
// Kafelki (v2.10.3): "screenshot kodu" to statyczny blok DOM zbudowany raz przy tworzeniu
// kafelka (buildShot), nie zywy podglad - dane (linie/tokeny/kolory) siedza per format w tabeli
// FORMATS (pole shot), sam buildShot jest jeden dla wszystkich 9 formatow. Opis tekstowy formatu
// (kiedys obok kazdego wiersza) teraz zyje w JEDNYM miejscu pod siatka - formatDescEl.
import { Bounds, Grid } from '../../core/grid';
import { activeGrid } from '../../core/editorState';
import { flattenLayers, unionBounds } from '../../core/level';
import { serializeProject } from '../../core/project';
import { exportCsv, exportTxt } from '../../export/text';
import { exportKaplay } from '../../export/kaplay';
import { exportGodot } from '../../export/godot';
import { exportTmx } from '../../export/tiled';
import { exportXp } from '../../export/rexpaint';
import { exportLegacy } from '../../export/legacy';
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
type FormatKey = 'txt' | 'array-strings' | 'array-arrays' | 'csv' | 'kaplay' | 'godot' | 'tmx' | 'xp' | 'json';

/**
 * Jeden token "screenshotu kodu": string = niepokolorowany tekst (bialy szum np. wciecie),
 * [klasa, tekst] = kolorowany span - klasy (p/s/k/n/w/f/d1) i palety patrz .shot w styles.css,
 * ustalone razem z zatwierdzonym mockupem (wariant A).
 */
type ShotClass = 'p' | 's' | 'k' | 'n' | 'w' | 'f' | 'd1';
type ShotToken = string | [ShotClass, string];
type ShotLine = ShotToken[];

interface FormatSpec {
  key: FormatKey;
  label: string;
  desc: string;
  badge: 'flattened' | 'kept';
  filename: string;
  mime: string;
  /** null = format nie ma opcji Layers (bierze zawsze cale warstwy - Godot/tmx/xp/json). */
  layerChoices: LayersMode[] | null;
  /** Statyczna, przykladowa tresc na kafelku (NIE dane usera) - linie tokenow do buildShot(). */
  shot: ShotLine[];
}

const LAYERS_ALL: LayersMode[] = ['merged', 'active', 'each'];
const LAYERS_NO_EACH: LayersMode[] = ['merged', 'active'];

const LAYERS_LABELS: Record<LayersMode, string> = {
  merged: 'All merged', active: 'Active layer', each: 'Each layer separately',
};

// Kolejnosc = kolejnosc kafelkow w siatce dialogu. Opisy i nazwy formatow sa verbatim ze
// specyfikacji Taska 3 - nie parafrazowac, testy odbiorcze porownuja dokladnie ten tekst.
// Tresc pola shot jest verbatim z zatwierdzonego mockupu (wariant A) - nie parafrazowac.
const FORMATS: FormatSpec[] = [
  {
    key: 'txt', label: 'TXT', desc: 'Plain text grid, one char per cell', badge: 'flattened',
    filename: 'map.txt', mime: 'text/plain', layerChoices: LAYERS_ALL,
    shot: [
      [['w', '##########']],
      [['w', '#'], ['f', '........'], ['w', '#']],
      [['w', '#'], ['f', '..'], ['w', '##'], ['f', '....'], ['w', '#']],
      [['w', '#'], ['f', '........'], ['w', '#']],
      [['w', '##########']],
    ],
  },
  {
    key: 'array-strings', label: 'Array of strings', desc: 'JS array, one quoted string per row', badge: 'flattened',
    filename: 'array-strings.txt', mime: 'text/plain', layerChoices: LAYERS_NO_EACH,
    shot: [
      [['p', '[']],
      ['  ', ['s', '"##########"'], ['p', ',']],
      ['  ', ['s', '"#........#"'], ['p', ',']],
      ['  ', ['s', '"#..##....#"'], ['p', ',']],
      [['p', ']']],
    ],
  },
  {
    key: 'array-arrays', label: 'Array of arrays', desc: 'JS array of arrays, one char per cell', badge: 'flattened',
    filename: 'array-arrays.txt', mime: 'text/plain', layerChoices: LAYERS_NO_EACH,
    shot: [
      [['p', '[']],
      ['  ', ['p', '['], ['s', '"#"'], ['p', ','], ['s', '"#"'], ['p', ','], ['s', '"#"'], ['p', '],']],
      ['  ', ['p', '['], ['s', '"#"'], ['p', ','], ['s', '"."'], ['p', ','], ['s', '"#"'], ['p', '],']],
      [['p', ']']],
    ],
  },
  {
    key: 'csv', label: 'CSV', desc: 'Comma separated grid', badge: 'flattened',
    filename: 'map.csv', mime: 'text/csv', layerChoices: LAYERS_ALL,
    shot: [
      [['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#']],
      [['w', '#'], ['p', ','], ['f', '.'], ['p', ','], ['f', '.'], ['p', ','], ['f', '.'], ['p', ','], ['w', '#']],
      [['w', '#'], ['p', ','], ['f', '.'], ['p', ','], ['w', '#'], ['p', ','], ['f', '.'], ['p', ','], ['w', '#']],
      [['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#'], ['p', ','], ['w', '#']],
    ],
  },
  {
    key: 'kaplay', label: 'KaPlay', desc: 'addLevel snippet for kaplayjs.com', badge: 'flattened',
    filename: 'kaplay.js', mime: 'text/javascript', layerChoices: LAYERS_NO_EACH,
    shot: [
      [['k', 'const'], ' tiles ', ['p', '= {']],
      ['  ', ['s', '"#"'], ['p', ': () => ['], ['k', 'sprite'], ['p', '('], ['s', '"wall"'], ['p', ')],']],
      [['p', '};']],
      [['k', 'addLevel'], ['p', '(['], ['s', '"####"'], ['p', '], {']],
    ],
  },
  {
    key: 'godot', label: 'Godot', desc: 'GDScript dictionaries, one per layer', badge: 'kept',
    filename: 'godot.gd', mime: 'text/plain', layerChoices: null,
    shot: [
      [['k', 'var'], ' level ', ['p', '= {']],
      ['  ', ['s', '"layer_0"'], ['p', ': {']],
      ['    ', ['s', '"#"'], ['p', ': ['], ['n', 'Vector2'], ['p', '('], ['n', '0'], ['p', ','], ['n', '0'], ['p', ')],']],
      [['p', '}}']],
    ],
  },
  {
    key: 'tmx', label: 'Tiled .tmx', desc: 'One tile layer per editor layer', badge: 'kept',
    filename: 'map.tmx', mime: 'application/xml', layerChoices: null,
    shot: [
      [['p', '<'], ['k', 'map'], ' ', ['n', 'width'], ['p', '='], ['s', '"10"'], ['p', '>']],
      [' ', ['p', '<'], ['k', 'layer'], ' ', ['n', 'name'], ['p', '='], ['s', '"walls"'], ['p', '>']],
      ['  ', ['p', '<'], ['k', 'data'], ['p', '>'], ['n', '1,1,1,0'], ['p', '</'], ['k', 'data'], ['p', '>']],
      [' ', ['p', '</'], ['k', 'layer'], ['p', '>']],
    ],
  },
  {
    key: 'xp', label: 'REXPaint .xp', desc: 'Native multi-layer format', badge: 'kept',
    filename: 'map.xp', mime: 'application/octet-stream', layerChoices: null,
    shot: [
      [['d1', 'REXPaint']],
      [['p', 'layers:'], ' ', ['n', '3']],
      [['p', '['], ['w', 'binary .xp'], ['p', ']']],
      [['f', 'gzip']],
    ],
  },
  {
    key: 'json', label: 'Level .json', desc: 'Full level for re-import: layers and legend', badge: 'kept',
    filename: 'level.json', mime: 'application/json', layerChoices: null,
    shot: [
      [['p', '{']],
      ['  ', ['s', '"app"'], ['p', ':'], ' ', ['s', '"ascii-le..."'], ['p', ',']],
      ['  ', ['s', '"layers"'], ['p', ': ['], ['n', '2'], ['p', '],']],
      ['  ', ['s', '"legend"'], ['p', ': {...}']],
      [['p', '}']],
    ],
  },
];

export function initExportModal(ctx: PanelsCtx): ExportPanel {
  const { state } = ctx;

  // --- stan dialogu: przezywa miedzy otwarciami jak dawny scopeSelect/legacySelect,
  // poza samym scope - ten wraca do "This level" przy kazdym otwarciu (patrz open()). ---
  let scope: Scope = 'level';
  let format: FormatKey = 'txt';
  let layersMode: LayersMode = 'merged';
  let projectCtx: ExportProjectContext = {};
  let projectName: string | null = null;
  let fetchToken = 0;

  function currentSpec(): FormatSpec {
    return FORMATS.find((f) => f.key === format)!;
  }

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
    // ukryte warstwy pomijamy - tak samo jak flattenLayers/"All merged" (core/level.ts)
    return state.level.layers.filter((l) => l.visible).map((l) => header(l.name) + exportOne(l.grid, bounds));
  }

  /** TXT each-layer: bloki rozdzielone linia markera - nie trzeba dodatkowego odstepu. */
  function txtEachLayers(): string {
    return eachLayerBlocks((name) => `:: ${name}\n`, exportTxt).join('');
  }

  /** CSV each-layer: pusta linia + komentarz przed kolejnym blokiem (prosty, "grep-owalny" format). */
  function csvEachLayers(): string {
    return eachLayerBlocks((name) => `# ${name}\n`, exportCsv).join('\n');
  }

  /**
   * .xp jest binarny (gzip) - nie ma tu ani siatki znakow (mylila sie z TXT), ani w ogole
   * textarea podgladu (user: "po co pokazujesz textarea, jak w REXPaint jest plik binarny") -
   * to jedno zdanie hinta w xpHintEl (patrz refreshLevelActions), a nie tresc do Copy/Save.
   * Liczby licza sie z realnego stanu poziomu: liczba warstw + wspolny rozmiar (union bounds,
   * jak w buildXpBytes - stad fallback 1x1 dla pustej mapy).
   */
  function xpSummary(): string {
    const layers = state.level.layers;
    const bounds = levelBounds();
    const w = bounds ? bounds.maxX - bounds.minX + 1 : 1;
    const h = bounds ? bounds.maxY - bounds.minY + 1 : 1;
    return `Binary format (gzip) - ${layers.length} layer(s), ${w}x${h}. Save the file and open it in REXPaint.`;
  }

  /**
   * Tresc formatu do podgladu i (poza .xp) do Copy/Save file. .xp ma tu tylko informacyjny
   * hint (Copy jest dla niego wylaczony) - prawdziwy zapis idzie osobna asynchroniczna sciezka (gzip).
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
      case 'array-strings':
        return exportLegacy(modeGrid(merged), 'array-text', bounds);
      case 'array-arrays':
        return exportLegacy(modeGrid(merged), 'array-array', bounds);
      case 'xp':
        return xpSummary();
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
  // (budowane raz - patrz komentarz o fokusie na gorze pliku)

  let doCopy: () => unknown = () => {};
  let doSave: () => unknown = () => {};
  const copyBtn = button('Copy', '', guarded(() => doCopy()));
  const saveBtn = button('Save file', '', guarded(() => doSave()));
  const actionsRow = el('div', 'btn-row');
  actionsRow.append(copyBtn, saveBtn);

  /** Podglad, wspolny dla kazdego formatu This level - budowany raz, przenoszony miedzy renderami. */
  const previewText = el('textarea', 'modal-text');
  previewText.readOnly = true;
  previewText.setAttribute('aria-label', 'Export preview');

  /** .xp: zamiast textarea (binarny plik, tekstowy podglad by mylil) - jedno zdanie hinta w tym
   *  samym miejscu. Oba elementy zyja przez caly czas modalu (patch-in-place, bez gubienia
   *  fokusu) - refreshLevelActions przelacza tylko klase .hidden na kazdym z nich. */
  const xpHintEl = el('p', 'hint help-box hint-small');

  // --- pigulka Layers: bufor aktualnie zbudowanych przyciskow (przebudowana tylko przy
  // zmianie formatu w rebuildOptions - patrz setFormat) - setLayersMode juz ich nie odtwarza. ---
  let layersBtns: { mode: LayersMode; btn: HTMLButtonElement }[] = [];

  function buildLayersPill(choices: LayersMode[]): HTMLElement {
    const pill = el('div', 'scope-switch');
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Layers');
    layersBtns = choices.map((mode) => {
      const btn = button(LAYERS_LABELS[mode], mode === layersMode ? 'scope-seg active' : 'scope-seg', () => setLayersMode(mode));
      btn.setAttribute('aria-pressed', String(mode === layersMode));
      pill.append(btn);
      return { mode, btn };
    });
    return pill;
  }

  function syncLayersPill(): void {
    for (const { mode, btn } of layersBtns) {
      const active = mode === layersMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  /** Sekcja opcji formatu (na razie tylko Layers) - JEDYNA czesc This level, ktora przebudowujemy
   *  w calosci, bo jej sklad realnie zalezy od formatu. Fokus w tym momencie stoi na klikanym
   *  radiu wyzej, wiec przebudowa niczego mu nie zabiera. */
  function rebuildOptions(spec: FormatSpec): void {
    optionsSlot.replaceChildren();
    layersBtns = [];
    if (spec.layerChoices) optionsSlot.append(labeled('Layers', buildLayersPill(spec.layerChoices)));
  }

  /** Opis wybranego formatu - jedyne miejsce, kafelki go juz nie pokazuja (patrz mockup wariant A). */
  function syncFormatDesc(spec: FormatSpec): void {
    formatDescEl.textContent = spec.desc;
  }

  /** Podglad + Copy/Save dla This level - wolane po kazdej zmianie (format/warstwy). */
  function refreshLevelActions(spec: FormatSpec): void {
    const isXp = spec.key === 'xp';
    // .xp: textarea zastapiona jednym zdaniem hinta (binarny plik - tekstowy "podglad" mylil,
    // patrz xpSummary); reszta formatow ma textarea jak dotad. Oba wezly zyja caly czas,
    // przelacza sie tylko .hidden - patch-in-place, fokus na nich nigdy nie ginie.
    previewText.classList.toggle('hidden', isXp);
    xpHintEl.classList.toggle('hidden', !isXp);
    if (isXp) xpHintEl.textContent = xpSummary();
    else previewText.value = safePreview(spec);
    copyBtn.disabled = isXp;
    copyBtn.title = isXp ? 'Binary format - save as file' : '';
    saveBtn.disabled = false;
    saveBtn.title = '';
    doCopy = () => copyLevelFormat(spec);
    doSave = () => saveLevelFormat(spec);
  }

  /** Opis + Copy/Save dla Whole project - wolane po zmianie zakresu i po przyjsciu nazwy projektu. */
  function refreshProjectActions(): void {
    const ready = !!(projectCtx.store && projectCtx.projectId);
    projectDescEl.textContent = ready
      ? `Whole project '${projectName ?? '...'}' with all its levels as project.json`
      : 'No project open - export Whole project from an active project.';
    copyBtn.disabled = !ready;
    copyBtn.title = ready ? '' : 'Open a project to export it as a whole';
    saveBtn.disabled = !ready;
    saveBtn.title = copyBtn.title;
    doCopy = copyProject;
    doSave = saveProject;
  }

  // --- setterzy: kazdy dotyka TYLKO tego, co naprawde musi sie zmienic w DOM -----

  function setScope(next: Scope): void {
    if (scope === next) return;
    scope = next;
    syncScopePill();
    panelSlot.replaceChildren(scope === 'level' ? levelPanelEl : projectPanelEl);
    if (scope === 'level') refreshLevelActions(currentSpec());
    else refreshProjectActions();
  }

  function setFormat(key: FormatKey): void {
    if (format === key) return;
    format = key;
    const spec = currentSpec();
    // klamruje layersMode do tego, co dany format wspiera (np. "each" zostawione po TXT nie
    // moze zostac wybrane niewidocznie pod KaPlay/Array of strings/Array of arrays, ktore go nie oferuja)
    if (spec.layerChoices && !spec.layerChoices.includes(layersMode)) layersMode = 'merged';
    syncFormatRows();
    syncFormatDesc(spec);
    rebuildOptions(spec);
    refreshLevelActions(spec);
  }

  function setLayersMode(mode: LayersMode): void {
    if (layersMode === mode) return;
    layersMode = mode;
    syncLayersPill();
    refreshLevelActions(currentSpec());
  }

  // --- budowa DOM (raz) -------------------------------------------------------------

  const scopePillEl = el('div', 'scope-switch');
  scopePillEl.setAttribute('role', 'group');
  scopePillEl.setAttribute('aria-label', 'Export scope');
  const levelScopeBtn = button('This level', 'scope-seg', () => setScope('level'));
  const projectScopeBtn = button('Whole project', 'scope-seg', () => setScope('project'));
  scopePillEl.append(levelScopeBtn, projectScopeBtn);

  function syncScopePill(): void {
    const projectReady = !!(projectCtx.store && projectCtx.projectId);
    levelScopeBtn.classList.toggle('active', scope === 'level');
    levelScopeBtn.setAttribute('aria-pressed', String(scope === 'level'));
    projectScopeBtn.classList.toggle('active', scope === 'project');
    projectScopeBtn.setAttribute('aria-pressed', String(scope === 'project'));
    projectScopeBtn.disabled = !projectReady;
    projectScopeBtn.title = projectReady ? '' : 'Open a project to enable whole-project export';
  }

  /**
   * Buduje statyczny "screenshot kodu" jednego kafelka z tokenow FormatSpec.shot - jedyny
   * budowniczy dla wszystkich 9 formatow, tresc/kolory sa danymi (patrz tabela FORMATS),
   * nie kodem. String w linii = niepokolorowany tekst (np. wciecie), [klasa, tekst] = span.
   */
  function buildShot(lines: ShotLine[]): HTMLElement {
    const shot = el('div', 'shot');
    lines.forEach((line, i) => {
      if (i > 0) shot.append('\n');
      for (const tok of line) shot.append(typeof tok === 'string' ? tok : el('span', tok[0], tok[1]));
    });
    return shot;
  }

  /** Kafelki formatow - budowane raz (siatka 3 kolumny, mockup wariant A); wybor przelacza
   *  tylko .active/checked na istniejacych wezlach (patrz syncFormatRows) - fokus nie ginie. */
  const formatTilesEl = el('div', 'format-tiles');
  formatTilesEl.setAttribute('role', 'radiogroup');
  formatTilesEl.setAttribute('aria-label', 'Export format');
  const formatRowEls = new Map<FormatKey, { row: HTMLElement; radio: HTMLInputElement }>();

  function buildFormatTile(f: FormatSpec): void {
    const row = el('label', format === f.key ? 'format-tile active' : 'format-tile');
    const radio = el('input', 'format-tile-radio');
    radio.type = 'radio';
    radio.name = 'export-format';
    radio.value = f.key;
    radio.checked = format === f.key;
    radio.setAttribute('aria-label', f.label);
    radio.addEventListener('change', () => setFormat(f.key));
    const badge = el('div', f.badge === 'kept' ? 'tile-badge kept' : 'tile-badge', `layers: ${f.badge}`);
    row.append(radio, buildShot(f.shot), el('div', 'tile-name', f.label), badge);
    formatRowEls.set(f.key, { row, radio });
    formatTilesEl.append(row);
  }

  function syncFormatRows(): void {
    for (const [key, { row, radio }] of formatRowEls) {
      const active = key === format;
      row.classList.toggle('active', active);
      radio.checked = active;
    }
  }

  for (const f of FORMATS) buildFormatTile(f);

  const optionsSlot = el('div');
  /** Opis wybranego formatu - jedno stale miejsce pod siatka kafelkow, nad opcjami Layers. */
  const formatDescEl = el('p', 'hint help-box hint-small');

  const levelPanelEl = el('div', 'field-col');
  levelPanelEl.append(formatTilesEl, formatDescEl, optionsSlot, previewText, xpHintEl);

  const projectDescEl = el('p', 'hint help-box hint-small');
  const projectPanelEl = el('div');
  projectPanelEl.append(projectDescEl);

  const panelSlot = el('div');
  panelSlot.append(levelPanelEl);

  // body/scopePillEl/panelSlot/actionsRow sa doklejane RAZ - kolejne otwarcia i zmiany wyboru
  // juz nigdy nie woluja body.replaceChildren, wiec Copy/Save i pigulka zakresu nigdy nie traca tozsamosci
  const body = el('div');
  body.append(scopePillEl, panelSlot, actionsRow);

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
          if (scope === 'project') refreshProjectActions();
        }).catch(() => {
          // brak nazwy nie blokuje eksportu - opis wtedy pokazuje placeholder
        });
      }
      syncScopePill();
      panelSlot.replaceChildren(levelPanelEl);
      const spec = currentSpec();
      syncFormatRows();
      syncFormatDesc(spec);
      rebuildOptions(spec);
      refreshLevelActions(spec);
      openModal('Export', body, undefined, 'modal-card-wide');
    },
  };
}
