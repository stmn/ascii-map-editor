export interface LegendEntry { ch: string; name: string; color: string }

export const DEFAULT_NAMES: Record<string, string> = {
  '#': 'wall', '.': 'floor', '@': 'player', 'S': 'start', 'E': 'exit',
  '~': 'water', '+': 'door',
};

const PALETTE = ['#1a1c2c', '#b13e53', '#257953', '#3b5dc9', '#a05a2c', '#5d275d', '#136f63', '#565a75'];

export class Legend {
  private list: LegendEntry[] = [];

  entries(): LegendEntry[] { return [...this.list]; }
  get(ch: string): LegendEntry | null { return this.list.find((e) => e.ch === ch) ?? null; }

  upsert(ch: string, patch: Partial<Omit<LegendEntry, 'ch'>>): void {
    const existing = this.list.find((e) => e.ch === ch);
    if (existing) Object.assign(existing, patch);
    else this.list.push({
      ch,
      name: patch.name ?? DEFAULT_NAMES[ch] ?? `tile_${ch}`,
      color: patch.color ?? PALETTE[this.list.length % PALETTE.length]!,
    });
  }

  remove(ch: string): void { this.list = this.list.filter((e) => e.ch !== ch); }

  syncWith(usedChars: string[]): void {
    for (const ch of usedChars) if (!this.get(ch)) this.upsert(ch, {});
  }

  static from(entries: LegendEntry[]): Legend {
    const l = new Legend();
    for (const e of entries) l.upsert(e.ch, { name: e.name, color: e.color });
    return l;
  }
}
