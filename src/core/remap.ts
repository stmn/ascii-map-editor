// Zmiana znaku wpisu legendy = przemapowanie komorek na wszystkich warstwach.
import { Level, levelUsedChars } from './level';
import { Legend, LegendEntry } from './legend';

export interface RemapResult { cells: { layerId: string; x: number; y: number }[] }

// Przemapowuje WSZYSTKIE komorki `from` -> `to` na wszystkich warstwach oraz wpis legendy
// (zachowuje name/color/pozycje wpisu). Rzuca Error('Character already in use') gdy `to`
// jest w legendzie lub na mapie; Error('Invalid character') gdy to nie pojedynczy znak
// drukowalny (to.length !== 1 lub to === ' '). Zwraca liste przemapowanych komorek
// (do komendy historii - inwersja robi remap w druga strone).
export function remapChar(level: Level, from: string, to: string): RemapResult {
  if (to.length !== 1 || to === ' ') throw new Error('Invalid character');
  if (to === from) return { cells: [] };
  if (level.legend.get(to) || levelUsedChars(level).includes(to)) {
    throw new Error('Character already in use');
  }
  const cells: RemapResult['cells'] = [];
  for (const layer of level.layers) {
    for (const { x, y, ch } of [...layer.grid.cells()]) {
      if (ch !== from) continue;
      layer.grid.set(x, y, to);
      cells.push({ layerId: layer.id, x, y });
    }
  }
  // wpis legendy: podmiana klucza z zachowaniem pozycji i danych - nowa instancja Legend
  // zbudowana przez publiczne API; renderer i panele czytaja level.legend na biezaco,
  // wiec podmiana referencji jest bezpieczna (pole legend w Level nie jest readonly)
  const entries = level.legend.entries();
  const rebuilt = entries.map((e): LegendEntry => (e.ch === from ? { ...e, ch: to } : e));
  level.legend = Legend.from(rebuilt);
  return { cells };
}
