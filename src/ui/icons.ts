// Ikony Lucide (ISC, https://github.com/lucide-icons/lucide) wklejone jako stale danych sciezek.
// Sciezki pobrane raz w dev-time (lucide-static v1.28.0) - runtime zostaje bez sieci, zadnych
// zaleznosci. Jedna funkcja budujaca (icon) zamiast kopiowania znacznika <svg> w kazdym miejscu UI.
//
// Wybor implementacji: createElementNS + osobne wezly <path>/<circle>/<rect> zamiast innerHTML.
// Dane sa statyczne (bez wejscia od uzytkownika), wiec innerHTML bylby tu bezpieczny, ale budowa
// przez DOM API jest tak samo krotka i nie parsuje zadnego stringa jako znacznika.

export type IconName =
  | 'pencil'
  | 'trash'
  | 'chevron-up'
  | 'chevron-down'
  | 'eye'
  | 'eye-off'
  | 'copy'
  | 'x'
  | 'plus';

/** Pojedynczy wezel potomny <svg> - ten zestaw ikon Lucide korzysta tylko z path/circle/rect. */
interface IconShape {
  tag: 'path' | 'circle' | 'rect';
  attrs: Record<string, string>;
}

function path(d: string): IconShape {
  return { tag: 'path', attrs: { d } };
}

// Kazdy wpis to jeden plik <name>.svg z lucide-static, viewBox 0 0 24 24.
const ICONS: Record<IconName, IconShape[]> = {
  pencil: [
    path('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'),
    path('m15 5 4 4'),
  ],
  trash: [
    path('M10 11v6'),
    path('M14 11v6'),
    path('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'),
    path('M3 6h18'),
    path('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
  ],
  'chevron-up': [path('m18 15-6-6-6 6')],
  'chevron-down': [path('m6 9 6 6 6-6')],
  eye: [
    path('M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'),
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } },
  ],
  'eye-off': [
    path('M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'),
    path('M14.084 14.158a3 3 0 0 1-4.242-4.242'),
    path('M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'),
    path('m2 2 20 20'),
  ],
  copy: [
    { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
    path('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'),
  ],
  x: [
    path('M18 6 6 18'),
    path('m6 6 12 12'),
  ],
  plus: [
    path('M5 12h14'),
    path('M12 5v14'),
  ],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Buduje inline <svg> ikony Lucide: natywny viewBox 24x24, obrys currentColor (dziedziczy kolor
 * tekstu przycisku - biale na czerwonym trashu, czarne na bialym), klasa CSS `icon` skaluje do
 * 14px w styles.css. aria-hidden, bo opis dostepnosci niesie juz przycisk (setIconTitle).
 */
export function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const shape of ICONS[name]) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    for (const [key, value] of Object.entries(shape.attrs)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}
