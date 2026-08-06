// Karta glowna trybu Simplified - wierna replika panelu z ASCII Map Editor v1: rozmiar mapy,
// znak pedzla, cala mapa jako tekst (podglad + import w jednym polu), akcje i przelaczniki widoku.
// Kolejnosc kontrolek jest 1:1 ze screenshotem v1 (Width/Height, Character, Map + SWITCH FORMAT,
// textarea, Clear/Center/Load, To clipboard, szare pudelko checkboxow).
//
// Zero wlasnej logiki formatow ani podmiany poziomu: podglad idzie przez exportLegacyFlat,
// Load przez dokladnie ta sama sciezke co wklejony tekst w modalu Import (migawka historii,
// toasty, odswiezenia), a Clear przez wspolne applyReplace (jak Clear layer w karcie Draw).
import { unionBounds, type Level } from '../../core/level';
import { parseProject } from '../../core/project';
import { LegacyFormat, exportLegacyFlat } from '../../export/legacy';
import { button, checkboxRow, el, labeledStack, numberInput, readNumber } from '../dom';
import { isExtraVisible, isSimplified, setExtraVisible } from '../mode';
import { confirmModal } from '../modal';
import {
  PanelsCtx, applyReplace, copyToClipboard, errorMessage, guarded, recenterView, toast,
} from './context';

// Zakres jak w v1: mapy ponizej 3 komorek nie ma sensu generowac, gorna granica wspolna
// z karta Generate. Domyslne 14x12 to rozmiar startowy oryginalu.
const MIN_SIZE = 3;
const MAX_SIZE = 199;
const DEFAULT_W = 14;
const DEFAULT_H = 12;

/** Cykl formatow podgladu - dokladnie jak przycisk SWITCH FORMAT w v1 (bez listy rozwijanej). */
const FORMATS: readonly LegacyFormat[] = ['text', 'array-text', 'array-array'];
const FORMAT_NAMES: Record<LegacyFormat, string> = {
  'text': 'Text',
  'array-text': 'Array of strings',
  'array-array': 'Array of arrays',
};

export interface MapPanel {
  /** Przepisuje podglad z aktualnego stanu; wolane przez hook renderMap po kazdej zmianie tresci. */
  refresh(): void;
  /** Ustawia pole Character z zewnatrz (klawiatura, chip w karcie Draw) - hook syncBrush. */
  syncBrush(ch: string): void;
  /** Rozmiar z pol Width/Height, przyciety do zakresu - czyta go karta Extra features. */
  size(): { w: number; h: number };
  /** Odznacza checkbox Extra features i chowa tamta karte - wola to X w jej naglowku. */
  hideExtra(): void;
}

