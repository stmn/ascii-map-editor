// Sesyjna historia komend: caller stosuje zmiane, potem push(cmd) z inwersja.
export interface Command { label: string; undo(): void; redo(): void }

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  onChange?: () => void;

  constructor(private cap = 100) {}

  private changed(): void { this.onChange?.(); }

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.cap) this.undoStack.shift();
    this.redoStack = [];
    this.changed();
  }

  undo(): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.changed();
    return cmd;
  }

  redo(): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    this.changed();
    return cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
}
