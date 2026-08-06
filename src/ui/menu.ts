// Przycisk-dropdown: prymityw wielokrotnego uzytku (karta Project - Export/Import).
// Menu wypada POD przyciskiem jako biala karta z czarna ramka - style jak reszta UI v1.
import { button, el } from './dom';

export interface MenuItem {
  label: string;
  disabled?: boolean;
  onPick(): void;
}

/**
 * Zamkniecie aktualnie otwartego menu (jesli jakies jest) - wspolne dla wszystkich instancji,
 * bo otwarty moze byc naraz co najwyzej jeden dropdown. Otwarcie kolejnego wola to PRZED
 * zbudowaniem wlasnego panelu, wiec drugi dropdown zawsze zamyka pierwszy.
 */
let closeOpenMenu: (() => void) | null = null;

/**
 * Przycisk z menu: klik rozwija liste pozycji, wybor/klik poza/Esc zamyka, drugi klik w przycisk
 * przelacza. `items()` liczy sie PRZY KAZDYM otwarciu, wiec disabled zawsze odzwierciedla aktualny
 * stan (np. brak projektu) - wywolujacy nie musi recznie przebudowywac menu przy kazdej zmianie.
 *
 * Panel dostaje `position: fixed` policzone z getBoundingClientRect przycisku, a nie zwykle
 * `position: absolute` zagniezdzone w przycisku - karty sekcji (.sidebar details) maja
 * `overflow: hidden` (zaokraglone rogi), ktore obcieloby zagniezdzony panel wystajacy pod krawedz
 * karty. Fixed poza drzewem karty omija ten problem.
 */
export function menuButton(label: string, items: () => MenuItem[]): HTMLElement {
  const wrap = el('div', 'menu');
  let panel: HTMLElement | null = null;

  function onOutside(e: PointerEvent): void {
    const target = e.target as Node;
    if (panel && !wrap.contains(target) && !panel.contains(target)) closeSelf();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeSelf();
    trigger.focus();
  }

  function closeSelf(): void {
    if (!panel) return;
    panel.remove();
    panel = null;
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    if (closeOpenMenu === closeSelf) closeOpenMenu = null;
  }

  function openSelf(): void {
    closeOpenMenu?.(); // co najwyzej jeden otwarty dropdown naraz
    panel = el('div', 'menu-panel');
    const rect = wrap.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom}px`;
    panel.style.width = `${rect.width}px`;
    for (const item of items()) {
      const itemBtn = button(item.label, 'btn-full', () => { closeSelf(); item.onPick(); });
      itemBtn.disabled = !!item.disabled;
      panel.append(itemBtn);
    }
    document.body.append(panel);
    closeOpenMenu = closeSelf;
    // capture: pointerdown poza wraca PRZED ewentualnym klikiem, ktory otwiera inny dropdown
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }

  const trigger = button(label, 'menu-trigger', () => {
    if (panel) closeSelf();
    else openSelf();
  });
  wrap.append(trigger);
  return wrap;
}
