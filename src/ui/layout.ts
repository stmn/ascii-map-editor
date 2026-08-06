// Uklad kolumn: dwa sidebary (lewy i prawy) z przeciaganiem kart sekcji za naglowek
// i zapisem ukladu w localStorage.
//
// Modul nie wie nic o zawartosci sekcji - operuje samymi elementami
// <details data-section="..."> i tylko zmienia im rodzica. Element zachowuje tozsamosc,
// wiec sluchacze podpiete przez panele przezywaja przeniesienie i nie trzeba niczego
// przerysowywac ani rejestrowac na nowo.

/** Uklad kolumn z poprzedniej sesji: listy id sekcji w kolejnosci od gory. */
const STORAGE_KEY = 'ascii-level-editor-layout2';
/**
 * Klucz sprzed v2.7 (domyslny uklad byl inny - lewa kolumna startowala pusta). Kasujemy go
 * przy kazdym odczycie ukladu - jednorazowe, swiadome czyszczenie: userzy z recznym ukladem
 * dostaja nowy domyslny raz, zamiast utknac na starym rozstawie kart na zawsze.
 */
const OLD_STORAGE_KEY = 'ascii-level-editor-layout';
/** Odstep miedzy kartami (gap w styles.css) - wskaznik wstawienia staje w jego polowie. */
const CARD_GAP = 12;

export interface SidebarLayout {
  left: string[];
  right: string[];
}

// --- dostep do kolumn i kart ---------------------------------------------------

function leftBox(): HTMLElement | null {
  return document.getElementById('sidebar-left');
}

function rightBox(): HTMLElement | null {
  return document.getElementById('sidebar');
}

function boxes(): HTMLElement[] {
  return [leftBox(), rightBox()].filter((b): b is HTMLElement => b !== null);
}

/** Karty danej kolumny w kolejnosci od gory; wskaznik wstawienia nie jest karta, wiec odpada. */
function cardsOf(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(':scope > details[data-section]')];
}

/** Wszystkie karty obu kolumn w kolejnosci dokumentu (najpierw lewa, potem prawa). */
function allCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.sidebar > details[data-section]')];
}

function sectionId(card: HTMLElement): string {
  return card.dataset.section ?? '';
}

/** Szukamy po dataset, a nie selektorem - id z localStorage moze zawierac cokolwiek. */
function findCard(id: string): HTMLElement | null {
  return allCards().find((card) => sectionId(card) === id) ?? null;
}

/**
 * Czy karta cokolwiek zajmuje. Tryb Simplified chowa czesc kart przez display:none (CSS po
 * data-section), a taki element ma offsetParent === null i zerowy prostokat - dla pomiaru
 * kolumn, wskaznika wstawienia i pustej strefy liczy sie WIDOCZNY sklad, nie zapis ukladu.
 */
function isVisible(card: HTMLElement): boolean {
  return card.offsetParent !== null;
}

/** Karty kolumny, ktore realnie widac - reszta modulu operuje na pelnej liscie (cardsOf). */
function visibleCardsOf(box: HTMLElement): HTMLElement[] {
  return cardsOf(box).filter(isVisible);
}

// --- pomiar dla centrowania mapy ----------------------------------------------

/**
 * Szerokosc kolumny w pikselach; kolumna bez WIDOCZNYCH kart daje 0, bo nie zabiera mapie
 * miejsca (jej ramka ma w layoucie stala szerokosc, ale jest przezroczysta i nie lapie klikniec).
 */
function columnWidth(box: HTMLElement | null): number {
  if (!box || visibleCardsOf(box).length === 0) return 0;
  return box.getBoundingClientRect().width;
}

/** Szerokosci obu kolumn - app.ts centruje papier w wolnym obszarze miedzy nimi. */
export function sidebarWidths(): { left: number; right: number } {
  return { left: columnWidth(leftBox()), right: columnWidth(rightBox()) };
}

/**
 * Przesuniecie srodka wolnego obszaru wzgledem srodka okna, w tej samej konwencji co offsetX
 * w centerView (dodatni = mapa idzie w lewo). Roznica sprzed i po zmianie ukladu wystarcza,
 * by przesunac widok w poziomie bez ruszania przewiniecia w pionie.
 */
function viewOffset(): number {
  const { left, right } = sidebarWidths();
  return (right - left) / 2;
}

/**
 * Wykonuje zmiane ukladu i zwraca o ile przesunal sie offset centrowania. Jedna sciezka dla
 * upuszczenia karty i przelaczenia trybu (ukrycie kart tez zmienia szerokosci kolumn), zeby
 * oba zachowywaly sie tak samo: mapa jedzie w poziomie, reczne przewiniecie w pionie zostaje.
 */
