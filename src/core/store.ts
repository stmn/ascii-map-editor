// Warstwa danych workspace: metadane projektow + rekordy poziomow.
// KvJsonStore trzyma caly workspace jako jeden JSON pod jednym kluczem - to sciezka
// fallback gdy IndexedDB jest niedostepne (patrz idb.ts dla wlasciwej implementacji).
import { createLevel } from './level';
import { parseProject, serializeProject } from './project';

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface LevelRecord {
  id: string;
  projectId: string;
  name: string;
  order: number;
  data: string; // JSON v3 (serializeProject)
  thumb: string | null; // dataURL albo null
  updatedAt: number;
}

export interface WorkspaceStore {
  listProjects(): Promise<ProjectMeta[]>;
  putProject(p: ProjectMeta): Promise<void>;
  deleteProject(id: string): Promise<void>; // kasuje tez poziomy projektu
  listLevels(projectId: string): Promise<LevelRecord[]>; // rosnaco po order
  getLevel(id: string): Promise<LevelRecord | null>;
  putLevel(l: LevelRecord): Promise<void>;
  deleteLevel(id: string): Promise<void>;
  /** Zwolnienie polaczenia; ma je tylko IndexedDB, KvJsonStore nie trzyma zadnego zasobu. */
  close?(): void;
}

export interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WorkspaceData {
  projects: ProjectMeta[];
  levels: LevelRecord[];
}

/** Klucz calego workspace w Kv (localStorage) - takze dla boota, ktory sprzata po fallbacku. */
export const WORKSPACE_KEY = 'ascii-level-editor-workspace';
// limit na zapisywany JSON - localStorage ma zwykle ~5MB limit na origin,
// wiec zostawiamy margines (ten sam limit co stary autosave)
const MAX_WRITE_BYTES = 4.5 * 1024 * 1024;

function emptyData(): WorkspaceData {
  return { projects: [], levels: [] };
}

// pomocnicze sortowanie poziomow po polu order (wspolne dla KvJsonStore i idb.ts)
export function byOrder(a: LevelRecord, b: LevelRecord): number {
  return a.order - b.order;
}

// caly workspace jako jeden JSON pod kluczem key; odczyt-modyfikacja-zapis calosci
// przy kazdej operacji - prostota kosztem wydajnosci, uzasadnione bo to sciezka fallback
export class KvJsonStore implements WorkspaceStore {
  private readonly kv: Kv;
  private readonly key: string;
  private readonly onWriteError?: (e: unknown) => void;

  constructor(kv: Kv, key: string = WORKSPACE_KEY, onWriteError?: (e: unknown) => void) {
    this.kv = kv;
    this.key = key;
    this.onWriteError = onWriteError;
  }

  private read(): WorkspaceData {
    const raw = this.kv.getItem(this.key);
    if (!raw) return emptyData();
    try {
      const parsed = JSON.parse(raw) as Partial<WorkspaceData>;
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        levels: Array.isArray(parsed.levels) ? parsed.levels : [],
      };
    } catch {
      return emptyData();
    }
  }

  // miekki blad zapisu: to jest sciezka fallback (bez IndexedDB), wiec przekroczenie
  // limitu rozmiaru albo wyjatek z kv.setItem (np. QuotaExceededError) NIE moze wywalic
  // aplikacji - tylko zglaszamy przez onWriteError i pomijamy zapis, bez rethrow
  private write(data: WorkspaceData): void {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_WRITE_BYTES) {
      this.onWriteError?.(new Error('Workspace too large to save'));
      return;
    }
    try {
      this.kv.setItem(this.key, serialized);
    } catch (e) {
      this.onWriteError?.(e);
    }
  }

  async listProjects(): Promise<ProjectMeta[]> {
    return this.read().projects;
  }

  async putProject(p: ProjectMeta): Promise<void> {
    const data = this.read();
    const idx = data.projects.findIndex((x) => x.id === p.id);
    if (idx >= 0) data.projects[idx] = p;
    else data.projects.push(p);
    this.write(data);
  }

  async deleteProject(id: string): Promise<void> {
    const data = this.read();
    data.projects = data.projects.filter((p) => p.id !== id);
    data.levels = data.levels.filter((l) => l.projectId !== id);
    this.write(data);
  }

  async listLevels(projectId: string): Promise<LevelRecord[]> {
    return this.read()
      .levels.filter((l) => l.projectId === projectId)
      .sort(byOrder);
  }

  async getLevel(id: string): Promise<LevelRecord | null> {
    return this.read().levels.find((l) => l.id === id) ?? null;
  }

  async putLevel(l: LevelRecord): Promise<void> {
    const data = this.read();
    const idx = data.levels.findIndex((x) => x.id === l.id);
    if (idx >= 0) data.levels[idx] = l;
    else data.levels.push(l);
    this.write(data);
  }

  async deleteLevel(id: string): Promise<void> {
    const data = this.read();
    data.levels = data.levels.filter((l) => l.id !== id);
    this.write(data);
  }
}

