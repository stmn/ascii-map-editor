// Male helpery DOM wspoldzielone przez panele i modale - jedno miejsce zamiast kopii w kazdym module.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Opis przycisku-ikony: tooltip i etykieta dla czytnika ekranu zawsze ida razem. */
export function setIconTitle(b: HTMLButtonElement, title: string): void {
  b.title = title;
  b.setAttribute('aria-label', title);
}

/**
 * Kwadratowy przycisk-ikona w wierszu listy (warstwy, poziomy): sam znak w srodku,
 * a pelny opis w tooltipie i dla czytnika ekranu.
 */
export function iconButton(
  label: string, className: string, title: string, onClick: () => void,
): HTMLButtonElement {
  const b = button(label, className, onClick);
  setIconTitle(b, title);
  return b;
}

export function labeled(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label', 'field');
  l.append(el('span', undefined, text), control);
  return l;
}
