// Auto-chowanie odpietych sidebarow: kolumna odpieta pinezka chowa sie transformem za krawedz
// okna, zostawiajac waski "pasek" (fragment samego sidebara, patrz .hidden w styles.css), a
// zblizenie kursora do krawedzi albo do samej kolumny wysuwa ja z powrotem.
//
// Modul jest samowystarczalny - initAutoHide() wola sie raz z panels.ts i dalej nie potrzebuje
// zadnego wpiecia w kod przeciagania kart ani przelacznika trybu: zamiast tego obserwuje zmiany
// klas przez MutationObserver (drag-active na kolumnie, mode-simplified na body). Dzieki temu
// layout.ts i mode.ts zostaja nietkniete przez ta funkcje.
import { iconButton, setIconTitle } from './dom';
import { icon } from './icons';
import { isUnpinned, setUnpinned, sidebarBox, type Side } from './layout';
import { isModalOpen } from './modal';
import { isSimplified } from './mode';

const SIDES: readonly Side[] = ['left', 'right'];

/** Klasa schowanej kolumny - kierunek transformu jest per-strona, patrz #sidebar(-left).hidden
 * w styles.css (prawa ucieka w prawo, lewa w lewo - stad dwie reguly dla jednej klasy). */
const HIDDEN_CLASS = 'hidden';

/** Strefa krawedzi okna: kursor blizej niz tyle px wysuwa schowana kolumne (brief pkt 2). */
const EDGE_ZONE_PX = 48;
/** Opoznienie miedzy opuszczeniem kolumny/strefy a faktycznym schowaniem (brief pkt 2). */
const HIDE_DELAY_MS = 400;

/** Ostatnia znana pozycja kursora - pointermove ja aktualizuje, evaluate() czyta ja tez poza
 * tym zdarzeniem (np. po zmianie klasy). Y ujemne = mysz jeszcze sie nie ruszyla - wtedy nic
 * nie zgadujemy (patrz nearEdge/overBox), kolumna zostaje w swoim domyslnym (widocznym) stanie. */
let lastX = 0;
let lastY = -1;

/** Fokus klawiatury wewnatrz kolumny - focusin/focusout aktualizuja, evaluate() czyta. */
const focusWithin = new Map<Side, boolean>();

/** Zaplanowane schowanie (id z setTimeout) per strona - najwyzej jedno naraz, kasowane
 * przy kazdym reveal (wyjscie z proximity resetuje odliczanie od nowa dopiero po nastepnym opuszczeniu). */
const hideTimers = new Map<Side, number>();

function cancelHideTimer(side: Side): void {
  const id = hideTimers.get(side);
  if (id === undefined) return;
  window.clearTimeout(id);
  hideTimers.delete(side);
}

function reveal(box: HTMLElement, side: Side): void {
  cancelHideTimer(side);
  // strzezone: reveal() leci przy kazdym evaluate (m.in. z MutationObservera na tej samej
  // klasie) - bezwarunkowy classList.remove() zostawialby (nawet dla nieobecnego tokenu)
  // nowy atrybut/wezel w drzewie mutacji i obserwator odpalalby evaluate w nieskonczonosc
  if (box.classList.contains(HIDDEN_CLASS)) box.classList.remove(HIDDEN_CLASS);
}

/** Kursor w strefie krawedzi wlasciwej dla danej strony. */
function nearEdge(side: Side): boolean {
  if (lastY < 0) return false;
  return side === 'left' ? lastX <= EDGE_ZONE_PX : window.innerWidth - lastX <= EDGE_ZONE_PX;
}

/** Kursor nad samym boxem - rozwinieta kolumna daleko od krawedzi (np. scrollujesz karte
 * w jej dolnej czesci) tez ma zostac wysunieta, nie tylko waski pasek proximity przy krawedzi.
 * getBoundingClientRect() liczy sie PO transformie, wiec dziala tak samo w stanie schowanym
 * (trafia tylko w wystajacy pasek) i rozwinietym (trafia w cala kolumne). */
function overBox(box: HTMLElement): boolean {
  if (lastY < 0) return false;
  const r = box.getBoundingClientRect();
  return lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom;
}

/**
 * Stany wymuszajace wysuniecie: przeciaganie karty (istniejaca klasa drag-active z layout.ts)
 * i fokus klawiatury wewnatrz kolumny. Otwarty modal NIE jest tu sprawdzany - polling tuz przed
 * schowaniem (patrz scheduleHide) wystarcza i jest tanszy niz sprawdzanie przy kazdym pointermove.
 */
function wantsVisible(side: Side, box: HTMLElement): boolean {
  return nearEdge(side) || overBox(box)
    || box.classList.contains('drag-active') || focusWithin.get(side) === true;
}

function scheduleHide(side: Side, box: HTMLElement): void {
  if (box.classList.contains(HIDDEN_CLASS) || hideTimers.has(side)) return;
  const id = window.setTimeout(() => {
    hideTimers.delete(side);
    // rewalidacja tuz przed schowaniem - warunki (w tym modal) mogly sie zmienic w trakcie
    // czekania; jesli dalej trzeba chowac, dopiero teraz dokladamy klase
    if (isModalOpen() || isSimplified() || !isUnpinned(side) || wantsVisible(side, box)) return;
    if (!box.classList.contains(HIDDEN_CLASS)) box.classList.add(HIDDEN_CLASS);
  }, HIDE_DELAY_MS);
  hideTimers.set(side, id);
}