export function initMap(
  ctx: PanelsCtx, mapBox: HTMLElement, applyImported: (level: Level) => void,
): MapPanel {
  const { state } = ctx;

  // --- rozmiar mapy (Width / Height obok siebie) ---
  const widthInput = numberInput(DEFAULT_W, 'Width', MIN_SIZE, MAX_SIZE);
  const heightInput = numberInput(DEFAULT_H, 'Height', MIN_SIZE, MAX_SIZE);

  function size(): { w: number; h: number } {
    return { w: readNumber(widthInput, DEFAULT_W), h: readNumber(heightInput, DEFAULT_H) };
  }

  /**
   * Rozmiar pol z obrysu mapy - wolane WYLACZNIE po udanym Load (v1 robil tam detectMapSize).
   * Generatory swiadomie tedy nie ida: dla nich pola sa zamowieniem, a nie odbiciem wyniku
   * (patrz panels/extra.ts). Malowanie tez nie - inaczej pola gonilyby kazde pociagniecie pedzla.
   *
   * Przypisanie do value i zaraz odczyt przez readNumber wyglada okreznie, ale to ten sam
   * (jedyny) kod przycinajacy do zakresu pola - wczytana mapa moze byc wieksza niz MAX_SIZE.
   */
  function syncSize(): void {
    const b = unionBounds(state.level.layers);
    if (!b) return;
    widthInput.value = String(b.maxX - b.minX + 1);
    heightInput.value = String(b.maxY - b.minY + 1);
    size();
  }

  // --- znak pedzla ---
  // Pedzel jest wspolny z karta Draw (state.brush): pole ustawia go przez hook setBrush,
  // a zmiany z zewnatrz (klawisz, chip legendy) wracaja tu przez hook syncBrush.
  const charInput = el('input', 'char-input char-main');
  charInput.type = 'text';
  charInput.maxLength = 1;
  charInput.value = state.brush;
  charInput.setAttribute('aria-label', 'Brush character');
  charInput.addEventListener('input', () => {
    const ch = charInput.value;
    if (!ch || ch === ' ') return;
    ctx.hooks.setBrush(ch[0]!);
  });
  // pole ma maxlength=1, wiec zaznaczamy zawartosc - kolejny znak po prostu ja zastapi
  charInput.addEventListener('focus', () => charInput.select());

  function syncBrush(ch: string): void {
    if (charInput.value !== ch) charInput.value = ch;
  }

  // --- mapa jako tekst ---
  /** Format podgladu jest sesyjny, jak w v1 - zaczynamy od zwyklego tekstu. */
  let format: LegacyFormat = 'text';
  /**
   * Czy w polu siedzi tresc UZYTKOWNIKA (wklejka, wlasne poprawki). Dopoki tak jest, zaden
   * refresh jej nie nadpisze - inaczej klikniecie w mape (albo cofniecie zmiany) kasowaloby
   * wklejke po debounce podgladu. Flaga schodzi na trzy sposoby: jawna akcja (udany Load,
   * SWITCH FORMAT, przepisanie podgladu w write()) oraz sama edycja, ktora nie zostawia
   * w polu nic wlasnego - puste pole albo tresc rowna biezacemu eksportowi (patrz nizej).
   */
  let userEdited = false;

  const text = el('textarea', 'map-text');
  text.setAttribute('aria-label', 'Map contents');
  // Pole puste albo z trescia identyczna z biezacym eksportem NIE jest "wlasna" trescia -
  // bez tego skasowanie wklejki do zera zostawialoby straznik na zawsze wlaczony i podglad
  // juz nigdy by nie odzyl (az do Load albo SWITCH FORMAT).
  text.addEventListener('input', () => {
    userEdited = text.value.trim() !== '' && text.value !== currentExport();
  });

  /**
   * Mapa w biezacym formacie. Blad (zbyt duze bounds) wraca jako tekst i laduje w samym polu,
   * tak jak w podgladzie legacy - odswiezenie leci przy kazdej zmianie mapy, wiec toasty by
   * zalaly ekran. Wynik trzymamy w cache po liczniku tresci i formacie: pyta o niego kazde
   * nacisniecie klawisza w polu (straznik wyzej) i kazdy hook renderMap, a mapa miedzy nimi
   * najczesciej sie nie zmienia.
   */
  let exportCache: { rev: number; format: LegacyFormat; text: string } | null = null;

  function currentExport(): string {
    if (exportCache?.rev !== state.contentRev || exportCache.format !== format) {
      let next: string;
      try {
        next = exportLegacyFlat(state.level, format);
      } catch (e) {
        next = errorMessage(e);
      }
      exportCache = { rev: state.contentRev, format, text: next };
    }
    return exportCache.text;
  }

  /** Przepisanie podgladu ze stanu mapy. */
  function write(): void {
    const next = currentExport();
    // po przepisaniu pole znowu pokazuje sam stan mapy, wiec straznik nie ma juz czego bronic
    userEdited = false;
    // Przypisanie do value przewija pole na sam gorny brzeg TAKZE wtedy, gdy tekst jest ten sam,
    // a samo przewijanie nie daje fokusu, wiec straznik z refresh() nie chroni czytania dlugiego
    // podgladu. Przy okazji odpadaja jalowe przepisania z hookow legendy i warstw.
    if (text.value === next) return;
    text.value = next;
  }

  /**
   * Trzy strazniki przed przepisaniem: w Advanced karta jest ukryta, wiec liczenie eksportu przy
   * kazdym pociagnieciu pedzla byloby czysta strata (powrot do Simplified i tak odswieza karte);
   * wlasnej tresci uzytkownika nie ruszamy (userEdited); pola z fokusem tez nie - wlasnie w nim pisze.
   */
  function refresh(): void {
    if (!isSimplified() || userEdited || document.activeElement === text) return;
    write();
  }

  /** Napis na linku jest staly (jak w v1), wiec biezacy format niesie tooltip. */
  function syncFormatTitle(): void {
    switchLink.title = `Format: ${FORMAT_NAMES[format]} (click to switch)`;
  }

  function cycleFormat(): void {
    format = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length]!;
    syncFormatTitle();
    // jawna akcja uzytkownika - przepisujemy nawet gdy pole ma fokus albo wlasna wklejke (jak v1)
    write();
  }

  const switchLink = button('SWITCH FORMAT', 'link-btn', cycleFormat);
  syncFormatTitle();

  /** Wczytanie tresci pola przez wspolny parser - .json, plain text i obie tablice z v1. */
  function load(): void {
    let level: Level;
    try {
      level = parseProject(text.value);
    } catch (e) {
      // blad zostawia tresc pola i fokus nietkniete, zeby dalo sie ja poprawic
      toast(errorMessage(e), 'error');
      return;
    }
    // Udane wczytanie konczy edycje pola: zdejmujemy fokus i straznik wlasnej tresci, zeby
    // podglad wrocil do pokazywania stanu mapy - takze po pozniejszym undo.
    text.blur();
    userEdited = false;
    applyImported(level);
    syncSize();
  }

  /** Czy na calym poziomie nie ma ANI JEDNEJ komorki - czyszczenie pustej mapy nie ma sensu. */
  function mapIsEmpty(): boolean {
    return state.level.layers.every((l) => l.grid.isEmpty());
  }

  /** Czysci WSZYSTKIE warstwy naraz (v1 nie mial warstw); legenda zostaje, jak przy Clear layer. */
  async function clearAll(): Promise<void> {
    if (mapIsEmpty()) return;
    if (!await confirmModal('Clear the whole map?', 'Clear')) return;
    // stan mogl sie zmienic w trakcie potwierdzania (undo skrotem) - bez tej drugiej kontroli
    // poszedlby do historii wpis, ktory niczego nie zmienia
    if (mapIsEmpty()) return;
    applyReplace(ctx, 'Clear map', () => {
      for (const layer of state.level.layers) layer.grid.clear();
    });
  }

  // --- przelaczniki widoku (szare pudelko) ---
  // Oba sa ustawieniem WIDOKU: samo markDirty, bez historii i bez autozapisu (jak dim w Layers).
  const grid = checkboxRow('Show grid', state.gridVisible, (on) => {
    state.gridVisible = on;
    ctx.markDirty();
  });
  const colors = checkboxRow('Show colors', state.colorsEnabled, (on) => {
    state.colorsEnabled = on;
    ctx.markDirty();
  });
  // Checkbox jest pilotem karty Extra features, ale nie jej pamiecia: stan poczatkowy czytamy
  // z klasy na body, zeby to ona pozostala jedynym zrodlem prawdy (patrz ui/mode.ts)
  const extra = checkboxRow('Extra features', isExtraVisible(), setExtraVisible);

  function hideExtra(): void {
    extra.input.checked = false;
    setExtraVisible(false);
  }

  const sizes = el('div', 'field-row');
  sizes.append(labeledStack('Width:', widthInput), labeledStack('Height:', heightInput));

  const mapHead = el('div', 'row-between');
  mapHead.append(el('span', undefined, 'Map:'), switchLink);

  const actions = el('div', 'btn-row');
  actions.append(
    button('Clear', 'danger', () => void clearAll()),
    button('Center', '', () => recenterView(ctx)),
    button('Load', 'success', load),
  );

  const toggles = el('div', 'help-box check-box');
  toggles.append(grid.row, colors.row, extra.row);

  mapBox.append(
    sizes,
    labeledStack('Character:', charInput),
    mapHead,
    text,
    actions,
    button('To clipboard', 'btn-full', guarded(() => copyToClipboard(text.value))),
    toggles,
  );

  return { refresh, syncBrush, size, hideExtra };
}
