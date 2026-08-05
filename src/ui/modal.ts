// Modale edytora: pol-przezroczysty overlay + biala karta w stylu kart sekcji (v1).
// Modul nie zna stanu edytora - dostaje gotowe body i sam pilnuje zamykania (X, Esc, klik w overlay).
import { button, el } from './dom';

export interface ModalHandle {
  close(): void;
}

/** Stos otwartych modali - Esc zamyka tylko wierzchni (confirm potrafi stac nad modalem glownym). */
const stack: ModalHandle[] = [];
/** Jeden modal glowny na raz - otwarcie kolejnego zamyka poprzedni. */
let mainModal: ModalHandle | null = null;

/** Czy cokolwiek jest otwarte - skroty globalne (np. zmiana pedzla) maja wtedy milczec. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}

// faza capture: Esc obsluzony przez modal nie moze wyciec do skrotow globalnych
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1]!.close();
}, true);

/** Autofocus pierwszej widocznej kontrolki - bez tego Tab startowalby od poczatku dokumentu. */
function focusFirst(card: HTMLElement): void {
  const selector = '.modal-body select, .modal-body textarea, .modal-body input, .modal-body button';
  for (const node of card.querySelectorAll<HTMLElement>(`${selector}:not(:disabled)`)) {
    if (node.offsetParent === null) continue; // ukryty, np. file input schowany pod etykieta
    node.focus();
    return;
  }
}

/** Wspolny szkielet obu rodzajow modali; onClose odpala sie raz, niezaleznie od drogi zamkniecia. */
function mount(card: HTMLElement, overlayClass: string, onClose: () => void): ModalHandle {
  const overlay = el('div', overlayClass);
  overlay.append(card);
  let closed = false;
  const handle: ModalHandle = {
    close(): void {
      if (closed) return;
      closed = true;
      overlay.remove();
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      onClose();
    },
  };
  // klik w tlo zamyka, klik w karte nie - stad porownanie celu z samym overlayem
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) handle.close();
  });
  document.body.append(overlay);
  stack.push(handle);
  focusFirst(card);
  return handle;
}

/**
 * Modal glowny: naglowek z tytulem i X, pod nim przekazane body (dostaje klase .modal-body,
 * wiec zachowuje odstepy kart sekcji). Zamykanie: X, Esc, klik w overlay.
 */
export function openModal(title: string, body: HTMLElement): ModalHandle {
  mainModal?.close();
  const card = el('div', 'modal-card');
  const head = el('div', 'modal-head');
  const close = button('X', 'modal-x', () => handle.close());
  close.title = 'Close';
  close.setAttribute('aria-label', 'Close');
  head.append(el('span', 'modal-title', title), close);
  body.classList.add('modal-body');
  card.append(head, body);
  const handle = mount(card, 'modal-overlay', () => {
    if (mainModal === handle) mainModal = null;
  });
  mainModal = handle;
  return handle;
}

/**
 * Maly modal NAD modalem glownym (wyzszy z-index): sama karta z trescia, bez naglowka.
 * Wspolny szkielet potwierdzenia i pytania o nazwe - rozni je tylko zawartosc body.
 */
function overModal(body: HTMLElement, onClose: () => void): ModalHandle {
  const card = el('div', 'modal-card');
  card.append(body);
  return mount(card, 'modal-overlay modal-confirm', onClose);
}

/**
 * Potwierdzenie: Esc, klik w overlay i Cancel daja false, przycisk akcji true.
 */
export function confirmModal(message: string, okLabel = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const body = el('div', 'modal-body');
    const row = el('div', 'btn-row');
    row.append(
      button('Cancel', 'modal-cancel', () => handle.close()),
      button(okLabel, 'danger', () => { answer = true; handle.close(); }),
    );
    body.append(el('p', 'modal-message', message), row);
    const handle = overModal(body, () => resolve(answer));
  });
}

/**
 * Pytanie o nazwe: pole z zaznaczona wartoscia poczatkowa. OK (albo Enter) daje wpisany tekst,
 * Esc / klik w overlay / Cancel daja null. Pusta nazwa nie ma sensu dla projektu ani poziomu,
 * wiec sam bialy znak traktujemy jak anulowanie.
 */
export function promptModal(title: string, initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    let answer: string | null = null;
    const body = el('div', 'modal-body');
    const input = el('input', 'prompt-input');
    input.type = 'text';
    input.value = initial;
    input.setAttribute('aria-label', title);

    function accept(): void {
      answer = input.value.trim() || null;
      handle.close();
    }

    // Enter zatwierdza; keydown nie moze wyciec do skrotow globalnych edytora
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      accept();
    });

    const row = el('div', 'btn-row');
    row.append(button('Cancel', 'modal-cancel', () => handle.close()), button('OK', '', accept));
    body.append(el('p', 'modal-message', title), input, row);
    const handle = overModal(body, () => resolve(answer));
    // mount ustawia fokus na pierwszej kontrolce (tym polu) - zostaje zaznaczenie tekstu,
    // zeby wpisanie wlasnej nazwy nie wymagalo kasowania podpowiedzi
    input.select();
  });
}
