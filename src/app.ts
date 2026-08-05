import './styles.css';
import { createLevel, levelUsedChars } from './core/level';
import { parseProject } from './core/project';
import { Renderer, centerView, paperRect } from './ui/renderer';
import { InputController } from './ui/input';
import { activeGrid, bumpContent, trimLayers, type EditorState } from './core/editorState';
// panele nie importuja app.ts - stan i callbacki dostaja przez initPanels, wiec nie ma cyklu
import { STORAGE_KEY, initPanels } from './ui/panels';

/** Przesuniecie startowego widoku w lewo, bo prawa krawedz zajmuje panel (jak +140 w v1). */
const SIDEBAR_OFFSET = 140;

export type { EditorState };

export const state: EditorState = {
  level: createLevel(),
  activeLayer: 0,
  view: { panX: 0, panY: 0, scale: 32 },
  brush: '#',
  contentRev: 0,
};

const canvas = document.getElementById('map') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let dirty = true;
/** Zamawia przerysowanie w najblizszej klatce - rysujemy tylko po zmianach. */
export function markDirty(): void { dirty = true; }

function centerOnPaper(): void {
  centerView(state.view, paperRect(state.level), canvas.clientWidth, canvas.clientHeight, SIDEBAR_OFFSET);
}

/**
 * Odtworzenie autozapisu. Czytamy tylko wpisy wygladajace na nasz projekt (JSON z app === ...),
 * zeby obcy albo uszkodzony wpis pod tym kluczem nie wywracal startu edytora.
 */
function restoreSaved(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return; // storage zablokowany (tryb prywatny) - autozapis jest opcjonalny
  }
  if (!saved || !saved.startsWith('{')) return;
  try {
    const data = JSON.parse(saved) as { app?: unknown };
    if (data?.app !== 'ascii-level-editor') return;
    state.level = parseProject(saved);
    state.activeLayer = 0;
    // wpis moze byc podmieniony recznie - limit warstw obowiazuje tak samo jak przy imporcie
    trimLayers(state.level);
    state.level.legend.syncWith(levelUsedChars(state.level));
    bumpContent(state);
  } catch {
    // uszkodzony zapis - startujemy od pustego poziomu
  }
}

renderer.resize();
restoreSaved();
centerOnPaper();

// panele dostaja stan i callbacki - nie importuja app.ts, wiec nie ma cyklu
const panels = initPanels({ state, markDirty, centerOnPaper });

new InputController(canvas, {
  paint(x, y) {
    activeGrid(state).set(x, y, state.brush);
    // syncWith zbiera i sortuje wszystkie znaki - wolamy tylko gdy pedzel nie ma jeszcze wpisu
    if (!state.level.legend.get(state.brush)) state.level.legend.syncWith(levelUsedChars(state.level));
    bumpContent(state);
    markDirty();
    panels.onMutate();
  },
  erase(x, y) {
    activeGrid(state).set(x, y, ' ');
    bumpContent(state);
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
    renderer.draw(state.level, state.view, state.contentRev);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
