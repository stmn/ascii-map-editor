// Przycisk-dropdown: prymityw wielokrotnego uzytku (karta Project - Export/Import).
// Menu wypada POD przyciskiem jako biala karta z czarna ramka - style jak reszta UI v1.
import { button, el } from './dom';
import { icon } from './icons';

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
 * Zamkniecie dowolnego otwartego menu z zewnatrz (fix round 1, finding 2) - wola to karta Project
 * na poczatku wlasnego render(), ktory przebudowuje CALY DOM triggerow (box.replaceChildren).
 * Panel dropdowna zyje POZA `box` (dopiety do document.body - patrz komentarz w menuButton), wiec
 * przebudowa karty go nie usuwa: bez tego wywolania panel zostalby osierocony ze starymi
 * domknieciami (stary trigger/onPick), az do najblizszego klikniecia poza/Esc.
 */
export function closeAnyMenu(): void {
  closeOpenMenu?.();
}

/** Etykieta triggera: tekst + chevron w dol po prawej (ta sama ikona co w karcie Layers). */
function triggerContent(label: string): DocumentFragment {
  const content = document.createDocumentFragment();
  content.append(el('span', 'menu-label', label), icon('chevron-down'));
  return content;
}

/**
 * Przycisk z menu: klik rozwija liste pozycji, wybor/klik poza/Esc zamyka, drugi klik w przycisk
 * przelacza. `items()` liczy sie PRZY KAZDYM otwarciu, wiec disabled zawsze odzwierciedla aktualny
 * stan (np. brak projektu) - wywolujacy nie musi recznie przebudowywac menu przy kazdej zmianie.
 *
 * Panel dostaje `position: fixed` policzone z getBoundingClientRect przycisku, a nie zwykle
 * `position: absolute` zagniezdzone w przycisku - karty sekcji (.sidebar details) maja
 * `overflow: hidden` (zaokraglone rogi), ktore obcieloby zagniezdzony panel wystajacy pod krawedz
 * karty. Fixed poza drzewem karty omija ten problem. Szerokosc panelu (CSS width: max-content)
 * dopasowuje sie do najdluzszej pozycji, nie do triggera - trigger daje tylko MINIMALNA szerokosc
 * (fix round 1, finding 1: dluzsze etykiety typu "Export project" nie mieszcily sie w waskim
 * panelu o szerokosci samego przycisku "Export").
 *
 * Klawiatura (fix round 1, finding 2 - ARIA menu, uproszczona wersja pulapki z modal.ts):
 * Enter/Space na przycisku otwiera (natywne zachowanie <button>), fokus leci od razu na pierwsza
 * WLACZONA pozycje, strzalki gora/dol przelaczaja miedzy wlaczonymi pozycjami (roving focus,
 * tabIndex=-1 na pozycjach - nie sa w zwyklej kolejnosci Tab), Enter/Space na pozycji wybiera
 * (natywne), Esc zamyka i oddaje fokus przyciskowi, Tab/Shift+Tab zamykaja menu i puszczaja
 * domyslny ruch fokusu przegladarki dalej (bez pulapki - to nie modal, wyjscie ma byc proste).
 */
