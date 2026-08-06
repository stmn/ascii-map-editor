import { footprintBounds } from '../core/editorState';
import { type Bounds } from '../core/grid';
import { Level, flattenWithSource, unionBounds } from '../core/level';
// mode.ts nie importuje renderera (siega tylko po dom/layout/modal), wiec nie ma tu cyklu
import { isSimplified } from './mode';

export interface View { panX: number; panY: number; scale: number }

/**
 * To, co renderer czyta ze stanu edytora. EditorState spelnia ten ksztalt strukturalnie,
 * wiec app.ts podaje po prostu swoj state - kolejne pola do rysowania nie zmieniaja sygnatury
 * draw() (a renderer nie importuje typu EditorState, wiec nie ma zapetlenia modulow).
 */
export interface DrawState {
  level: Level;
  view: View;
  contentRev: number;
  /** Bok stopki pedzla - podswietlenie kursora pokrywa dokladnie malowany obszar. */
  brushSize: number;
  /** Indeks aktywnej warstwy - decyduje, ktore komorki rysujemy pelna alfa gdy dimOthers wlaczone. */
  activeLayer: number;
  /** Czy przyciemniac na canvasie komorki spoza aktywnej warstwy (patrz DIM_ALPHA). */
  dimOthers: boolean;
  /** Czy rysowac linie siatki - papier i jego obrys zostaja niezaleznie od tego. */
  gridVisible: boolean;
  /** Czy brac kolory z legendy; false = jednolity atrament. */
  colorsEnabled: boolean;
}

/** Domyslny "papier" 24x16 pokazywany gdy mapa jest pusta. */
export const DEFAULT_PAPER: Bounds = { minX: 0, minY: 0, maxX: 23, maxY: 15 };

// Paleta v1 (patrz style-guide.md) - kremowy papier na brazowym biurku.
// COLOR_PAPER i COLOR_INK_FALLBACK sa eksportowane, bo miniatury (thumb.ts) maja
// wygladac jak zmniejszony canvas - jedno zrodlo kolorow zamiast kopii literalow.
const COLOR_DESK = '#665A4F';
export const COLOR_PAPER = '#F0EAD2';
const COLOR_OUTLINE = '#000000';
const COLOR_GRID = '#ADC178';
export const COLOR_INK_FALLBACK = '#1a1c2c';
const COLOR_HOVER = 'rgba(173,193,120,0.5)';
const COLOR_HOVER_ERASE = 'rgba(250,50,50,0.5)';
const OUTLINE_WIDTH = 4;
/** Ponizej tego scale rysujemy fallbackiem monospace - Press Start 2P jest nieczytelny. */
const SMALL_SCALE = 12;
/**
 * Alfa komorek spoza aktywnej warstwy gdy dimOthers wlaczone. Stala wartosc (bez gradacji
 * po glebokosci warstwy) - decyzja ownera/kontrolera, patrz task-4 brief.
 */
const DIM_ALPHA = 0.5;

/**
 * Prostokat papieru: bounds wszystkich warstw powiekszone o 1 komorke marginesu
 * z kazdej strony, a dla pustego poziomu domyslny prostokat 24x16.
 */
