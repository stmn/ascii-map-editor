// Tryb edytora: Advanced (pelny) i Simplified (klasyczny uklad v1 - mapa, znaki, generatory).
// Modul trzyma wybor w localStorage, rysuje przelacznik na gorze ekranu i przy pierwszym
// uruchomieniu pyta o tryb. Samo chowanie kart robi CSS po klasie na body - tu jest sterowanie.
import { button, el } from './dom';
import { withOffsetShift } from './layout';
import { openModal } from './modal';

export type EditorMode = 'advanced' | 'simplified';

/** Wybor trybu z poprzedniej sesji; brak klucza = uzytkownik jeszcze nie wybieral. */
const MODE_KEY = 'ascii-level-editor-mode';
/** Klasa na body, po ktorej CSS chowa karty Advanced i pokazuje karte Map. */
const SIMPLIFIED_CLASS = 'mode-simplified';
/**
 * Klasa na body wlaczajaca karte Extra features. To CALE zrodlo prawdy o jej widocznosci:
 * CSS pokazuje karte dopiero przy obu klasach naraz (mode-simplified + ta), wiec w Advanced
 * jest ukryta tym samym mechanizmem co reszta kart Simplified, a powrot do Simplified
 * przywraca wybor uzytkownika bez zadnego odtwarzania stanu. Checkbox w karcie glownej jest
 * jej pilotem (i lustrem), a X na karcie tylko wola setExtraVisible(false).
 * Stan jest sesyjny - jak pedzel czy dim, nie trafia do localStorage.
 */
const EXTRA_CLASS = 'show-extra';

/** Jedyna kopia prawdy o trybie w pamieci; localStorage jest tylko jej zapisem miedzy sesjami. */
let mode: EditorMode = 'advanced';

/**
 * Obserwator zmian skladu widocznych kart (tryb, karta Extra) - panels.ts przesuwa nim mape
 * i odswieza podglad. Trzymany w module, bo widocznosc karty Extra przelacza sie tez spoza
 * przelacznika trybu i obie sciezki maja zachowac sie identycznie.
 */
let onVisibilityChange: ((offsetShift: number) => void) | null = null;

export function currentMode(): EditorMode {
  return mode;
}

/** Karty widoczne tylko w Simplified (np. Map) pytaja o to, zeby nie liczyc podgladu na darmo. */
export function isSimplified(): boolean {
  return mode === 'simplified';
}

/** localStorage potrafi rzucac (tryb prywatny) - brak dostepu traktujemy jak brak wyboru. */
function readStored(): EditorMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === 'advanced' || raw === 'simplified' ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: EditorMode): void {
  try {
    localStorage.setItem(MODE_KEY, value);
  } catch {
    // brak miejsca albo tryb prywatny - tryb zyje do konca sesji, to nie powod do bledu
  }
}

function applyClass(): void {
  document.body.classList.toggle(SIMPLIFIED_CLASS, mode === 'simplified');
}

/** Czy karta Extra features jest wlaczona - checkbox w karcie glownej czyta stad stan poczatkowy. */
export function isExtraVisible(): boolean {
  return document.body.classList.contains(EXTRA_CLASS);
}

/**
 * Pokazanie/ukrycie karty Extra features. Zmiana skladu kart moze zwezic albo poszerzyc kolumne
 * (karta da sie przeciagnac do pustej kolumny), wiec idzie ta sama sciezka co przelaczenie trybu:
 * withOffsetShift mierzy offset centrowania przed i po, a wolajacy przesuwa mape o roznice.
 */
export function setExtraVisible(visible: boolean): void {
  const shift = withOffsetShift(() => {
    document.body.classList.toggle(EXTRA_CLASS, visible);
  });
  onVisibilityChange?.(shift);
}

/**
 * Ustawienie samej klasy na body wedlug zapisu - synchroniczne, bez UI i bez pytania o wybor.
 * app.ts wola to PRZED pierwszym malowaniem i centrowaniem: odczyt localStorage jest
 * natychmiastowy, a boot czeka na magazyn nawet kilka sekund, wiec uzytkownik Simplified
 * inaczej ogladalby przez ten czas pelny zestaw kart i skok mapy po ich zniknieciu.
 */
export function applyStoredMode(): void {
  mode = readStored() ?? 'advanced';
  applyClass();
}

// --- pierwsze uruchomienie: wybor trybu ----------------------------------------

/** Duzy przycisk wyboru: tytul i jednozdaniowy opis pod nim. */
function choiceButton(
  value: EditorMode, title: string, desc: string, pick: (value: EditorMode) => void,
): HTMLButtonElement {
  const content = document.createDocumentFragment();
  content.append(el('span', 'mode-choice-title', title), el('span', 'mode-choice-desc', desc));
  return button(content, 'mode-choice', () => pick(value));
}

/**
 * Modal pierwszego startu. Zamkniecie inna droga niz przyciskiem (Esc, X, klik w tlo) wybiera
 * Advanced - swiadomie prostsze niz modal bez wyjscia: KAZDA sciezka konczy sie zapisanym
 * trybem, wiec edytor nigdy nie zostaje bez ustawienia, a pytanie nie wraca przy nastepnym
 * starcie. Tryb i tak zmienia sie jednym klikiem w przelacznik na gorze.
 */
function openChooser(setMode: (value: EditorMode) => void): void {
  let picked: EditorMode | null = null;

  function pick(value: EditorMode): void {
    picked = value;
    handle.close();
  }

  const choices = el('div', 'btn-col');
  choices.append(
    choiceButton('advanced', 'Advanced', 'Full editor: projects, layers, engine exports.', pick),
    choiceButton('simplified', 'Simplified', 'Classic editor like the original: map, characters, generators.', pick),
  );
  const body = el('div');
  body.append(
    el('p', 'modal-message', 'Choose how the editor should look. You can switch any time at the top of the screen.'),
    choices,
  );
  const handle = openModal('Welcome', body, () => setMode(picked ?? 'advanced'));
}

// --- przelacznik ---------------------------------------------------------------

/**
 * Przelacznik trybu (staly pasek na gorze) i - przy pierwszym uruchomieniu - pytanie o wybor.
 * Wolane po zlozeniu paneli, wiec modal wyboru wypada juz nad dzialajacym edytorem.
 * onChange dostaje o ile przesunal sie offset centrowania: chowanie kart zmienia szerokosci
 * kolumn dokladnie tak jak przeciagniecie karty, wiec wolajacy przesuwa mape ta sama sciezka.
 */
export function initModeUi(onChange: (offsetShift: number) => void): void {
  onVisibilityChange = onChange;
  const advancedBtn = button('Advanced', 'mode-seg', () => setMode('advanced'));
  const simplifiedBtn = button('Simplified', 'mode-seg', () => setMode('simplified'));
  const pill = el('div', 'mode-switch');
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', 'Editor mode');
  pill.append(advancedBtn, simplifiedBtn);
  document.body.append(pill);

  function syncPill(): void {
    for (const [btn, value] of [[advancedBtn, 'advanced'], [simplifiedBtn, 'simplified']] as const) {
      btn.classList.toggle('active', mode === value);
      btn.setAttribute('aria-pressed', String(mode === value));
    }
  }

  function setMode(next: EditorMode): void {
    const shift = withOffsetShift(() => {
      mode = next;
      applyClass();
      syncPill();
    });
    writeStored(next);
    onVisibilityChange?.(shift);
  }

  syncPill();
  // klucza nie ma tylko przy pierwszym uruchomieniu (albo po jego recznym skasowaniu)
  if (readStored() === null) openChooser(setMode);
}
