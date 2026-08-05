// Karta Map (tryb Simplified): cala mapa jako tekst - podglad, wczytanie i kopiowanie.
// Odtwarza UX starej wersji, gdzie jedno pole bylo naraz eksportem i wejsciem importu.
// Zero wlasnej logiki formatow: podglad idzie przez exportLegacyFlat, a Load przez dokladnie
// ta sama sciezke co wklejony tekst w modalu Import (migawka historii, toasty, odswiezenia).
import type { Level } from '../../core/level';
import { parseProject } from '../../core/project';
import { LegacyFormat, exportLegacyFlat } from '../../export/legacy';
import { button, el, labeled } from '../dom';
import { isSimplified } from '../mode';
import { PanelsCtx, copyToClipboard, errorMessage, guarded, toast } from './context';

export interface MapPanel {
  /** Przepisuje podglad z aktualnego stanu; wolane przez hook renderMap po kazdej zmianie tresci. */
  refresh(): void;
}

export function initMap(
  ctx: PanelsCtx, mapBox: HTMLElement, applyImported: (level: Level) => void,
): MapPanel {
  const { state } = ctx;

  // wszystkie trzy formaty v1 - karta Map jest jedynym miejscem, gdzie zostal 'text'
  // (w modalu Export pokrywalby sie z Copy TXT). Pierwsza opcja = default.
  const formatSelect = el('select', 'scope-select');
  for (const [value, label] of [
    ['text', 'Text'], ['array-text', 'Array of strings'], ['array-array', 'Array of arrays'],
  ] as const) {
    const option = el('option', undefined, label);
    option.value = value;
    formatSelect.append(option);
  }
  formatSelect.setAttribute('aria-label', 'Map format');

  const text = el('textarea', 'map-text');
  text.setAttribute('aria-label', 'Map contents');

  /**
   * Przepisanie podgladu ze stanu. Blad (zbyt duze bounds) ladu je w samym polu, tak jak
   * w podgladzie legacy - odswiezenie leci przy kazdej zmianie mapy, wiec toasty by zalaly ekran.
   */
  function write(): void {
    let next: string;
    try {
      next = exportLegacyFlat(state.level, formatSelect.value as LegacyFormat);
    } catch (e) {
      next = errorMessage(e);
    }
    // Przypisanie do value przewija pole na sam gorny brzeg TAKZE wtedy, gdy tekst jest ten sam,
    // a samo przewijanie nie daje fokusu, wiec straznik z refresh() nie chroni czytania dlugiego
    // podgladu. Przy okazji odpadaja jalowe przepisania z hookow legendy i warstw.
    if (text.value === next) return;
    text.value = next;
  }

  /**
   * Dwa strazniki przed przepisaniem: w Advanced karta jest ukryta, wiec liczenie eksportu przy
   * kazdym pociagnieciu pedzla byloby czysta strata (powrot do Simplified i tak odswieza karte),
   * a pola z fokusem nie ruszamy - uzytkownik wlasnie wkleja albo pisze wlasna mape.
   */
  function refresh(): void {
    if (!isSimplified() || document.activeElement === text) return;
    write();
  }

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
    // Udane wczytanie konczy edycje pola, wiec zdejmujemy z niego fokus. Bez tego straznik
    // w refresh() blokowalby kazde pozniejsze odswiezenie (klikniecie przycisku nie wszedzie
    // przenosi fokus) i podglad zostalby na tekscie uzytkownika - takze po undo.
    text.blur();
    applyImported(level);
  }

  // zmiana formatu to jawna akcja uzytkownika - przepisujemy nawet gdy pole ma fokus
  formatSelect.addEventListener('change', write);

  const actions = el('div', 'btn-row');
  actions.append(
    button('Load', 'success', load),
    button('Copy', '', guarded(() => copyToClipboard(text.value))),
  );

  mapBox.append(
    labeled('Format', formatSelect),
    text,
    actions,
    el('p', 'hint hint-small', 'Load replaces the whole map. Undo brings it back.'),
  );

  return { refresh };
}
