// Sparse mapa znakow: klucz "x,y" -> znak. Pusta komorka = brak wpisu.
export interface Cell { x: number; y: number; ch: string }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export class Grid {
  private map = new Map<string, string>();

  set(x: number, y: number, ch: string): void {
    if (!ch || ch === ' ') { this.map.delete(`${x},${y}`); return; }
    this.map.set(`${x},${y}`, ch[0]);
  }

  get(x: number, y: number): string | null {
    return this.map.get(`${x},${y}`) ?? null;
  }

  clear(): void { this.map.clear(); }
  isEmpty(): boolean { return this.map.size === 0; }

  *cells(): Iterable<Cell> {
    for (const [k, ch] of this.map) {
      const [x, y] = k.split(',').map(Number);
      yield { x, y, ch };
    }
  }

  bounds(): Bounds | null {
    if (this.map.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { x, y } of this.cells()) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  toLines(): string[] {
    const b = this.bounds();
    if (!b) return [];
    const lines: string[] = [];
    for (let y = b.minY; y <= b.maxY; y++) {
      let line = '';
      for (let x = b.minX; x <= b.maxX; x++) line += this.get(x, y) ?? ' ';
      lines.push(line.replace(/ +$/, ''));
    }
    return lines;
  }

  static fromLines(lines: string[], originX = 0, originY = 0): Grid {
    const g = new Grid();
    lines.forEach((line, y) => {
      [...line].forEach((ch, x) => g.set(originX + x, originY + y, ch));
    });
    return g;
  }

  usedChars(): string[] {
    return [...new Set(this.map.values())].sort();
  }
}