/** Jeden przebieg decyzji dla strony: przypieta/Simplified/w zasiegu -> widoczna, inaczej
 * zaplanuj schowanie. Wolane po kazdym sygnale, ktory mogl zmienic odpowiedz (pointermove,
 * zmiana klasy kolumny albo body, focusin/focusout, klik pinezki). */
function evaluate(side: Side): void {
  const box = sidebarBox(side);
  if (!box) return;
  if (isSimplified() || !isUnpinned(side) || wantsVisible(side, box)) {
    reveal(box, side);
    return;
  }
  scheduleHide(side, box);
}

function evaluateAll(): void {
  for (const side of SIDES) evaluate(side);
}

// --- pinezka --------------------------------------------------------------------

function pinIcon(unpinned: boolean): SVGElement {
  return icon(unpinned ? 'pin-off' : 'pin');
}

function pinTitle(unpinned: boolean): string {
  return unpinned ? 'Pin sidebar' : 'Unpin sidebar';
}

/** Odswieza ikone/tytul pinezki po jej kliknieciu - stan czyta z layout.ts (DOM), nie z lokalnej kopii. */
function syncPinButton(btn: HTMLButtonElement, side: Side): void {
  const unpinned = isUnpinned(side);
  btn.replaceChildren(pinIcon(unpinned));
  setIconTitle(btn, pinTitle(unpinned));
}

/**
 * Doklada pinezke jako pierwsze dziecko kolumny (nad kartami). Nie jest to <details>, wiec
 * DnD (cardsOf/allCards licza tylko `> details[data-section]`) i is-empty jej nie widza.
 */
function mountPinButton(box: HTMLElement, side: Side): void {
  const unpinned = isUnpinned(side);
  const btn = iconButton(pinIcon(unpinned), 'pin-btn', pinTitle(unpinned), () => {
    setUnpinned(side, !isUnpinned(side));
    syncPinButton(btn, side);
    // fokus po kliku (przegladarka zostawia go na klikanym przycisku) NIE ma sam z siebie
    // wymuszac widocznosci - patrz wykluczenie pinezki w bindFocus. Zadnego blur() tutaj:
    // kasowalby fokus tez userowi klawiatury (Tab+Enter), ktory ma go zachowac na przycisku
    evaluate(side);
  });
  box.prepend(btn);
}

// --- podpiecie --------------------------------------------------------------------

function watchClassChanges(target: Element, onChange: () => void): void {
  new MutationObserver(onChange).observe(target, { attributes: true, attributeFilter: ['class'] });
}

/** Fokus NA SAMEJ pinezce nie liczy sie jako "fokus wewnatrz sidebara" (wykluczenie, nie blur):
 * mysz zostawia tam fokus po kazdym kliku, a to nie jest sygnal "user nawiguje po karcie".
 * Fokus klawiaturowy (Tab dalej, w realna kontrolke karty) nadal normalnie wymusza widocznosc -
 * wykluczony jest tylko ten jeden przycisk, nie cala kolumna. */
function isPinButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.classList.contains('pin-btn');
}

function bindFocus(box: HTMLElement, side: Side): void {
  box.addEventListener('focusin', (e) => {
    if (isPinButton(e.target)) return;
    focusWithin.set(side, true);
    evaluate(side);
  });
  box.addEventListener('focusout', (e) => {
    // BEZ wykluczenia pinezki tutaj (w odroznieniu od focusin): jesli to ona jest ostatnim
    // przystankiem przed opuszczeniem kolumny, to nadal realne wyjscie i focusWithin ma
    // wrocic na false - wykluczenie dotyczy tylko WCHODZENIA fokusu NA sam przycisk.
    // focusout leci tez przy przejsciu miedzy kontrolkami wewnatrz kolumny - liczy sie
    // dopiero wyjscie POZA nia (ten sam wzorzec co dragleave w layout.ts)
    const to = e.relatedTarget;
    if (to instanceof Node && box.contains(to)) return;
    focusWithin.set(side, false);
    evaluate(side);
  });
}

/**
 * Wpina auto-chowanie obu kolumn: pinezka nad kartami, nasluch pozycji kursora (window,
 * pointermove - tanie porownanie clientX/clientY z progami) i stanow wymuszajacych wysuniecie.
 * Wolane raz z panels.ts, po initLayout - kolumny musza juz istniec w DOM i miec swoje karty.
 */
export function initAutoHide(): void {
  for (const side of SIDES) {
    const box = sidebarBox(side);
    if (!box) continue;
    focusWithin.set(side, false);
    mountPinButton(box, side);
    bindFocus(box, side);
    // drag-active (layout.ts) i unpinned (klik pinezki wyzej) zmieniaja klase kolumny -
    // obserwator zwalnia z osobnego wpiecia w kod przeciagania kart
    watchClassChanges(box, () => evaluate(side));
  }
  // Simplified wylacza auto-hide calkowicie (brief pkt 5) - obserwacja klasy body zamiast
  // wpiecia w initModeUi/mode.ts, zeby ten modul zostal samowystarczalny
  watchClassChanges(document.body, evaluateAll);
  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    evaluateAll();
  });
}
