// Plywajacy przycisk centrowania widoku: staly celownik na dole ekranu, w OBU trybach.
// Mieszka poza kartami (jak przelacznik trybu), bo mapa da sie odjechac w bok takze wtedy,
// gdy karta z przyciskiem Center jest ukryta, przewinieta albo przeciagnieta do drugiej kolumny.
import { iconButton } from './dom';
import { icon } from './icons';

/** Jedyny egzemplarz faba - trzymany w module, zeby setCenterFabVisible mogl go przelaczac
 * bez wracania uchwytu do wolajacego (initCenterButton wola sie raz, z panels.ts). */
let fab: HTMLButtonElement | null = null;

/**
 * Doklada przycisk do body. Sam napis zastapila ikona celownika - przy dolnej krawedzi ekranu
 * kwadratowy przycisk zaslania mniej mapy niz etykieta, a opis niesie tooltip (i aria-label,
 * dokladany przez iconButton). Samo wycentrowanie robi wolajacy - to ustawienie WIDOKU
 * (bez historii i bez autozapisu), wspolne z przyciskiem Center w karcie glownej.
 * Fab startuje ukryty - start jest juz wycentrowany (app.ts centruje przed pierwszym malowaniem),
 * a setCenterFabVisible i tak dostanie pierwszy prawdziwy wynik przy najblizszym przerysowaniu.
 */
export function initCenterButton(onCenter: () => void): void {
  fab = iconButton(icon('crosshair'), 'center-fab hidden', 'Center view', onCenter);
  document.body.append(fab);
}

/**
 * Przelacza widocznosc faba. JEDYNE miejsce, ktore o niej decyduje, jest app.ts: po kazdym
 * przerysowaniu porownuje biezacy pan z docelowym (centeredPan w renderer.ts, prog ~2px) i
 * wola to stad - zoom, pan, resize, przelaczenie trybu i klik samego faba juz i tak koncza sie
 * markDirty, wiec ta jedna sciezka pokrywa wszystkie zrodla zmiany widoku bez osobnych hakow.
 */
export function setCenterFabVisible(visible: boolean): void {
  fab?.classList.toggle('hidden', !visible);
}