export function menuButton(label: string, items: () => MenuItem[]): HTMLElement {
  const wrap = el('div', 'menu');
  let panel: HTMLElement | null = null;
  let itemButtons: HTMLButtonElement[] = [];

  function enabledItems(): HTMLButtonElement[] {
    return itemButtons.filter((b) => !b.disabled);
  }

  function moveFocus(delta: number): void {
    const enabled = enabledItems();
    if (enabled.length === 0) return;
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = current === -1 ? 0 : (current + delta + enabled.length) % enabled.length;
    enabled[next]?.focus();
  }

  function onOutside(e: PointerEvent): void {
    const target = e.target as Node;
    if (!panel || wrap.contains(target) || panel.contains(target)) return;
    // Klik w mape ma tylko zamknac menu, bez odpalenia gestu malowania pod spodem: canvas #map
    // ma wlasny listener pointerdown (input.ts, bubble na canvasie). Ten listener stoi na
    // document w CAPTURE, wiec wyprzedza handler canvasa - stopPropagation tutaj przerywa
    // dalsza propagacje do targetu i gest w ogole nie startuje. Dla reszty UI (przyciski,
    // selecty) NIE przerywamy - maja jak dotad zamknac menu i normalnie wykonac swoja akcje.
    if (target instanceof Element && target.closest('#map')) e.stopPropagation();
    closeSelf();
  }

  /** Panel jest position:fixed i nie sledzi triggera - scroll (capture, bo sidebar
   * scrolluje wewnetrznie, a zdarzenie 'scroll' nie ma fazy bubble - capture na document
   * to jedyny sposob zeby je zlapac z zagniezdzonego elementu) albo resize okna zamykaja
   * menu, zamiast zostawic panel odklejony od przycisku, ktory go otworzyl. */
  function onScroll(): void {
    closeSelf();
  }

  function onResize(): void {
    closeSelf();
  }

  function onKey(e: KeyboardEvent): void {
    if (!panel) return;
    // Otwarty panel zabiera CALA klawiature dla siebie, bezwarunkowo - nie tylko klawisze,
    // ktore tu obslugujemy. Listener stoi w capture na document, a globalne skroty edytora
    // (input.ts - pan widoku na strzalkach, draw.ts - zmiana pedzla na znaku drukowalnym,
    // history.ts - undo/redo) siedza w bubble na window; bez stopPropagation kazdy z tych
    // klawiszy lecialby dalej i jednoczesnie ruszalby widokiem/pedzlem POD otwartym menu
    // (fix round 2, finding 1). Capture na document wyprzedza bubble na window, wiec samo to
    // wystarcza - preventDefault nizej to osobna sprawa (blokuje tylko domyslna akcje
    // przegladarki dla konkretnego klawisza, np. scroll na strzalkach).
    e.stopPropagation();
    if (e.key === 'Escape') {
      closeSelf();
      trigger.focus();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); return; }
    // Tab/Shift+Tab: bez pulapki fokusu (uproszczone wzgledem modal.ts) - zamykamy panel
    // i oddajemy Tab przegladarce, zeby fokus poszedl dalej swoja naturalna droga.
    if (e.key === 'Tab') closeSelf();
  }

  function closeSelf(): void {
    if (!panel) return;
    panel.remove();
    panel = null;
    itemButtons = [];
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    if (closeOpenMenu === closeSelf) closeOpenMenu = null;
  }

  function openSelf(): void {
    closeOpenMenu?.(); // co najwyzej jeden otwarty dropdown naraz
    panel = el('div', 'menu-panel');
    panel.setAttribute('role', 'menu');
    const triggerRect = wrap.getBoundingClientRect();
    panel.style.top = `${triggerRect.bottom}px`;
    panel.style.left = `${triggerRect.left}px`;
    panel.style.minWidth = `${triggerRect.width}px`;
    itemButtons = items().map((item) => {
      const itemBtn = button(item.label, 'btn-full', () => { closeSelf(); item.onPick(); });
      itemBtn.disabled = !!item.disabled;
      itemBtn.setAttribute('role', 'menuitem');
      itemBtn.tabIndex = -1; // poza kolejnoscia Tab - fokus idzie tylko strzalkami/programowo
      panel!.append(itemBtn);
      return itemBtn;
    });
    document.body.append(panel);

    // korekta w lewo, gdyby panel (szerszy niz trigger przy dluzszych etykietach) wystawal
    // poza prawa krawedz viewportu; nie schodzimy ponizej 0, zeby korekta sama nie wypchnela
    // panelu poza LEWA krawedz zamiast prawej.
    const panelRect = panel.getBoundingClientRect();
    const overflowRight = panelRect.right - window.innerWidth;
    if (overflowRight > 0) panel.style.left = `${Math.max(0, triggerRect.left - overflowRight)}px`;

    trigger.setAttribute('aria-expanded', 'true');
    closeOpenMenu = closeSelf;
    enabledItems()[0]?.focus();
    // capture: pointerdown poza wraca PRZED ewentualnym klikiem, ktory otwiera inny dropdown
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
  }

  const trigger = button(triggerContent(label), 'menu-trigger', () => {
    if (panel) closeSelf();
    else openSelf();
  });
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  wrap.append(trigger);
  return wrap;
}
