import { screenToCell, type View } from './renderer';

export interface InputCallbacks {
  paint(x: number, y: number): void;
  erase(x: number, y: number): void;
  /** erasing = modyfikator gumki (Alt/Ctrl/Meta) jest wcisniety lub trwa wymazywanie */
  hover(x: number, y: number, erasing: boolean): void;
  viewChanged(): void;
}

/** Modyfikator gumki: Alt (Option), Ctrl albo Meta (Cmd). */
function isEraseModifier(e: PointerEvent): boolean {
  return e.altKey || e.ctrlKey || e.metaKey;
}

export class InputController {
  private painting = false;
  private erasing = false;
  private panning = false;
  private last = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private cb: InputCallbacks, private view: View) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => { this.painting = this.erasing = this.panning = false; });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.last = { x: e.offsetX, y: e.offsetY };
    if (e.button === 1 || e.button === 2) { this.panning = true; return; }
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    if (isEraseModifier(e)) { this.erasing = true; this.cb.erase(x, y); }
    else { this.painting = true; this.cb.paint(x, y); }
  }

  private move(e: PointerEvent): void {
    const { x, y } = screenToCell(e.offsetX, e.offsetY, this.view);
    this.cb.hover(x, y, this.erasing || isEraseModifier(e));
    if (this.panning) {
      this.view.panX -= e.offsetX - this.last.x;
      this.view.panY -= e.offsetY - this.last.y;
      this.last = { x: e.offsetX, y: e.offsetY };
      this.cb.viewChanged();
    } else if (this.painting) this.cb.paint(x, y);
    else if (this.erasing) this.cb.erase(x, y);
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
    const step = 48;
    if (e.key === 'ArrowLeft') this.view.panX -= step;
    else if (e.key === 'ArrowRight') this.view.panX += step;
    else if (e.key === 'ArrowUp') this.view.panY -= step;
    else if (e.key === 'ArrowDown') this.view.panY += step;
    else return;
    this.cb.viewChanged();
  }
}
