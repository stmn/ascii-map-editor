// Fabryki komend historii: czysta warstwa modelu, bez DOM. Kazda komenda czyta state.level
// dopiero w chwili wykonania - undo migawki potrafi podmienic caly poziom pod spodem, wiec
// trzymanie referencji do warstwy czy legendy z chwili tworzenia komendy byloby pulapka.
import { clampedActive, type EditorState } from './editorState';
import type { Command } from './history';
import { levelUsedChars, type Layer, type Level } from './level';
import { parseProject, serializeProject } from './project';
import { remapChar } from './remap';

/** Jedna zmieniona komorka pociagniecia; warstwa po id, bo tablica warstw moze sie przestawic. */
export interface CellChange { layerId: string; x: number; y: number; before: string; after: string }

/**
 * Pociagniecie pedzla (albo gumki) jako jedna komenda - caly gest cofa sie za jednym razem.
 * Undo idzie od konca listy, redo od poczatku: kolejnosc ma znaczenie tylko gdy ta sama
 * komorka wpadla na liste wielokrotnie, a temu i tak zapobiega deduplikacja po stronie app.ts.
 */
export function strokeCommand(state: EditorState, cells: CellChange[]): Command {
  // kopia listy: wolajacy zbiera ja w trakcie gestu i zaraz czysci pod nastepny
  const list = [...cells];

  function apply(order: CellChange[], key: 'before' | 'after'): void {
    const grids = new Map(state.level.layers.map((l) => [l.id, l.grid]));
    // warstwy juz nie ma (poziom podmieniony) - jej komorki po cichu pomijamy
    for (const c of order) grids.get(c.layerId)?.set(c.x, c.y, c[key]);
  }

  return {
    label: 'Paint',
    undo: () => apply([...list].reverse(), 'before'),
    redo: () => apply(list, 'after'),
  };
}

/**
 * Migawka calego poziomu: JSON projektu plus id warstw. Id nie mieszcza sie w formacie pliku,
 * a parseProject rozdaje nowe - bez ich przywrocenia starsze komendy pociagniec (adresuja
 * warstwy po id) po cofnieciu migawki trafialyby w pustke.
 */
export interface LevelSnapshot { json: string; layerIds: string[] }

export function snapshotLevel(level: Level): LevelSnapshot {
  return { json: serializeProject(level), layerIds: level.layers.map((l) => l.id) };
}

/**
 * Podmiana calego poziomu (generator, czyszczenie warstwy, import) - migawka przed i po.
 * Wstawienie stanu robi callback wolajacego (applyLevelToPanels), bo dokleja centrowanie
 * widoku i odswiezenie kart.
 */
export function replaceCommand(
  label: string, before: LevelSnapshot, after: LevelSnapshot, apply: (level: Level) => void,
): Command {
  function restore(snap: LevelSnapshot): void {
    const { level } = parseProject(snap.json);
    level.layers.forEach((l, i) => {
      const id = snap.layerIds[i];
      if (id) l.id = id;
    });
    apply(level);
  }
  return { label, undo: () => restore(before), redo: () => restore(after) };
}

// --- operacje na warstwach ------------------------------------------------------

/** Po cofnieciu operacji na warstwach aktywna zostaje warstwa, ktorej dotyczyla (z przycieciem). */
function focusLayer(state: EditorState, index: number): void {
  state.activeLayer = index;
  state.activeLayer = clampedActive(state);
}

function findLayer(state: EditorState, layerId: string): Layer | null {
  return state.level.layers.find((l) => l.id === layerId) ?? null;
}

/** Wstawienie i usuniecie tej samej warstwy - add i remove roznia sie tylko kierunkiem. */
function addRemovePair(state: EditorState, index: number, layer: Layer): { add(): void; remove(): void } {
  return {
    add(): void {
      const { layers } = state.level;
      const at = Math.max(0, Math.min(index, layers.length));
      layers.splice(at, 0, layer);
      focusLayer(state, at);
    },
    remove(): void {
      const { layers } = state.level;
      const at = layers.findIndex((l) => l.id === layer.id);
      if (at < 0) return;
      layers.splice(at, 1);
      focusLayer(state, at);
    },
  };
}