export function withOffsetShift(change: () => void): number {
  const before = viewOffset();
  change();
  return viewOffset() - before;
}

// --- persystencja --------------------------------------------------------------

function idsOf(box: HTMLElement | null): string[] {
  return box ? cardsOf(box).map(sectionId) : [];
}

/** Uklad odczytany z DOM - jedyne zrodlo prawdy przy zapisie. */
export function currentLayout(): SidebarLayout {
  return { left: idsOf(leftBox()), right: idsOf(rightBox()) };
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Uszkodzony wpis albo brak dostepu do localStorage traktujemy jak brak zapisu. */
function readLayout(): SidebarLayout | null {
  try {
    // czyszczenie starego klucza - patrz komentarz przy OLD_STORAGE_KEY; removeItem na
    // nieobecnym kluczu jest cichym no-op, wiec kolejne odczyty juz nic tu nie robia
    localStorage.removeItem(OLD_STORAGE_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    return { left: idList(rec.left), right: idList(rec.right) };
  } catch {
    return null;
  }
}

function saveLayout(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLayout()));
  } catch {
    // brak miejsca albo tryb prywatny - uklad zyje do konca sesji, to nie powod do bledu
  }
}

/**
 * Ustawienie kart wedlug zapisu. Nieznane id sa pomijane, a sekcje spoza zapisu
 * (starszy wpis, nowsza wersja edytora) laduja na koncu prawej kolumny - dzieki temu
 * nowa karta zawsze gdzies jest, zamiast zniknac z widoku.
 */
function applyLayout(saved: SidebarLayout): void {
  const left = leftBox(), right = rightBox();
  if (!left || !right) return;
  const placed = new Set<string>();
  const columns: [HTMLElement, string[]][] = [[left, saved.left], [right, saved.right]];
  for (const [target, ids] of columns) {
    for (const id of ids) {
      // duplikat w zapisie pomijamy - karta ma tylko jednego rodzica, liczy sie pierwsze wystapienie
      if (placed.has(id)) continue;
      const card = findCard(id);
      if (!card) continue;
      placed.add(id);
      target.appendChild(card);
    }
  }
  for (const card of allCards()) {
    if (!placed.has(sectionId(card))) right.appendChild(card);
  }
}

/**
 * Ustawienie kart wedlug zapisu - synchroniczne, bez podpinania czegokolwiek.
 * app.ts wola to PRZED pierwszym malowaniem: boot czeka na magazyn (IndexedDB nawet kilka
 * sekund), a uzytkownik z wlasnym ukladem nie moze w tym czasie ogladac ukladu domyslnego
 * i skoku kart po zaladowaniu. Wywolanie jest idempotentne, wiec initLayout moze je powtorzyc.
 */
export function applySavedLayout(): void {
  const saved = readLayout();
  if (saved) applyLayout(saved);
  syncEmpty();
}

// --- przeciaganie kart ---------------------------------------------------------

let dragged: HTMLElement | null = null;
let dropLine: HTMLElement | null = null;
let onLayoutChange: ((offsetShift: number) => void) | null = null;

/**
 * Pusta kolumna dostaje klase zamiast :empty - wskaznik wstawienia tez jest dzieckiem kolumny.
 * "Pusta" znaczy bez WIDOCZNYCH kart: kolumna z samymi kartami ukrytymi przez tryb wyglada
 * dla uzytkownika na pusta i tak samo ma sie zachowac kreskowana strefa upuszczenia.
 */
function syncEmpty(): void {
  for (const box of boxes()) box.classList.toggle('is-empty', visibleCardsOf(box).length === 0);
}

function ensureLine(): HTMLElement {
  if (!dropLine) {
    dropLine = document.createElement('div');
    dropLine.className = 'drop-line';
  }
  return dropLine;
}

function hideLine(): void {
  dropLine?.remove();
}

/**
 * Karta, PRZED ktora wypadnie upuszczenie: pierwsza WIDOCZNA, ktorej srodek lezy ponizej kursora.
 * Karty ukryte przez tryb nie biora udzialu - nie zajmuja miejsca, wiec nie da sie w nie celowac.
 */
function dropBefore(box: HTMLElement, clientY: number): HTMLElement | null {
  for (const card of visibleCardsOf(box)) {
    if (card === dragged) continue;
    const r = card.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return card;
  }
  return null;
}

/**
 * Kreska w miejscu upuszczenia. Pozycjonowana absolutnie wzgledem kolumny, wiec jej
 * pokazanie nie przesuwa kart - inaczej karty uciekalyby spod kursora i wskaznik migotalby.
 * Kolumna bez innych kart kreski nie dostaje - komunikatem jest tam kreskowana strefa.
 */
