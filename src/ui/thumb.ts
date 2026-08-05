// Miniatura poziomu do listy poziomow (Task 5). Komorki rysujemy jako pelne prostokaty
// w kolorze legendy - w skali 120x80 glify bylyby i tak nieczytelne, a plamy koloru
// czytelnie pokazuja ksztalt mapy.
import { flattenLayers, unionBounds } from '../core/level';
import type { Level } from '../core/level';
import { COLOR_INK_FALLBACK, COLOR_PAPER } from './renderer';

const THUMB_W = 120;
const THUMB_H = 80;

/** Miniatura jako dataURL (jpeg 0.6) albo null gdy nie ma nic widocznego do pokazania. */
export function renderThumb(level: Level): string | null {
  // kadrujemy po warstwach WIDOCZNYCH - inaczej jedna ukryta komorka gdzies daleko
  // scisnelaby i przesunela cala miniature. Przy okazji: same ukryte warstwy daja null
  const visible = level.layers.filter((l) => l.visible);
  const b = unionBounds(visible);
  if (!b) return null; // pusty (albo caly ukryty) poziom - lista pokaze placeholder zamiast obrazka

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const cols = b.maxX - b.minX + 1;
  const rows = b.maxY - b.minY + 1;
  // calkowity rozmiar komorki (min 1 px) - ulamkowy dawalby rozjezdzajace sie szpary miedzy plamami;
  // przy mapie szerszej niz 120 komorek offset wychodzi ujemny, wiec kadrujemy srodek
  const cell = Math.max(1, Math.floor(Math.min(THUMB_W / cols, THUMB_H / rows)));
  const offX = Math.round((THUMB_W - cols * cell) / 2);
  const offY = Math.round((THUMB_H - rows * cell) / 2);

  for (const { x, y, ch } of flattenLayers(visible).cells()) {
    ctx.fillStyle = level.legend.get(ch)?.color ?? COLOR_INK_FALLBACK;
    ctx.fillRect(offX + (x - b.minX) * cell, offY + (y - b.minY) * cell, cell, cell);
  }

  return canvas.toDataURL('image/jpeg', 0.6);
}