export function layerAddCommand(state: EditorState, index: number, layer: Layer): Command {
  const pair = addRemovePair(state, index, layer);
  return { label: 'Add layer', undo: pair.remove, redo: pair.add };
}

export function layerRemoveCommand(state: EditorState, index: number, layer: Layer): Command {
  const pair = addRemovePair(state, index, layer);
  return { label: 'Delete layer', undo: pair.add, redo: pair.remove };
}

function moveLayer(state: EditorState, from: number, to: number): void {
  const { layers } = state.level;
  if (from < 0 || from >= layers.length || to < 0 || to >= layers.length) return;
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved!);
  focusLayer(state, to);
}

export function layerMoveCommand(state: EditorState, from: number, to: number): Command {
  return { label: 'Move layer', undo: () => moveLayer(state, to, from), redo: () => moveLayer(state, from, to) };
}

/** Widocznosc przelacza sie tak samo w obie strony - jedna funkcja starcza za undo i redo. */
export function layerVisibilityCommand(state: EditorState, layerId: string): Command {
  function toggle(): void {
    const layer = findLayer(state, layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    focusLayer(state, state.level.layers.indexOf(layer));
  }
  return { label: 'Toggle layer', undo: toggle, redo: toggle };
}

export function layerRenameCommand(
  state: EditorState, layerId: string, before: string, after: string,
): Command {
  function setName(name: string): void {
    const layer = findLayer(state, layerId);
    if (!layer) return;
    layer.name = name;
    focusLayer(state, state.level.layers.indexOf(layer));
  }
  return { label: 'Rename layer', undo: () => setName(before), redo: () => setName(after) };
}

// --- legenda --------------------------------------------------------------------

/** Zmiana nazwy albo koloru wpisu legendy; znak wpisu zmienia dopiero remapCommand. */
export function legendEditCommand(
  state: EditorState, ch: string, field: 'name' | 'color', before: string, after: string,
): Command {
  function set(value: string): void {
    state.level.legend.upsert(ch, field === 'name' ? { name: value } : { color: value });
  }
  return {
    label: field === 'name' ? 'Rename legend entry' : 'Change color',
    undo: () => set(before),
    redo: () => set(after),
  };
}

/**
 * Wpis legendy bez ANI JEDNEJ komorki na mapie to pusta skorupa - kasujemy go przed remapem.
 * Scenariusz: remap '#'->'W', potem pedzel '#' (syncWith odtwarza wpis '#'), potem cofniecie
 * tego pociagniecia (komorki znikaja, wpis zostaje z licznikiem 0). Bez tego sprzatania
 * cofniecie remapu odbijaloby sie od 'Character already in use' o wlasnego ducha.
 * Znak faktycznie uzyty na mapie zostaje nietkniety - to prawdziwa kolizja i ma rzucic.
 */
function pruneUnusedEntry(level: Level, ch: string): void {
  if (!level.legend.get(ch)) return;
  if (levelUsedChars(level).includes(ch)) return;
  level.legend.remove(ch);
}

/**
 * Zmiana znaku wpisu legendy. Inwersja jest symetryczna (remap w druga strone) i moze rzucic
 * 'Character already in use', gdy docelowy znak zdazyl wrocic na mape - wolajacy lapie to wyzej.
 */
export function remapCommand(state: EditorState, from: string, to: string): Command {
  function run(a: string, b: string): void {
    pruneUnusedEntry(state.level, b);
    remapChar(state.level, a, b);
  }
  return {
    label: 'Change character',
    undo: () => run(to, from),
    redo: () => run(from, to),
  };
}
