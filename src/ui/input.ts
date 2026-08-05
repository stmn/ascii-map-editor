import { isModalOpen } from './modal';
import { screenToCell, type View } from './renderer';

export interface InputCallbacks {
  paint(x: number, y: number): void;
  erase(x: number, y: number): void;
  /** erasing = modyfikator gumki (Alt/Ctrl/Meta) jest wcisniety lub trwa wymazywanie */
  hover(x: number, y: number, erasing: boolean): void;
  viewChanged(): void;
}

interface Cell { x: number; y: number }

/** Modyfikator gumki: Alt (Option), Ctrl albo Meta (Cmd). */
function isEraseModifier(e: PointerEvent): boolean {
  return e.altKey || e.ctrlKey || e.metaKey;
}

/** Czy zdarzenie klawiatury leci z pola tekstowego - wtedy klawisz nalezy do niego, nie do mapy. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Bresenham: komorki na odcinku (x0,y0)-(x1,y1) bez punktu startowego. */
function* lineCells(x0: number, y0: number, x1: number, y1: number): Iterable<Cell> {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    yield { x, y };
  }
}

export class InputController {
  private painting = false;
  private erasing = false;
  private panning = false;
  private last = { x: 0, y: 0 };
  /** Ostatnia komorka pociagniecia - do interpolacji przy szybkim przeciaganiu. */
  private lastCell: Cell | null = null;

  constructor(private canvas: HTMLCanvasElement, private cb: InputCallbacks, private view: View) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => this.endGesture());
    window.addEventListener('pointercancel', () => this.endGesture());
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private endGesture(): void {
    this.painting = this.erasing = this.panning = false;
    this.lastCell = null;
  }

  /** Maluje/wymazuje z interpolacja od poprzedniej komorki, zeby pociagniecie bylo ciagle. */
  private stroke(x: number, y: number, erase: boolean): void {
    const emit = (cx: number, cy: number): void => {
      if (erase) this.cb.erase(cx, cy); else this.cb.paint(cx, cy);
    };
    if (this.lastCell) for (const c of lineCells(this.lastCell.x, this.lastCell.y, x, y)) emit(c.x, c.y);
    else emit(x, y);
    this.lastCell = { x, y };
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.last = { x: e.offsetX, y: e.offsetY };
    if (e.button === 1 || e.button === 2) { this.panning = true; return; }
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    this.lastCell = null; // nowe pociagniecie - brak interpolacji do poprzedniego
    if (isEraseModifier(e)) { this.erasing = true; this.stroke(x, y, true); }
    else { this.painting = true; this.stroke(x, y, false); }
  }

  private move(e: PointerEvent): void {
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    // w trakcie malowania modyfikator wcisniety po drodze nie zmienia trybu, wiec i podswietlenia
    this.cb.hover(x, y, this.painting ? false : (this.erasing || isEraseModifier(e)));
    if (this.panning) {
      this.view.panX -= e.offsetX - this.last.x;
      this.view.panY -= e.offsetY - this.last.y;
      this.last = { x: e.offsetX, y: e.offsetY };
      this.cb.viewChanged();
    } else if (this.painting) this.stroke(x, y, false);
    else if (this.erasing) this.stroke(x, y, true);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const old = this.view.scale;
    const next = Math.max(8, Math.min(64, old * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    // zoom do kursora: punkt pod mysza zostaje w miejscu
    this.view.panX = (this.view.panX + e.offsetX) * (next / old) - e.offsetX;
    this.view.panY = (this.view.panY + e.offsetY) * (next / old) - e.offsetY;
    this.view.scale = next;
    this.cb.viewChanged();
  }

  private key(e: KeyboardEvent): void {
    if (isModalOpen()) return;
    if (isTypingTarget(e.target)) return;
    const step = 48;
    if (e.key === 'ArrowLeft') this.view.panX -= step;
    else if (e.key === 'ArrowRight') this.view.panX += step;
    else if (e.key === 'ArrowUp') this.view.panY -= step;
    else if (e.key === 'ArrowDown') this.view.panY += step;
    else return;
    this.cb.viewChanged();
  }
}
