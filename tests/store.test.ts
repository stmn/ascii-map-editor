import { describe, expect, it } from 'vitest';
import { KvJsonStore, ensureSeed, exportWorkspace, importWorkspace, nextName } from '../src/core/store';
import type { Kv } from '../src/core/store';

function memKv(): Kv {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('workspace store', () => {
  it('CRUD projektow i poziomow, poziomy sortowane po order', async () => {
    const s = new KvJsonStore(memKv());
    await s.putProject({ id: 'p1', name: 'P', createdAt: 1, updatedAt: 1 });
    await s.putLevel({ id: 'l2', projectId: 'p1', name: 'B', order: 2, data: '{}', thumb: null, updatedAt: 1 });
    await s.putLevel({ id: 'l1', projectId: 'p1', name: 'A', order: 1, data: '{}', thumb: null, updatedAt: 1 });
    expect((await s.listLevels('p1')).map((l) => l.id)).toEqual(['l1', 'l2']);
    await s.deleteProject('p1');
    expect(await s.listProjects()).toEqual([]);
    expect(await s.listLevels('p1')).toEqual([]);
  });

  it('nextName znajduje pierwszy wolny numer', () => {
    expect(nextName('Level', [])).toBe('Level 1');
    expect(nextName('Level', ['Level 1', 'Level 3'])).toBe('Level 2');
  });

  it('ensureSeed: pusty store tworzy My project/Level 1; legacy autosave migruje', async () => {
    const s = new KvJsonStore(memKv());
    const seeded = await ensureSeed(s, 42, '{"app":"ascii-level-editor","version":2,"origin":[0,0],"lines":["#"],"legend":[]}');
    expect(seeded.migrated).toBe(true);
    const lvl = await s.getLevel(seeded.levelId);
    expect(lvl!.data).toContain('"#"');
    const again = await ensureSeed(s, 43, null);
    expect(again.projectId).toBe(seeded.projectId);
    expect(again.migrated).toBe(false);
  });

  it('export/import workspace: merge-add z nowymi id i remapem', async () => {
    const a = new KvJsonStore(memKv());
    await a.putProject({ id: 'p1', name: 'World', createdAt: 1, updatedAt: 1 });
    await a.putLevel({ id: 'l1', projectId: 'p1', name: 'L1', order: 1, data: '{"x":1}', thumb: 'data:...', updatedAt: 1 });
    const json = await exportWorkspace(a);
    expect(json).toContain('"ascii-level-editor-workspace"');
    expect(json).not.toContain('data:...');

    const b = new KvJsonStore(memKv());
    await b.putProject({ id: 'z', name: 'World', createdAt: 1, updatedAt: 1 });
    const res = await importWorkspace(b, json, 99);
    expect(res).toEqual({ projects: 1, levels: 1 });
    const projs = await b.listProjects();
    expect(projs).toHaveLength(2);
    const imported = projs.find((p) => p.id !== 'z')!;
    expect(imported.name).toBe('World 2');
    expect(imported.id).not.toBe('p1');
    const lvls = await b.listLevels(imported.id);
    expect(lvls).toHaveLength(1);
    expect(lvls[0]!.data).toBe('{"x":1}');
    expect(await b.listLevels('p1')).toEqual([]);
  });

  it('importWorkspace odrzuca obcy format', async () => {
    const s = new KvJsonStore(memKv());
    await expect(importWorkspace(s, '{"foo":1}', 1)).rejects.toThrow('Unrecognized workspace file');
  });
});