export function paperRect(level: Level): Bounds {
  const b = unionBounds(level.layers);
  if (!b) return { ...DEFAULT_PAPER };
  return { minX: b.minX - 1, minY: b.minY - 1, maxX: b.maxX + 1, maxY: b.maxY + 1 };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  hover: { x: number; y: number } | null = null;
  /** Gdy true, podswietlenie kursora jest czerwone (tryb gumki). */
  eraseHover = false;
  /**
   * Splaszczenie warstw (z indeksem warstwy zrodlowej kazdej komorki) z ostatniego rysowania.
   * Klatki po panie/zoomie i po ruchu kursora trafiaja tu w cache - przeliczamy dopiero gdy
   * contentRev (licznik mutacji tresci) sie zmieni.
   *
   * Decyzja o cache'u dla przyciemniania (Task 4): activeLayer i dimOthers CELOWO nie wchodza
   * do klucza cache'u. Ten sam splaszczony wynik sluzy i sciezce z dim, i bez - o alfie kazdej
   * komorki decydujemy dopiero w draw() przy kazdym rysowaniu, czytajac biezacy state.activeLayer
   * i state.dimOthers. Draw() i tak leci co klatke po markDirty (patrz app.ts frame()), a zmiana
   * aktywnej warstwy juz dzis wola tylko markDirty bez bumpContent (przelaczanie warstwy nie
   * rusza tresci mapy) - dzieki temu, ze alfa nigdy nie jest zapamietana w cachu, kolejne
   * przerysowanie automatycznie odswieza przyciemnienie bez potrzeby poszerzania klucza cache'u
   * ani osobnej sciezki dla dim/bez dim.
   */
  private cachedFlat: { rev: number; flat: Map<string, { ch: string; layerIndex: number }> } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  private flatten(level: Level, contentRev: number): Map<string, { ch: string; layerIndex: number }> {
    if (this.cachedFlat?.rev !== contentRev) {
      this.cachedFlat = { rev: contentRev, flat: flattenWithSource(level.layers) };
    }
    return this.cachedFlat.flat;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(state: DrawState): void {
    const { level, view } = state;
    const { ctx } = this;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.fillStyle = COLOR_DESK;
    ctx.fillRect(0, 0, w, h);

    const s = view.scale;
    // widoczny zakres komorek - wszystko poza nim pomijamy przy rysowaniu
    const x0 = Math.floor(view.panX / s) - 1, y0 = Math.floor(view.panY / s) - 1;
    const x1 = x0 + Math.ceil(w / s) + 2, y1 = y0 + Math.ceil(h / s) + 2;

    // papier
    const paper = paperRect(level);
    const px = paper.minX * s - view.panX;
    const py = paper.minY * s - view.panY;
    const pw = (paper.maxX - paper.minX + 1) * s;
    const ph = (paper.maxY - paper.minY + 1) * s;
    ctx.fillStyle = COLOR_PAPER;
    ctx.fillRect(px, py, pw, ph);

    // siatka - tylko wewnatrz papieru, linie na granicach komorek.
    // Checkbox "Show grid" zdejmuje same linie: papier i jego obrys zostaja, tak jak w v1.
    if (state.gridVisible) {
      const lw = s >= SMALL_SCALE ? 2 : 1;
      const off = lw % 2 === 0 ? 0 : 0.5;
      ctx.strokeStyle = COLOR_GRID;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let x = Math.max(paper.minX + 1, x0); x <= Math.min(paper.maxX, x1); x++) {
        const sx = Math.round(x * s - view.panX) + off;
        ctx.moveTo(sx, py); ctx.lineTo(sx, py + ph);
      }
      for (let y = Math.max(paper.minY + 1, y0); y <= Math.min(paper.maxY, y1); y++) {
        const sy = Math.round(y * s - view.panY) + off;
        ctx.moveTo(px, sy); ctx.lineTo(px + pw, sy);
      }
      ctx.stroke();
    }

    // gruby czarny obrys papieru - rysowany na zewnatrz krawedzi (jak border-4 w v1)
    ctx.strokeStyle = COLOR_OUTLINE;
    ctx.lineWidth = OUTLINE_WIDTH;
    ctx.strokeRect(px - OUTLINE_WIDTH / 2, py - OUTLINE_WIDTH / 2, pw + OUTLINE_WIDTH, ph + OUTLINE_WIDTH);

    // znaki - widoczne warstwy splaszczone do jednej mapy, gorne nadpisuja dolne (kazda komorka
    // niesie tez indeks warstwy zrodlowej - patrz komentarz przy cachedFlat)
    const flat = this.flatten(level, state.contentRev);
    // przyciemniamy tylko gdy user wlaczyl to w karcie Layers I jest co odroznic (>1 widoczna warstwa) -
    // przy jednej widocznej warstwie przyciemnianie nie mialoby czego pokazac.
    // W Simplified nie ma karty Layers ani pojecia warstwy aktywnej, wiec przyciemnienie czesci
    // mapy bez zadnego wytlumaczenia w UI wygladaloby na blad renderowania - stad wyjatek trybu
    // (samo state.dimOthers zostaje nietkniete, powrot do Advanced wraca do ustawienia usera).
    const visibleLayers = level.layers.filter((l) => l.visible).length;
    const dimming = state.dimOthers && visibleLayers > 1 && !isSimplified();
    const fontPx = Math.max(6, Math.round(s * 0.6));
    ctx.font = s >= SMALL_SCALE
      ? `${fontPx}px "Press Start 2P", monospace`
      : `${fontPx}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, { ch, layerIndex }] of flat) {
      const [x, y] = key.split(',').map(Number);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      // wylaczone kolory: wszystko jednym atramentem, bez zagladania do legendy
      ctx.fillStyle = state.colorsEnabled
        ? level.legend.get(ch)?.color ?? COLOR_INK_FALLBACK
        : COLOR_INK_FALLBACK;
      ctx.globalAlpha = dimming && layerIndex !== state.activeLayer ? DIM_ALPHA : 1;
      ctx.fillText(ch, x * s - view.panX + s / 2, y * s - view.panY + s / 2);
      ctx.globalAlpha = 1;
    }

    // podswietlenie stopki pedzla pod kursorem - jeden prostokat zamiast n x n wypelnien
    if (this.hover) {
      const f = footprintBounds(this.hover.x, this.hover.y, state.brushSize);
      ctx.fillStyle = this.eraseHover ? COLOR_HOVER_ERASE : COLOR_HOVER;
      ctx.fillRect(
        f.minX * s - view.panX, f.minY * s - view.panY,
        (f.maxX - f.minX + 1) * s, (f.maxY - f.minY + 1) * s,
      );
    }
  }
}

/**
 * Ustawia pan tak, by prostokat byl wysrodkowany w oknie.
 * offsetX przesuwa mape w lewo - robi miejsce na panel boczny (v1 uzywal +140).
 */
export function centerView(view: View, rect: Bounds, w: number, h: number, offsetX = 0): void {
  const cx = (rect.minX + (rect.maxX - rect.minX + 1) / 2) * view.scale;
  const cy = (rect.minY + (rect.maxY - rect.minY + 1) / 2) * view.scale;
  view.panX = cx - (w / 2 - offsetX);
  view.panY = cy - h / 2;
}

export function screenToCell(px: number, py: number, view: View): { x: number; y: number } {
  return { x: Math.floor((px + view.panX) / view.scale), y: Math.floor((py + view.panY) / view.scale) };
}
