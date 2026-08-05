// IndexedDB implementacja WorkspaceStore. Baza 'ascii-level-editor' v1:
// - store 'projects' (keyPath 'id')
// - store 'levels' (keyPath 'id', index 'projectId')
// Kazda operacja promisyfikuje request; blad/odrzucenie otwarcia bazy odrzuca promise
// z openIdbStore - caller (patrz Task 4) decyduje o fallbacku na KvJsonStore.
import { byOrder } from './store';
import type { LevelRecord, ProjectMeta, WorkspaceStore } from './store';

const DB_NAME = 'ascii-level-editor';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const LEVELS = 'levels';
const PROJECT_ID_INDEX = 'projectId';

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEVELS)) {
        const levels = db.createObjectStore(LEVELS, { keyPath: 'id' });
        levels.createIndex(PROJECT_ID_INDEX, PROJECT_ID_INDEX);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

class IndexedDbStore implements WorkspaceStore {
  constructor(private readonly db: IDBDatabase) {}

  async listProjects(): Promise<ProjectMeta[]> {
    const tx = this.db.transaction(PROJECTS, 'readonly');
    const result = await reqToPromise(tx.objectStore(PROJECTS).getAll());
    await txDone(tx);
    return result;
  }

  async putProject(p: ProjectMeta): Promise<void> {
    const tx = this.db.transaction(PROJECTS, 'readwrite');
    tx.objectStore(PROJECTS).put(p);
    await txDone(tx);
  }

  async deleteProject(id: string): Promise<void> {
    const tx = this.db.transaction([PROJECTS, LEVELS], 'readwrite');
    tx.objectStore(PROJECTS).delete(id);
    const levelIds = await reqToPromise(
      tx.objectStore(LEVELS).index(PROJECT_ID_INDEX).getAllKeys(id),
    );
    const levels = tx.objectStore(LEVELS);
    for (const key of levelIds) levels.delete(key);
    await txDone(tx);
  }

  async listLevels(projectId: string): Promise<LevelRecord[]> {
    const tx = this.db.transaction(LEVELS, 'readonly');
    const result = await reqToPromise(
      tx.objectStore(LEVELS).index(PROJECT_ID_INDEX).getAll(projectId),
    );
    await txDone(tx);
    return result.sort(byOrder);
  }

  async getLevel(id: string): Promise<LevelRecord | null> {
    const tx = this.db.transaction(LEVELS, 'readonly');
    const result = await reqToPromise(tx.objectStore(LEVELS).get(id));
    await txDone(tx);
    return result ?? null;
  }

  async putLevel(l: LevelRecord): Promise<void> {
    const tx = this.db.transaction(LEVELS, 'readwrite');
    tx.objectStore(LEVELS).put(l);
    await txDone(tx);
  }

  async deleteLevel(id: string): Promise<void> {
    const tx = this.db.transaction(LEVELS, 'readwrite');
    tx.objectStore(LEVELS).delete(id);
    await txDone(tx);
  }
}

export async function openIdbStore(): Promise<WorkspaceStore> {
  const db = await openDb();
  return new IndexedDbStore(db);
}
