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

/**
 * Scalenie legendy po wczytaniu poziomu BEZ jawnej legendy (Replace current level w importModal.ts,
 * czyli tez Load w karcie Map - ta sama sciezka). Znaki, ktore user juz nazwal/pokolorowal w
 * DOTYCHCZASOWEJ legendzie, zachowuja swoje name/color - przeladowanie tekstowej mapy (np. paste
 * z powrotem edytowanego eksportu) nie moze zresetowac wlasnych ustawien do auto-palety. Znaki
 * nowe (nieobecne w starej legendzie) zostaja tym, co juz przydzielil freshLegend (syncWith).
 * Wolajacy uzywa tego WYLACZNIE, gdy zrodlo nie mialo jawnej legendy - plik z wlasna legenda
 * wygrywa w calosci (patrz explicitLegend w core/project.ts).
 */
export function mergeLegendKeepingOld(oldLegend: Legend, freshLegend: Legend): Legend {
  const merged = Legend.from(freshLegend.entries());
  for (const entry of oldLegend.entries()) {
    // znak spoza swiezej legendy nie jest uzyty na nowej mapie - stara skorupa go nie wskrzesza
    if (merged.get(entry.ch)) merged.upsert(entry.ch, { name: entry.name, color: entry.color });
  }
  return merged;
}