function showLine(box: HTMLElement, before: HTMLElement | null): void {
  // karta ukryta przez tryb ma offsetTop/offsetHeight rowne 0 - jako punkt odniesienia
  // wrzucilaby kreske na sam gorny brzeg kolumny, wiec bierzemy tylko widoczne
  const cards = visibleCardsOf(box).filter((card) => card !== dragged);
  // karta odniesienia: ta przed ktora wstawiamy, albo ostatnia gdy dokladamy na koniec
  const ref = before ?? cards[cards.length - 1];
  if (!ref) {
    hideLine();
    return;
  }
  const line = ensureLine();
  const top = before
    ? ref.offsetTop - CARD_GAP / 2 - 1
    : ref.offsetTop + ref.offsetHeight + CARD_GAP / 2 - 1;
  line.style.top = `${Math.max(0, top)}px`;
  // szerokosc i lewa krawedz z karty, nie z CSS: klasyczny scrollbar zweza karty,
  // a lewa kolumna ma wlasny padding
  line.style.left = `${ref.offsetLeft}px`;
  line.style.width = `${ref.offsetWidth}px`;
  // dragover leci przy kazdym drgnieciu myszy - przepinamy wezel tylko przy zmianie kolumny
  if (line.parentElement !== box) box.appendChild(line);
}

function startDrag(card: HTMLElement, e: DragEvent): void {
  // przelaczenie trybu chowa karty bez ruszania ukladu, wiec "pustka" kolumny mogla sie od
  // ostatniego przeliczenia zmienic - kreskowana strefa liczy sie dopiero teraz i tu ja odswiezamy
  syncEmpty();
  dragged = card;
  const dt = e.dataTransfer;
  if (dt) {
    dt.effectAllowed = 'move';
    // payload jest tylko po to, by przegladarka uznala przeciaganie za wazne
    dt.setData('text/plain', sectionId(card));
    dt.setDragImage(card, 24, 16);
  }
  card.classList.add('dragging');
  // podczas przeciagania obie kolumny musza lapac zdarzenia (na co dzien ich nie lapia,
  // zeby przerwy miedzy kartami nie zjadaly klikniec w mape)
  for (const box of boxes()) box.classList.add('drag-active');
}

function endDrag(): void {
  dragged?.classList.remove('dragging');
  dragged = null;
  hideLine();
  for (const box of boxes()) box.classList.remove('drag-active');
}

function bindCard(card: HTMLElement): void {
  const summary = card.querySelector<HTMLElement>(':scope > summary');
  if (!summary) return;
  summary.draggable = true;
  // dragstart leci dopiero przy faktycznym przeciagnieciu, wiec klik dalej zwija/rozwija karte
  summary.addEventListener('dragstart', (e) => startDrag(card, e));
  summary.addEventListener('dragend', endDrag);
}

function bindBox(box: HTMLElement): void {
  box.addEventListener('dragover', (e) => {
    if (!dragged) return;
    // preventDefault na dragover to jedyny sposob zglosic, ze tu wolno upuscic
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    showLine(box, dropBefore(box, e.clientY));
  });
  box.addEventListener('dragleave', (e) => {
    // dragleave leci tez przy wejsciu na dziecko - kreske chowamy dopiero po wyjsciu z kolumny
    const to = e.relatedTarget;
    if (to instanceof Node && box.contains(to)) return;
    hideLine();
  });
  box.addEventListener('drop', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const card = dragged;
    // przestawienie NAJPIERW, powiadomienie potem: `f?.(arg)` nie liczy argumentu, gdy f jest
    // nullem, wiec zapakowanie mutacji w argument opcjonalnego wywolania cicho zjadaloby caly
    // drop u kazdego, kto zawola initLayout bez onChange
    const shift = withOffsetShift(() => {
      box.insertBefore(card, dropBefore(box, e.clientY));
      endDrag();
      syncEmpty();
      saveLayout();
    });
    onLayoutChange?.(shift);
  });
}

/**
 * Podpina przeciaganie kart. Wolane po zlozeniu paneli - karty maja juz tresc, a przeniesienie
 * <details> jej nie rusza. Sam uklad jest juz ustawiony (applySavedLayout przy starcie modulu
 * app.ts), ale powtarzamy go tanio, gdyby ktos wolal initLayout bez tamtego kroku.
 * onChange dostaje o ile zmienil sie offset centrowania - app przesuwa widok w poziomie.
 */
export function initLayout(onChange?: (offsetShift: number) => void): void {
  if (boxes().length < 2) return;
  onLayoutChange = onChange ?? null;
  applySavedLayout();
  for (const card of allCards()) bindCard(card);
  for (const box of boxes()) bindBox(box);
}
