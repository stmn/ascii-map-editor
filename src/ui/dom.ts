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

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
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
