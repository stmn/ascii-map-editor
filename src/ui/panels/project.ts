// Panel Project: wybor projektu, lista jego poziomow (miniatura, nazwa, duplikat, usuniecie)
// i rzad dwoch zwyklych przyciskow Export/Import, ktore otwieraja dialogi (panels/exportModal.ts,
// panels/importModal.ts) z kontekstem biezacego magazynu/projektu - dialogi same wiedza, jak bez
// niego pokazac sekcje/akcje na calym projekcie jako disabled.
// To jedyne miejsce UI, ktore tworzy i kasuje rekordy magazynu - reszta paneli zna tylko biezacy poziom.
import { createLevel, type Level } from '../../core/level';
import { parseProject, serializeProject } from '../../core/project';
import {
  nextName,
  type LevelRecord, type ProjectMeta, type WorkspaceStore,
} from '../../core/store';
import { button, el, iconButton, setIconTitle } from '../dom';
import { icon } from '../icons';
import { confirmModal, promptModal } from '../modal';
import {
  PanelsCtx, applyLevelToPanels, errorMessage, flushSave, getCurrentLevel,
  getStore, playPop, reportSaveError, scheduleSave, setCurrentLevel,
  setOnSaved, toast, updateCurrentLevel,
} from './context';

/**
 * Modale Export/Import - buduje je panels.ts, tu tylko dwa przyciski otwierajace z kontekstem.
 * Ksztalt kontekstu odpowiada ExportProjectContext/ImportProjectContext (exportModal.ts/
 * importModal.ts) - project.ts celowo ich nie importuje (odwrotna zaleznosc juz nie zachodzi -
 * importModal.ts importuje stad makeLevelRecord), zeby modul karty nie musial znac wnetrza modali.
 */
export interface LevelIoModals {
  openExport(ctx?: { store?: WorkspaceStore; projectId?: string }): void;
  openImport(ctx?: { store?: WorkspaceStore; projectId?: string; onChanged?: () => void }): void;
}

export interface ProjectPanel {
  render(): void;
}

/**
 * Odpalenie operacji magazynu z uchwytu zdarzenia. Kazde takie wywolanie musi tedy przejsc:
 * samo `void` zamienialoby odrzucenie (padniete IndexedDB, brak miejsca) w cicha awarie -
 * przycisk nie robi nic i nawet nie mowi dlaczego. Jedno miejsce zamiast .catch przy kazdym klikaniu.
 */
function runOp(op: Promise<unknown>): void {
  op.catch(reportSaveError);
}

/**
 * Ksztalt rekordu poziomu gotowego do zapisu - JEDYNE miejsce, ktore go buduje. Domyslnie pusty
 * Level (createLevel) dla "New level", nowego projektu i pustego projektu; importModal.ts
 * przekazuje tu WGRANY poziom (Add as new level), zeby nie duplikowac tego samego literalu.
 */
export function makeLevelRecord(
  projectId: string, name: string, order: number, level: Level = createLevel(),
): LevelRecord {
  return {
    id: crypto.randomUUID(),
    projectId,
    name,
    order,
    data: serializeProject(level),
    thumb: null,
    updatedAt: Date.now(),
  };
}

