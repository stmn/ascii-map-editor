// Plywajacy przycisk centrowania widoku: staly celownik na dole ekranu, w OBU trybach.
// Mieszka poza kartami (jak przelacznik trybu), bo mapa da sie odjechac w bok takze wtedy,
// gdy karta z przyciskiem Center jest ukryta, przewinieta albo przeciagnieta do drugiej kolumny.
import { iconButton } from './dom';
import { icon } from './icons';

/**
 * Doklada przycisk do body. Sam napis zastapila ikona celownika - przy dolnej krawedzi ekranu
 * kwadratowy przycisk zaslania mniej mapy niz etykieta, a opis niesie tooltip (i aria-label,
 * dokladany przez iconButton). Samo wycentrowanie robi wolajacy - to ustawienie WIDOKU
 * (bez historii i bez autozapisu), wspolne z przyciskiem Center w karcie glownej.
 */
export function initCenterButton(onCenter: () => void): void {
  document.body.append(iconButton(icon('crosshair'), 'center-fab', 'Center view', onCenter));
}
