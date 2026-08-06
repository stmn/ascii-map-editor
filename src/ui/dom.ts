// Male helpery DOM wspoldzielone przez panele i modale - jedno miejsce zamiast kopii w kazdym module.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Wspolny szkielet przycisku: <button type="button"> z trescia (tekst albo wezel, np. ikona SVG) i klikiem. */
function baseButton(content: string | Node, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.append(content);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Zwykly przycisk. Tresc bywa wezlem, a nie samym tekstem - przyciski wyboru trybu maja
 * tytul i opis w dwoch liniach, wiec dostaja gotowy fragment zamiast stringa.
 */
export function button(label: string | Node, className: string, onClick: () => void): HTMLButtonElement {
  return baseButton(label, className, onClick);
}

/** Opis przycisku-ikony: tooltip i etykieta dla czytnika ekranu zawsze ida razem. */
export function setIconTitle(b: HTMLButtonElement, title: string): void {
  b.title = title;
  b.setAttribute('aria-label', title);
}

/**
 * Kwadratowy przycisk-ikona w wierszu listy (warstwy, poziomy, legenda): tresc w srodku to albo
 * ikona SVG z icons.ts, albo pojedynczy znak - string zostaje dla chipow legendy/pedzla, ktore
 * maja pozostac widocznymi znakami, nie ikonami. Pelny opis idzie zawsze w tooltip i aria-label.
 */
export function iconButton(
  glyph: SVGElement | string, className: string, title: string, onClick: () => void,
): HTMLButtonElement {
  const b = baseButton(glyph, className, onClick);
  setIconTitle(b, title);
  return b;
}

export function labeled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', 'field');
  l.append(el('span', undefined, text), control);
  return l;
}

/** Wariant labeled: etykieta NAD kontrolka (stack pionowy, kontrolka na pelnej szerokosci) - pola W/H w Generate. */
export function labeledStack(text: string, control: HTMLElement): HTMLLabelElement {
  const l = labeled(text, control);
  l.classList.add('field-stack');
  return l;
}

/**
 * Wiersz przelacznika: checkbox i podpis w jednej etykiecie, wiec klik w tekst tez przelacza.
 * Wspolny dla "Dim other layers" w karcie Layers i pudelka przelacznikow w karcie glownej.
 * Zwraca tez samo pole - checkbox bywa sterowany z zewnatrz (X na karcie Extra features).
 */
export function checkboxRow(
  text: string, checked: boolean, onChange: (on: boolean) => void,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', text);
  input.addEventListener('change', () => onChange(input.checked));
  const row = el('label', 'field');
  row.append(input, el('span', undefined, text));
  return { row, input };
}

/**
 * Pole liczbowe z twardym zakresem - rozmiar mapy w karcie Generate i w karcie glownej
 * (Simplified) oraz bok pokoju w karcie Extra features. Zakres siedzi w atrybutach min/max,
 * wiec readNumber odczytuje go z samego pola i nie trzeba nigdzie powtarzac granic.
 */
export function numberInput(value: number, label: string, min: number, max: number): HTMLInputElement {
  const input = el('input', 'size-input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.setAttribute('aria-label', label);
  return input;
}

/**
 * Odczyt pola numberInput przyciety do jego zakresu; smiec (puste pole, tekst) wraca do fallbacku.
 * Wartosc wraca tez do samego pola, zeby uzytkownik od razu widzial, z czym naprawde policzylismy.
 */
export function readNumber(input: HTMLInputElement, fallback: number): number {
  const min = Number(input.min), max = Number(input.max);
  const raw = Math.round(Number(input.value));
  const value = Number.isFinite(raw) && raw > 0 ? Math.max(min, Math.min(max, raw)) : fallback;
  input.value = String(value);
  return value;
}

/**
 * Ciemny kolor tla wg WCAG relative luminance (prog 0.5) -> tekst na nim powinien byc bialy,
 * jasny kolor -> czarny. Uzywane przez legend.ts do koloru licznika uzyc na swatchu koloru.
 */
export function isDarkColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const channel = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance < 0.5;
}
