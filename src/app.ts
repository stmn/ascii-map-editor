import './styles.css';
import { Grid } from './core/grid';
import { Legend } from './core/legend';
import { Renderer, centerView, paperRect, type View } from './ui/renderer';
import { InputController } from './ui/input';
import { initPanels } from './ui/panels';

/** Przesuniecie startowego widoku w lewo, bo prawa krawedz zajmuje panel (jak +140 w v1). */
const SIDEBAR_OFFSET = 140;

export interface EditorState {
  grid: Grid;
  legend: Legend;
  view: View;
  brush: string;
}

export const state: EditorState = {
  grid: new Grid(),
  legend: new Legend(),
  view: { panX: 0, panY: 0, scale: 32 },
  brush: '#',
};

const canvas = document.getElementById('map') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let dirty = true;
/** Zamawia przerysowanie w najblizszej klatce - rysujemy tylko po zmianach. */
export function markDirty(): void { dirty = true; }

function centerOnPaper(): void {
  centerView(state.view, paperRect(state.grid), canvas.clientWidth, canvas.clientHeight, SIDEBAR_OFFSET);
}

renderer.resize();
centerOnPaper();

// panele dostaja stan i callbacki - nie importuja app.ts, wiec nie ma cyklu
const panels = initPanels({ state, markDirty, centerOnPaper });

new InputController(canvas, {
  paint(x, y) {
    state.grid.set(x, y, state.brush);
    // syncWith zbiera i sortuje wszystkie znaki - wolamy tylko gdy pedzel nie ma jeszcze wpisu
    if (!state.legend.get(state.brush)) state.legend.syncWith(state.grid.usedChars());
    markDirty();
    panels.onMutate();
  },
  erase(x, y) {
    state.grid.set(x, y, ' ');
    markDirty();
    panels.onMutate();
  },
  hover(x, y, erasing) {
    const h = renderer.hover;
    if (h && h.x === x && h.y === y && renderer.eraseHover === erasing) return;
    renderer.hover = { x, y };
    renderer.eraseHover = erasing;
    markDirty();
  },
  viewChanged: markDirty,
}, state.view);

canvas.addEventListener('pointerleave', () => {
  if (!renderer.hover) return;
  renderer.hover = null;
  markDirty();
});

window.addEventListener('resize', () => {
  renderer.resize();
  markDirty();
});

// font laduje sie asynchronicznie - po jego gotowosci przerysuj znaki
document.fonts?.ready.then(markDirty).catch(() => {});

function frame(): void {
  if (dirty) {
    dirty = false;
    renderer.draw(state.grid, state.legend, state.view);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
