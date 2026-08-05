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
 * Male potwierdzenie NAD modalem glownym (wyzszy z-index). Esc, klik w overlay i Cancel
 * daja false, przycisk akcji true.
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
    const card = el('div', 'modal-card');
    card.append(body);
    const handle = mount(card, 'modal-overlay modal-confirm', () => resolve(answer));
  });
}
