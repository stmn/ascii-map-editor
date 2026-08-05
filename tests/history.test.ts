import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';
import type { Command } from '../src/core/history';

function cmd(log: string[], name: string): Command {
  return { label: name, undo: () => log.push(`undo:${name}`), redo: () => log.push(`redo:${name}`) };
}

describe('History', () => {
  it('undo/redo w kolejnosci LIFO, redo czyszczone przy push', () => {
    const log: string[] = [];
    const h = new History();
    h.push(cmd(log, 'a'));
    h.push(cmd(log, 'b'));
    expect(h.canUndo()).toBe(true);
    expect(h.undo()!.label).toBe('b');
    expect(h.undo()!.label).toBe('a');
    expect(h.canUndo()).toBe(false);
    expect(h.redo()!.label).toBe('a');
    h.push(cmd(log, 'c'));            // czysci redo ('b')
    expect(h.canRedo()).toBe(false);
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a']);
  });

  it('cap wyrzuca najstarsze', () => {
    const log: string[] = [];
    const h = new History(2);
    h.push(cmd(log, '1')); h.push(cmd(log, '2')); h.push(cmd(log, '3'));
    expect(h.undo()!.label).toBe('3');
    expect(h.undo()!.label).toBe('2');
    expect(h.undo()).toBeNull();
  });

  it('clear i onChange', () => {
    let ticks = 0;
    const h = new History();
    h.onChange = () => { ticks++; };
    h.push(cmd([], 'x'));   // 1
    h.undo();               // 2
    h.redo();               // 3
    h.clear();              // 4
    expect(ticks).toBe(4);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('undo/redo na pustych stosach nie wola onChange', () => {
    let ticks = 0;
    const h = new History();
    h.onChange = () => { ticks++; };
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(ticks).toBe(0);
  });
});
