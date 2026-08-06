// Plywajacy przycisk Center: staly punkt "wroc do mapy" na dole ekranu, w OBU trybach.
// Mieszka poza kartami (jak przelacznik trybu), bo mapa da sie odjechac w bok takze wtedy,
// gdy karta z przyciskiem Center jest ukryta, przewinieta albo przeciagnieta do drugiej kolumny.
import { button } from './dom';

/**
 * Doklada przycisk do body. Samo wycentrowanie robi wolajacy - to ustawienie WIDOKU
 * (bez historii i bez autozapisu), wspolne z przyciskiem Center w karcie glownej.
 */
export function initCenterButton(onCenter: () => void): void {
  const btn = button('Center', 'center-fab', onCenter);
  btn.title = 'Center the view on the map';
  document.body.append(btn);
}
