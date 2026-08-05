// Stan edytora: typ wspolny dla app.ts i paneli plus helpery indeksujace warstwy.
// Modul nie dotyka DOM - trzyma wylacznie model i jego bezpieczne odczyty.
import { Grid } from './grid';
import { Layer, Level, MAX_LAYERS, levelUsedChars } from './level';
// import TYPU (nie wartosci) - View mieszka przy rendererze, wiec runtime nie dostaje tu zadnej zaleznosci
import type { View } from '../ui/renderer';

/** Stan edytora widziany przez panele - app.ts przekazuje swoj obiekt state. */
export interface EditorState {
  level: Level;
  activeLayer: number;
  view: View;
  brush: string;
  /**
   * Licznik zmian TRESCI mapy. Renderer trzyma po nim cache splaszczenia warstw,
   * wiec pan i zoom (ktore tresci nie ruszaja) cache'u nie kasuja.
   */
  contentRev: number;
}

/**
 * Podbicie licznika tresci - wola KAZDA mutacja zmieniajaca to, co widac na canvasie
 * (malowanie, gumka, czyszczenie, generator, import, dodanie/usuniecie/przesuniecie/ukrycie warstwy).
 * Zmiany czysto UI (nazwa warstwy, aktywna warstwa, kolor legendy) go nie ruszaja.
 */
export function bumpContent(state: EditorState): void {
  state.contentRev++;
}

/**
 * Indeks aktywnej warstwy przyciety do zakresu. Siatka bezpieczenstwa: usuniecie warstwy
 * albo import krotszego poziomu nie moze zostawic wiszacego indeksu i wywrocic malowania.
 */
export function clampedActive(state: EditorState): number {
  return Math.max(0, Math.min(state.activeLayer, state.level.layers.length - 1));
}

/** Warstwa wskazana przez activeLayer - jedyne miejsce indeksujace level.layers. */
export function activeLayerOf(state: EditorState): Layer {
  const { layers } = state.level;
  return layers[clampedActive(state)] ?? layers[0]!;
}

/** Siatka aktywnej warstwy - tu trafia malowanie i stad czytaja panele. */
export function activeGrid(state: EditorState): Grid {
  return activeLayerOf(state).grid;
}

/** Import (i obcy autozapis) moze przyniesc wiecej warstw niz obslugujemy - zostawiamy najnizsze MAX_LAYERS. */
export function trimLayers(level: Level): boolean {
  if (level.layers.length <= MAX_LAYERS) return false;
  level.layers = level.layers.slice(0, MAX_LAYERS);
  return true;
}

/**
 * Wstawienie wczytanego poziomu do stanu - JEDYNA implementacja podmiany level.
 * Uzywa jej boot (app.ts), import pliku i przelaczanie poziomow w panelu projektow; poziom moze
 * pochodzic z obcego pliku albo recznie podmienionego rekordu, wiec limit warstw i synchronizacja
 * legendy obowiazuja zawsze tak samo. Zwraca true gdy warstwy zostaly przyciete do MAX_LAYERS.
 */
export function applyLevelToState(state: EditorState, level: Level): boolean {
  state.level = level;
  state.activeLayer = 0;
  const trimmed = trimLayers(level);
  level.legend.syncWith(levelUsedChars(level));
  bumpContent(state);
  return trimmed;
}
