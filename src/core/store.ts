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
}

export interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WorkspaceData {
  projects: ProjectMeta[];
  levels: LevelRecord[];
}

const DEFAULT_KEY = 'ascii-level-editor-workspace';

function emptyData(): WorkspaceData {
  return { projects: [], levels: [] };
}

// caly workspace jako jeden JSON pod kluczem key; odczyt-modyfikacja-zapis calosci
// przy kazdej operacji - prostota kosztem wydajnosci, uzasadnione bo to sciezka fallback
export class KvJsonStore implements WorkspaceStore {
  private readonly kv: Kv;
  private readonly key: string;

  constructor(kv: Kv, key: string = DEFAULT_KEY) {
    this.kv = kv;
    this.key = key;
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

  private write(data: WorkspaceData): void {
    this.kv.setItem(this.key, JSON.stringify(data));
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
      .sort((a, b) => a.order - b.order);
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

interface WorkspaceFile {
  app: string;
  version: number;
  projects: ProjectMeta[];
  levels: LevelRecord[];
}

const EXPORT_APP_ID = 'ascii-level-editor-workspace';

export async function exportWorkspace(store: WorkspaceStore): Promise<string> {
  const projects = await store.listProjects();
  const levels: LevelRecord[] = [];
  for (const p of projects) {
    levels.push(...(await store.listLevels(p.id)));
  }
  const file: WorkspaceFile = {
    app: EXPORT_APP_ID,
    version: 1,
    projects,
    levels: levels.map((l) => ({ ...l, thumb: null })), // bez thumb - odchudza plik eksportu
  };
  return JSON.stringify(file, null, 2);
}

export async function importWorkspace(
  store: WorkspaceStore,
  json: string,
  now: number,
): Promise<{ projects: number; levels: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Unrecognized workspace file');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Unrecognized workspace file');
  }
  const o = parsed as Record<string, unknown>;
  if (o.app !== EXPORT_APP_ID || !Array.isArray(o.projects) || !Array.isArray(o.levels)) {
    throw new Error('Unrecognized workspace file');
  }

  const importedProjects = o.projects as ProjectMeta[];
  const importedLevels = o.levels as LevelRecord[];

  // merge-add: wszystko dostaje nowe id, kolidujace nazwy projektow dostaja nextName
  const existingNames = (await store.listProjects()).map((p) => p.name);
  const idMap = new Map<string, string>(); // stare projectId -> nowe id

  for (const p of importedProjects) {
    const newId = crypto.randomUUID();
    idMap.set(p.id, newId);
    let name = p.name;
    if (existingNames.includes(name)) name = nextName(name, existingNames);
    existingNames.push(name);
    await store.putProject({ id: newId, name, createdAt: p.createdAt, updatedAt: now });
  }

  let levelCount = 0;
  for (const l of importedLevels) {
    const newProjectId = idMap.get(l.projectId);
    if (!newProjectId) continue; // poziom bez zaimportowanego projektu - pomijamy (obcy/uszkodzony plik)
    await store.putLevel({
      id: crypto.randomUUID(),
      projectId: newProjectId,
      name: l.name,
      order: l.order,
      data: l.data,
      thumb: null,
      updatedAt: now,
    });
    levelCount++;
  }

  return { projects: importedProjects.length, levels: levelCount };
}
