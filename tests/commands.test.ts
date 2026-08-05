import { describe, expect, it } from 'vitest';
import {
  layerAddCommand, layerMoveCommand, layerRenameCommand, layerVisibilityCommand,
  replaceCommand, snapshotLevel, strokeCommand,
} from '../src/core/commands';
import type { EditorState } from '../src/core/editorState';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer, type Level } from '../src/core/level';

function makeState(level: Level = createLevel()): EditorState {
  return { level, activeLayer: 0, view: { panX: 0, panY: 0, scale: 32 }, brush: '#', contentRev: 0 };
}

describe('strokeCommand', () => {
  it('cofa cale pociagniecie i przywraca je przy redo', () => {
    const state = makeState();
    const layer = state.level.layers[0]!;
    layer.grid.set(0, 0, '.');
    const cells = [
      { layerId: layer.id, x: 0, y: 0, before: '.', after: '#' },
      { layerId: layer.id, x: 1, y: 0, before: ' ', after: '#' },
    ];
    for (const c of cells) layer.grid.set(c.x, c.y, c.after);
    const cmd = strokeCommand(state, cells);

    cmd.undo();
    expect(layer.grid.get(0, 0)).toBe('.');
    expect(layer.grid.get(1, 0)).toBeNull();

    cmd.redo();
    expect(layer.grid.get(0, 0)).toBe('#');
    expect(layer.grid.get(1, 0)).toBe('#');
  });

  it('komorki nieistniejacej warstwy pomija po cichu', () => {
    const state = makeState();
    const cmd = strokeCommand(state, [{ layerId: 'gone', x: 0, y: 0, before: ' ', after: '#' }]);
    expect(() => { cmd.undo(); cmd.redo(); }).not.toThrow();
    expect(state.level.layers[0]!.grid.isEmpty()).toBe(true);
  });
});

describe('replaceCommand', () => {
  it('wraca do migawki sprzed operacji i zachowuje id warstw', () => {
    const state = makeState();
    const layer = state.level.layers[0]!;
    layer.grid.set(0, 0, '#');
    const before = snapshotLevel(state.level);

    state.level.layers[0]!.grid = Grid.fromLines(['...']);
    const cmd = replaceCommand('Generate maze', before, snapshotLevel(state.level), (level) => {
      state.level = level;
    });

    cmd.undo();
    expect(state.level.layers[0]!.id).toBe(layer.id);
    expect(state.level.layers[0]!.grid.toLines()).toEqual(['#']);

    cmd.redo();
    expect(state.level.layers[0]!.grid.toLines()).toEqual(['...']);
  });
});

describe('komendy warstw', () => {
  it('add cofa sie do usuniecia, redo wstawia TEN SAM obiekt warstwy', () => {
    const state = makeState();
    const layer = makeLayer('layer 2');
    state.level.layers.splice(1, 0, layer);
    const cmd = layerAddCommand(state, 1, layer);

    cmd.undo();
    expect(state.level.layers).toHaveLength(1);
    cmd.redo();
    expect(state.level.layers[1]).toBe(layer);
    expect(state.activeLayer).toBe(1);
  });

  it('move, visibility i rename odwracaja sie symetrycznie', () => {
    const state = makeState();
    const second = makeLayer('layer 2');
    state.level.layers.push(second);
    const names = (): string[] => state.level.layers.map((l) => l.name);

    const move = layerMoveCommand(state, 1, 0);
    move.redo();
    expect(names()).toEqual(['layer 2', 'main']);
    move.undo();
    expect(names()).toEqual(['main', 'layer 2']);

    const vis = layerVisibilityCommand(state, second.id);
    vis.redo();
    expect(second.visible).toBe(false);
    vis.undo();
    expect(second.visible).toBe(true);

    const rename = layerRenameCommand(state, second.id, 'layer 2', 'roof');
    rename.redo();
    expect(second.name).toBe('roof');
    rename.undo();
    expect(second.name).toBe('layer 2');
  });
});