export function initProject(ctx: PanelsCtx, box: HTMLElement, modals: LevelIoModals): ProjectPanel {
  /**
   * Wiersze listy po id poziomu - pozwalaja odswiezyc wiersz BEZ przebudowy DOM.
   * `record` to migawka z czasu renderu, ktora obsluga wiersza (nazwa, duplikat) trzyma w domknieciu;
   * musi nadazac za rzeczywistoscia, bo zapis nazwy poziomu NIE-biezacego idzie wlasnie z niej.
   */
  const rows = new Map<string, {
    row: HTMLElement;
    thumb: HTMLElement;
    record: LevelRecord;
    dup: HTMLButtonElement;
    del: HTMLButtonElement;
  }>();
  /** Numer ostatniego zamowionego renderu - starszy (wolniejszy odczyt) nie moze nadpisac nowszego. */
  let renderSeq = 0;

  // --- odswiezanie w miejscu ---------------------------------------------------

  function setRowThumb(id: string, src: string | null): void {
    const entry = rows.get(id);
    if (!entry) return;
    entry.thumb.replaceChildren();
    if (!src) return; // pusty poziom - zostaje szare tlo ramki
    const img = el('img', 'level-thumb-img');
    img.src = src;
    img.alt = '';
    entry.thumb.append(img);
  }

  function setActiveRow(id: string): void {
    for (const [rowId, entry] of rows) entry.row.classList.toggle('active', rowId === id);
  }

  /**
   * Dociagniecie wiersza do aktualnego rekordu BEZ przebudowy karty: migawka w mapie, miniatura
   * i opisy przyciskow. Krytyczne dla migawki - zapis nazwy poziomu NIE-biezacego wysyla caly
   * rekord z domkniecia, wiec bez tego pierwsze wcisniecie klawisza w polu nazwy poziomu, ktory
   * byl w miedzyczasie malowany, cofnelo by jego tresc do stanu z ostatniego renderu.
   */
  function syncRow(record: LevelRecord): void {
    const entry = rows.get(record.id);
    if (!entry) return;
    if (entry.record !== record) Object.assign(entry.record, record);
    setRowThumb(record.id, record.thumb);
    // tytuly niosa nazwe, wiec starzeja sie tak samo jak migawka
    setIconTitle(entry.dup, `Duplicate level "${entry.record.name}"`);
    setIconTitle(entry.del, `Delete level "${entry.record.name}"`);
  }

  /**
   * Po kazdym autozapisie dociagamy wiersz biezacego poziomu (miniatura + migawka).
   * Celowo bez przebudowy karty: zapis leci tez w trakcie pisania w polu nazwy,
   * a podmiana DOM zabralaby wtedy fokus.
   */
  setOnSaved(() => {
    const current = getCurrentLevel();
    if (current) syncRow(current);
  });

  // --- operacje na poziomach ---------------------------------------------------

  /**
   * Swieza kopia rekordu z magazynu. Najpierw domykamy zawieszony autozapis, bo tresc
   * biezacego poziomu moze wisiec w debounce - inaczej duplikat albo powrot do poziomu
   * przyniosly stan sprzed ostatnich pociagniec pedzla.
   */
  async function freshRecord(store: WorkspaceStore, record: LevelRecord): Promise<LevelRecord> {
    flushSave();
    return (await store.getLevel(record.id)) ?? record;
  }

  /**
   * Przelaczenie biezacego poziomu. KOLEJNOSC jest tu cala trescia: najpierw parsujemy dane,
   * dopiero potem ruszamy wskaznik i stan. Blad parsowania konczy sie czerwonym toastem i
   * powrotem false - wskaznik current, state.level i widok zostaja dokladnie takie jak byly.
   * setCurrentLevel domyka autozapis POPRZEDNIEGO poziomu, gdy state.level to jeszcze jego tresc.
   */
  async function switchTo(store: WorkspaceStore, record: LevelRecord): Promise<boolean> {
    const previous = getCurrentLevel();
    if (previous && previous.id === record.id) return true;
    const fresh = await freshRecord(store, record);
    let level;
    try {
      level = parseProject(fresh.data);
    } catch (e) {
      toast(errorMessage(e), 'error');
      return false;
    }
    setCurrentLevel(fresh);
    applyLevelToPanels(ctx, level);
    // Przelaczenie nie przebudowuje karty, wiec migawki obu wierszy dociagamy tu recznie:
    // opuszczany dostaje tresc i miniature domknieta przez flushSave, wchodzacy - kopie z magazynu.
    if (previous) syncRow(previous);
    syncRow(fresh);
    setActiveRow(fresh.id);
    playPop();
    return true;
  }

  /**
   * Zmiana nazwy poziomu. Biezacy rekord jest ZYWY (czyta go autozapis), wiec zmiana musi isc
   * przez updateCurrentLevel + scheduleSave - bez tego najblizszy zapis nadpisalby nowa nazwe
   * stara wartoscia, a bez scheduleSave zmiana przezylaby tylko do przeladowania strony.
   * Poziom spoza biezacego zapisujemy wprost.
   */
  function renameLevel(store: WorkspaceStore, record: LevelRecord, name: string): void {
    record.name = name; // rekord z listy zostaje aktualny dla duplikatu i przelaczenia
    const current = getCurrentLevel();
    if (current && current.id === record.id) {
      updateCurrentLevel({ name });
      scheduleSave();
      return;
    }
    store.putLevel({ ...record, updatedAt: Date.now() }).catch(reportSaveError);
  }

  /**
   * Przepisanie kolejnosci poziomow projektu na 1..N. Duplikat wchodzi z order .5 (tuz za
   * oryginalem), a tu wraca do liczb calkowitych - dzieki temu nie potrzeba osobnego UI kolejnosci.
   */
  async function normalizeOrders(store: WorkspaceStore, projectId: string): Promise<void> {
    const list = await store.listLevels(projectId);
    const current = getCurrentLevel();
    const now = Date.now();
    for (let i = 0; i < list.length; i++) {
      const record = list[i]!;
      const order = i + 1;
      if (record.order === order) continue;
      if (current && current.id === record.id) {
        updateCurrentLevel({ order }); // ten sam kontrakt co przy nazwie - zywy rekord i zapis
        scheduleSave();
      } else {
        await store.putLevel({ ...record, order, updatedAt: now });
      }
    }
  }

  async function newLevel(store: WorkspaceStore, projectId: string, levels: LevelRecord[]): Promise<void> {
    const order = levels.reduce((max, l) => Math.max(max, l.order), 0) + 1;
    const record = makeLevelRecord(projectId, nextName('Level', levels.map((l) => l.name)), order);
    await store.putLevel(record);
    await switchTo(store, record);
    await render();
  }

  async function duplicateLevel(
    store: WorkspaceStore, source: LevelRecord, levels: LevelRecord[],
  ): Promise<void> {
    const fresh = await freshRecord(store, source);
    const copy: LevelRecord = {
      id: crypto.randomUUID(),
      projectId: fresh.projectId,
      name: nextName(source.name, levels.map((l) => l.name)),
      order: fresh.order + 0.5, // tuz za oryginalem; normalizacja nizej robi z tego liczby calkowite
      data: fresh.data,
      thumb: fresh.thumb,
      updatedAt: Date.now(),
    };
    await store.putLevel(copy);
    await normalizeOrders(store, copy.projectId);
    await switchTo(store, copy);
    await render();
  }

  async function deleteLevel(
    store: WorkspaceStore, target: LevelRecord, levels: LevelRecord[],
  ): Promise<void> {
    if (levels.length <= 1) return; // ostatniego poziomu projektu nie usuwamy
    if (!await confirmModal(`Delete level "${target.name}"?`, 'Delete')) return;
    const current = getCurrentLevel();
    if (current && current.id === target.id) {
      // NAJPIERW schodzimy na sasiada: przelaczenie domyka autozapis, a flush po skasowaniu
      // rekordu wskrzesilby go w magazynie. Gdy sasiad sie nie wczytal - nie kasujemy niczego.
      const index = levels.findIndex((l) => l.id === target.id);
      const next = levels[index + 1] ?? levels[index - 1];
      if (!next || !await switchTo(store, next)) return;
    }
    await store.deleteLevel(target.id);
    playPop();
    await render();
  }

  // --- operacje na projektach --------------------------------------------------

  /** Wejscie w projekt: otwieramy jego pierwszy poziom (po order); pusty projekt dostaje "Level 1". */
  async function openProject(store: WorkspaceStore, projectId: string): Promise<boolean> {
    const levels = await store.listLevels(projectId);
    let first = levels[0];
    if (!first) {
      // projekt bez poziomow moze przyjsc z obcej kopii workspace - nie zostawiamy pustej listy
      first = makeLevelRecord(projectId, 'Level 1', 1);
      await store.putLevel(first);
    }
    const ok = await switchTo(store, first);
    // render takze po nieudanym przelaczeniu - select wraca wtedy do faktycznie otwartego projektu
    await render();
    return ok;
  }

  async function newProject(store: WorkspaceStore, projects: ProjectMeta[]): Promise<void> {
    const name = await promptModal('New project', nextName('Project', projects.map((p) => p.name)));
    if (name === null) return;
    const now = Date.now();
    const meta: ProjectMeta = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    await store.putProject(meta);
    const level = makeLevelRecord(meta.id, 'Level 1', 1);
    await store.putLevel(level);
    await switchTo(store, level);
    await render();
  }

  async function renameProject(store: WorkspaceStore, meta: ProjectMeta): Promise<void> {
    const name = await promptModal('Rename project', meta.name);
    if (name === null || name === meta.name) return;
    await store.putProject({ ...meta, name, updatedAt: Date.now() });
    await render();
  }

  async function deleteProject(
    store: WorkspaceStore, target: ProjectMeta, projects: ProjectMeta[],
  ): Promise<void> {
    if (projects.length <= 1) return; // ostatniego projektu nie usuwamy
    if (!await confirmModal(`Delete project "${target.name}" and all its levels?`, 'Delete')) return;
    const current = getCurrentLevel();
    if (current && current.projectId === target.id) {
      // ta sama zasada co przy poziomie: najpierw wychodzimy, potem kasujemy - inaczej
      // flush autozapisu wskrzesilby poziom skasowanego projektu
      const index = projects.findIndex((p) => p.id === target.id);
      const next = projects[index + 1] ?? projects[index - 1];
      if (!next || !await openProject(store, next.id)) return;
    }
    await store.deleteProject(target.id);
    playPop();
    await render();
  }

  // --- rzad Export/Import -------------------------------------------------------

  /**
   * Rzad Export/Import: dwa zwykle przyciski 50/50 (Export niebieski/domyslny, Import zielony),
   * kazdy otwiera odpowiedni dialog (exportModal.ts/importModal.ts) z aktualnym kontekstem
   * magazynu i projektu - dialogi same wiedza, jak bez projektu pokazac Whole project/Add as
   * new level/Add project(s) jako disabled (T3/T4). onChanged na Import odswieza karte po
   * mutacji magazynu (Add as new level, Add project(s)) - dialog sam nie zna listy
   * projektow/poziomow wolajacego.
   */
  function ioRow(store: WorkspaceStore | null, projectId: string | null): HTMLElement {
    const ctx = { store: store ?? undefined, projectId: projectId ?? undefined };
    const row = el('div', 'btn-row');
    row.append(
      button('Export...', '', () => modals.openExport(ctx)),
      button('Import...', 'success', () => {
        modals.openImport({ ...ctx, onChanged: () => { runOp(render()); } });
      }),
    );
    return row;
  }

  // --- budowa karty ------------------------------------------------------------

  function levelRow(
    store: WorkspaceStore, record: LevelRecord, index: number, levels: LevelRecord[],
  ): HTMLElement {
    const current = getCurrentLevel();
    const active = current?.id === record.id;
    const row = el('div', active ? 'level-row active' : 'level-row');

    const thumb = el('div', 'level-thumb');

    const name = el('input', 'level-name');
    name.type = 'text';
    name.value = record.name;
    name.setAttribute('aria-label', `Name of level ${index + 1}`);
    name.addEventListener('input', () => renameLevel(store, record, name.value));
    // pointerdown leci przed fokusem - klik w nazwe przelacza poziom i zostawia kursor w polu
    name.addEventListener('pointerdown', () => { runOp(switchTo(store, record)); });
    // pusta nazwa nic nie mowi na liscie - wracamy do pierwszej wolnej "Level N"
    name.addEventListener('blur', () => {
      if (name.value.trim()) return;
      name.value = nextName('Level', levels.filter((l) => l.id !== record.id).map((l) => l.name));
      renameLevel(store, record, name.value);
    });

    const dup = iconButton(icon('copy'), 'level-btn', `Duplicate level "${record.name}"`, () => {
      runOp(duplicateLevel(store, record, levels));
    });
    const del = iconButton(icon('trash'), 'level-btn level-del', `Delete level "${record.name}"`, () => {
      runOp(deleteLevel(store, record, levels));
    });
    del.disabled = levels.length <= 1;

    // klik w tlo wiersza przelacza poziom; klikniecia w kontrolki zostawiamy im
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, input')) return;
      runOp(switchTo(store, record));
    });

    row.append(thumb, name, dup, del);
    rows.set(record.id, { row, thumb, record, dup, del });
    // biezacy poziom ma swiezsza tresc i miniature w zywym rekordzie niz kopia z magazynu
    syncRow(active ? current! : record);
    return row;
  }

  function build(
    store: WorkspaceStore, projects: ProjectMeta[], projectId: string | null, levels: LevelRecord[],
  ): void {
    rows.clear();
    box.replaceChildren();

    const select = el('select', 'project-select');
    select.setAttribute('aria-label', 'Project');
    for (const meta of projects) {
      const option = el('option', undefined, meta.name);
      option.value = meta.id;
      option.selected = meta.id === projectId;
      select.append(option);
    }
    select.addEventListener('change', () => { runOp(openProject(store, select.value)); });

    const meta = projects.find((p) => p.id === projectId) ?? null;
    const actions = el('div', 'btn-row project-actions');
    const rename = button('Rename', 'btn-plain', () => { if (meta) runOp(renameProject(store, meta)); });
    rename.disabled = !meta;
    const del = iconButton(icon('trash'), 'level-btn level-del', 'Delete project', () => {
      if (meta) runOp(deleteProject(store, meta, projects));
    });
    del.disabled = !meta || projects.length <= 1;
    actions.append(button('New', '', () => { runOp(newProject(store, projects)); }), rename, del);

    box.append(select, actions);

    if (!projectId) {
      box.append(el('p', 'hint help-box hint-small', 'No projects yet - create one to start.'), ioRow(store, projectId));
      return;
    }

    const list = el('div', 'level-list');
    levels.forEach((record, index) => list.append(levelRow(store, record, index, levels)));
    box.append(list, button('New level', 'btn-full', () => { runOp(newLevel(store, projectId, levels)); }));
    box.append(ioRow(store, projectId));
  }

  /**
   * Pelna przebudowa karty. Wolamy ja WYLACZNIE po zmianie struktury (nowy/skasowany/przelaczony
   * poziom, zmiana projektu, import), wiec pominiecie zostawiloby liste z nieistniejacymi wierszami.
   * Dlatego fokus w polu nazwy nie blokuje renderu - zabieramy go swiadomie (blur), bo kazde
   * nacisniecie klawisza jest juz zapisane, wiec traci sie najwyzej kursor, nigdy dane.
   * Odswiezanie miniatur idzie osobna sciezka (setRowThumb/syncRow, bez przebudowy DOM),
   * wiec autozapis w trakcie pisania nadal nie rusza pola nazwy.
   */
  async function render(): Promise<void> {
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && box.contains(focused)) {
      focused.blur();
      // blur moze dopiero co zamowic zapis nazwy (pusta wraca do "Level N") - domykamy go
      // przed odczytem, inaczej przebudowana lista pokazalaby nazwe sprzed edycji
      flushSave();
    }
    const seq = ++renderSeq;
    const store = getStore();
    if (!store) {
      // Degenerowany wariant bez magazynu: karta Project potrzebuje WorkspaceStore do listy
      // projektow/poziomow, wiec tu nie ma nic wiecej niz hint. Rzad Export/Import zostaje
      // widoczny - oba przyciski otwieraja dialog bez kontekstu, ktory sam pokazuje sekcje/akcje
      // na projekcie jako disabled (T3/T4).
      rows.clear(); // wiersze znikaja z DOM, wiec mapa nie moze zostac z odpietymi wezlami
      box.replaceChildren(
        el('p', 'hint help-box hint-small', 'Storage unavailable - projects cannot be saved.'), ioRow(null, null),
      );
      return;
    }
    const projects = (await store.listProjects()).sort((a, b) => a.createdAt - b.createdAt);
    const projectId = getCurrentLevel()?.projectId ?? projects[0]?.id ?? null;
    const levels = projectId ? await store.listLevels(projectId) : [];
    if (seq !== renderSeq) return; // w trakcie odczytu przyszedl nowszy render
    build(store, projects, projectId, levels);
  }

  return { render: () => { runOp(render()); } };
}