// pierwszy wolny numer 'base N': goly 'base' (bez numeru) liczy sie jako zajete
// miejsce 1, zeby duplikat nazwy nigdy nie stworzyl mylacej pary "Nazwa" / "Nazwa 1"
export function nextName(base: string, existing: string[]): string {
  const used = new Set<number>();
  for (const name of existing) {
    if (name === base) {
      used.add(1);
      continue;
    }
    if (name.startsWith(`${base} `)) {
      const rest = name.slice(base.length + 1);
      const n = Number(rest);
      if (Number.isInteger(n) && n > 0 && String(n) === rest) used.add(n);
    }
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${base} ${n}`;
}

export async function ensureSeed(
  store: WorkspaceStore,
  now: number,
  legacyJson: string | null,
): Promise<{ projectId: string; levelId: string; migrated: boolean }> {
  const projects = await store.listProjects();

  // store niepusty: bierzemy pierwszy projekt i jego pierwszy poziom, bez migracji
  if (projects.length > 0) {
    const project = projects[0]!;
    const levels = await store.listLevels(project.id);
    if (levels.length > 0) {
      return { projectId: project.id, levelId: levels[0]!.id, migrated: false };
    }
    const level: LevelRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: 'Level 1',
      order: 1,
      data: serializeProject(createLevel()),
      thumb: null,
      updatedAt: now,
    };
    await store.putLevel(level);
    return { projectId: project.id, levelId: level.id, migrated: false };
  }

  // store pusty: tworzymy 'My project' / 'Level 1'; legacy autosave (jesli parsuje
  // sie tolerancyjnym parseProject) laduje jako dane poziomu, znormalizowane do v3
  const project: ProjectMeta = {
    id: crypto.randomUUID(),
    name: 'My project',
    createdAt: now,
    updatedAt: now,
  };

  let data: string;
  let migrated: boolean;
  if (legacyJson !== null) {
    try {
      data = serializeProject(parseProject(legacyJson));
      migrated = true;
    } catch {
      data = serializeProject(createLevel());
      migrated = false;
    }
  } else {
    data = serializeProject(createLevel());
    migrated = false;
  }

  const level: LevelRecord = {
    id: crypto.randomUUID(),
    projectId: project.id,
    name: 'Level 1',
    order: 1,
    data,
    thumb: null,
    updatedAt: now,
  };

  await store.putProject(project);
  await store.putLevel(level);

  return { projectId: project.id, levelId: level.id, migrated };
}

interface ProjectFile {
  app: string;
  version: number;
  project: { name: string };
  levels: LevelRecord[];
}

interface WorkspaceFile {
  app: string;
  version: number;
  projects: ProjectMeta[];
  levels: LevelRecord[];
}

const PROJECT_APP_ID = 'ascii-level-editor-project';
const LEGACY_WORKSPACE_APP_ID = 'ascii-level-editor-workspace';

export async function exportProject(store: WorkspaceStore, projectId: string): Promise<string> {
  const projects = await store.listProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Project not found');
  const levels = await store.listLevels(projectId);
  const file: ProjectFile = {
    app: PROJECT_APP_ID,
    version: 1,
    project: { name: project.name },
    levels: levels.map((l) => ({ ...l, thumb: null })), // bez thumb - odchudza plik eksportu
  };
  return JSON.stringify(file, null, 2);
}

// wspolne dla importu pojedynczego projektu i legacy-workspace: jeden zestaw
// { name, levels } dostaje nowe id projektu (z nextName przy kolizji nazwy)
// i remapuje poziomy na nowe id; niepoprawne rekordy sa pomijane po cichu.
// createdAt jest oddzielony od now (uzywanego dla updatedAt/poziomow), zeby legacy-workspace
// mogl nadac kazdemu kolejnemu projektowi rosnacy createdAt i tym samym zachowac kolejnosc
// z pliku po imporcie (dropdown w project.ts sortuje projekty po createdAt) - domyslnie
// (import pojedynczego projektu) createdAt = now, bez zmiany zachowania.
async function importOneProject(
  store: WorkspaceStore,
  name: string,
  levels: LevelRecord[],
  now: number,
  existingNames: string[],
  createdAt: number = now,
): Promise<{ levelCount: number }> {
  const newId = crypto.randomUUID();
  let finalName = name;
  if (existingNames.includes(finalName)) finalName = nextName(finalName, existingNames);
  existingNames.push(finalName);
  await store.putProject({ id: newId, name: finalName, createdAt, updatedAt: now });

  let levelCount = 0;
  for (const l of levels) {
    if (typeof l.name !== 'string' || typeof l.data !== 'string' || !Number.isFinite(l.order)) continue;
    await store.putLevel({
      id: crypto.randomUUID(),
      projectId: newId,
      name: l.name,
      order: l.order,
      data: l.data,
      thumb: null,
      updatedAt: now,
    });
    levelCount++;
  }
  return { levelCount };
}

export async function importProject(
  store: WorkspaceStore,
  json: string,
  now: number,
): Promise<{ projects: number; levels: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Unrecognized project file');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Unrecognized project file');
  }
  const o = parsed as Record<string, unknown>;
  const existingNames = (await store.listProjects()).map((p) => p.name);

  // legacy: plik calego workspace (backup z wersji 2.2-2.5) - dodajemy
  // WSZYSTKIE jego projekty ta sama sciezka merge-add co pojedynczy projekt
  if (o.app === LEGACY_WORKSPACE_APP_ID && Array.isArray(o.projects) && Array.isArray(o.levels)) {
    const file = o as unknown as WorkspaceFile;
    const idToLevels = new Map<string, LevelRecord[]>();
    for (const l of file.levels) {
      const bucket = idToLevels.get(l.projectId);
      if (bucket) bucket.push(l);
      else idToLevels.set(l.projectId, [l]);
    }

    let projectCount = 0;
    let levelCount = 0;
    // createdAt = now + index (pozycja w file.projects) zamiast identycznego now dla
    // wszystkich - inaczej dropdown (sort po createdAt) traci oryginalna kolejnosc backupu
    for (let i = 0; i < file.projects.length; i++) {
      const p = file.projects[i]!;
      if (typeof p.name !== 'string') continue;
      const { levelCount: n } = await importOneProject(
        store,
        p.name,
        idToLevels.get(p.id) ?? [],
        now,
        existingNames,
        now + i,
      );
      projectCount++;
      levelCount += n;
    }
    return { projects: projectCount, levels: levelCount };
  }

  // plik pojedynczego projektu
  if (
    o.app === PROJECT_APP_ID &&
    typeof o.project === 'object' &&
    o.project !== null &&
    typeof (o.project as Record<string, unknown>).name === 'string' &&
    Array.isArray(o.levels)
  ) {
    const name = (o.project as { name: string }).name;
    const levels = o.levels as LevelRecord[];
    const { levelCount } = await importOneProject(store, name, levels, now, existingNames);
    return { projects: 1, levels: levelCount };
  }

  throw new Error('Unrecognized project file');
}
