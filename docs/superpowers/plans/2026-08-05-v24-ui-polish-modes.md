# v2.4 UI Polish + Simplified Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dziesiec prosb usera z 2026-08-05 (druga lista): ikony Lucide, licznik na kafelku koloru, rozmiar pedzla, mniejsze info-teksty, W/H full width, sekcje od gory, sidebar full-height jako dropzone, dedup legacy Text, przyciemnianie nie-aktywnych warstw, tryb Simplified/Advanced z wyborem przy pierwszym uruchomieniu.

**Architecture:** `ui/icons.ts` - inline SVG (Lucide, ISC) jako funkcje zwracajace SVGElement. Rozmiar pedzla w EditorState + stopka w sciezce paint/erase (undo dziala przez istniejacy StrokeCommand). Renderer: flattenWithSource + alpha per komorka. Tryb: localStorage + klasa na body sterujaca widocznoscia kart + nowa karta Map (v1-style) w Simplified.

**Tech Stack:** jak dotad - Vite + TS strict + Vitest, zero runtime deps.

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote. Commity lokalne, angielskie, jednolinijkowe, bez Co-Authored-By.
- Zero runtime dependencies (SVG inline; zrodlo ikon: Lucide - dopisac sekcje ISC do LICENSES.md).
- UI po angielsku; komentarze PL bez diakrytykow; NIGDY dlugich myslnikow. Stylistyka v1; bez gradientow/box-shadow.
- Weryfikacje przegladarkowe: JEDNA krotka sesja CDP per task UI, kill + dowod ps.
- Kazda nowa operacja mutujaca przechodzi przez historie (undo/redo) tak jak dotychczasowe.
- Branch: `v24-ui-polish` od `main`. Po ukonczeniu: lokalny merge.

## File Structure

```
src/ui/icons.ts          # NOWY: icon(name) -> SVGElement; pencil, trash, chevron-up/down, eye,
                         #       eye-off, copy, x, plus (Lucide paths, 16x16, currentColor)
src/ui/panels/map.ts     # NOWY (Task 5): karta Map dla trybu Simplified
src/ui/mode.ts           # NOWY (Task 5): tryb advanced/simplified, chooser, switch, widocznosc kart
src/core/editorState.ts  # MOD (Task 2): brushSize
src/ui/renderer.ts       # MOD (Task 4): flattenWithSource + dim
src/core/level.ts        # MOD (Task 4): flattenWithSource
tests/level.test.ts      # MOD (Task 4)
src/ui/panels/*.ts, src/app.ts, src/ui/input.ts, src/ui/layout.ts, src/styles.css, index.html  # MOD
```

Kolejnosc: 1 ikony, 2 rozmiar pedzla, 3 szlify stylu, 4 dim warstw, 5 tryby, 6 docs+2.4.0.

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v24-ui-polish`

---

### Task 1: Ikony Lucide (ui/icons.ts) + podmiana w calym UI

**Files:**
- Create: `src/ui/icons.ts`
- Modify: `src/ui/dom.ts` (iconButton przyjmuje SVGElement | string), `src/ui/panels/{legend,layers,project}.ts`, `src/ui/modal.ts` (X zamykania), `src/styles.css`, `LICENSES.md` (sekcja Lucide ISC z pelnym tekstem licencji i copyright line)

**Zachowanie:**
- `icon(name: IconName): SVGElement` - inline SVG 16x16, `stroke="currentColor"`, `fill="none"`, `stroke-width="3"` (POGRUBIONE na wyrazna prosbe usera z 2026-08-05 "ikonki zrob troche grubsze"; pojedyncza ikona moze zejsc do 2.5, jesli przy 14px sie zalewa - odnotowac wyjatki), viewBox 24x24 (natywny Lucide), skalowany CSS do 14-16px. Zestaw: `pencil` (edycja literki legendy), `trash` (usuwanie: warstwy, poziomy, projekty), `chevron-up`/`chevron-down` (kolejnosc warstw), `eye`/`eye-off` (widocznosc warstwy - zamiast 'o' z przekresleniem), `copy` (duplicate poziomu), `x` (zamykanie modali), `plus` (opcjonalnie: Add layer/New level - tylko jesli nie psuje szerokosci przyciskow).
- Sciezki SVG pobrac z oficjalnego repo Lucide (dev-time; runtime bez sieci) i wkleic jako stale. Kazda ikona = path data w stalej; jedna funkcja budujaca SVG (bez duplikacji).
- Podmiany: legend edit 'e' -> pencil; wszystkie czerwone 'X' usuwania -> trash (kolor przycisku bez zmian); strzalki '^'/'v' -> chevrony; oko 'o' -> eye/eye-off (koniec z line-through); 'D' duplicate -> copy; 'X' zamykania modali -> x. aria-labels/tooltips bez zmian (przenosza sie na przyciski).
- Kolory ikon dziedzicza currentColor przycisku (biale na czerwonym trashu, czarne na bialych).

- [ ] **Step 1:** icons.ts + adaptacja iconButton/setIconTitle (string nadal wspierany dla chipow znakowych legendy/brusha - te ZOSTAJA znakami, nie ikonami).
- [ ] **Step 2:** Podmiany we wszystkich miejscach + style (rozmiar, wyrownanie w przyciskach 22x22).
- [ ] **Step 3:** LICENSES.md sekcja Lucide (ISC, https://github.com/lucide-icons/lucide).
- [ ] **Step 4:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: screenshot kart Legend/Layers/Project + modala (ikony renderuja sie, przyciski dzialaja), zero bledow konsoli; kill + ps.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Replace text glyph buttons with inline Lucide icons"`

---

### Task 2: Rozmiar pedzla (Draw)

**Files:**
- Modify: `src/core/editorState.ts` (`brushSize: number` w EditorState, 1-5, domyslnie 1), `src/app.ts` (stopka w paint/erase), `src/ui/panels/draw.ts` (wybor rozmiaru), `src/ui/renderer.ts` (hover pokazuje stopke), `src/styles.css`

**Zachowanie:**
- Stopka kwadratowa n x n wokol komorki kursora: offsety od `-Math.floor((n-1)/2)` do `+Math.ceil((n-1)/2)` w obu osiach. Paint stawia brush we wszystkich komorkach stopki; erase analogicznie kasuje. Dziala z interpolacja Bresenhama (stopka aplikowana w kazdym kroku linii) i z istniejacym zbieraniem StrokeCommand (komorki stopki trafiaja do gestu -> undo cofa cala kreske z pelna stopka; dedupe first-before/last-after juz to obsluguje).
- UI w karcie Draw, pod wierszem Char: label `Size` + 5 chipow `1 2 3 4 5` (styl jak chipy znakow; aktywny niebieski). Klik ustawia state.brushSize.
- Hover na canvasie: podswietlenie obejmuje cala stopke (prostokat n x n zamiast pojedynczej komorki; kolor/erase-red jak dotad).
- Rozmiar NIE jest persystowany (sesyjny, jak brush... brush tez jest sesyjny - spojnie).

- [ ] **Step 1:** editorState + app.ts stopka (wspolna funkcja `forEachFootprintCell(x, y, size, fn)` - jedna implementacja dla paint/erase/hover).
- [ ] **Step 2:** UI chipy + hover stopki w rendererze (renderer dostaje brushSize przez draw() albo pole - wybrac czystsze, odnotowac).
- [ ] **Step 3:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: size 3 -> jeden klik maluje 9 komorek, drag maluje gruba kreske, Ctrl+Z cofa CALY gest, hover pokazuje 3x3, size 1 wraca do dotychczasowego zachowania; zero bledow konsoli; kill + ps.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add brush size with square footprint"`

---

### Task 3: Szlify stylu (licznik na kafelku, typografia, uklad sidebarow, dedup legacy)

**Files:**
- Modify: `src/ui/panels/legend.ts`, `src/ui/panels/{draw,generate}.ts` lub odpowiednie sekcje, `src/ui/panels/exportModal.ts` (usun opcje Text z legacy), `src/ui/layout.ts`, `src/styles.css`, `index.html` (jesli potrzebne)

**Zachowanie:**
1. **Licznik na kafelku koloru (prosba #2):** liczba uzyc renderowana NA swatchu koloru (wycentrowana, font 9-10px Press Start 2P); kolor tekstu wg luminancji tla (jasny swatch -> czarny tekst, ciemny -> bialy; prog WCAG relative luminance 0.5, funkcja wspolna np. w dom.ts). Osobna kolumna licznika znika - wiersz legendy robi sie krotszy. Color picker nadal otwiera sie klikiem w swatch (liczba `pointer-events: none`).
2. **Draw info mniejsze (#4):** tekst pomocy w Draw na 9px (klasa wspolna `.hint-small`).
3. **Generate info mniejsze + margin-top (#5):** jak wyzej + `margin-top: 8px`; inputy W i H kazdy na 100% szerokosci karty (stack pionowy: label + input, label nad inputem).
4. **Sekcje od gory (#6):** kontenery sidebarow wyrownane do gory (usunac pionowe centrowanie; `top: 12px` + `bottom: 12px`).
5. **Sidebar full-height dropzone (#7):** kontener zajmuje pelna wysokosc okna (12px marginesy gora/dol) niezaleznie od liczby kart; DnD dziala na calej wysokosci (drop ponizej ostatniej karty = append; pusta przestrzen kontenera przyjmuje dragover/drop - usunac pointer-events:none dla niepustych kontenerow poza dragiem tam, gdzie blokowalo to drop na pustej przestrzeni... UWAGA: pusta przestrzen POD kartami prawej kolumny nie moze blokowac klikow w mape poza dragiem - rozwiazanie: pointer-events none na kontenerze + auto na kartach (jak dotad dla pustego), a podczas aktywnego draga klasa wlaczajaca pointer-events na calym kontenerze. Przetestowac klik w mape pod kartami po zmianie.
6. **Dedup legacy Text (#8):** w modalu Export usun opcje `Text` z selecta Legacy (zostaja Array of strings / Array of arrays; default Array of strings). Copy TXT pokrywa format tekstowy. (Karta Map w Simplified - Task 5 - zachowa wszystkie 3 formaty.)

- [ ] **Step 1:** Implementacja per punkt.
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: screenshoty (legenda z licznikiem na swatchu przy jasnym i ciemnym kolorze, Draw/Generate typografia, sekcje od gory, drop na dolnej pustej przestrzeni sidebara dziala, klik w mape pod kartami dziala, legacy select bez Text); zero bledow konsoli; kill + ps.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Polish legend counts, typography, sidebar layout and legacy dedup"`

---

### Task 4: Przyciemnianie nie-aktywnych warstw

**Files:**
- Modify: `src/core/level.ts` (`flattenWithSource`), `src/ui/renderer.ts`, `src/ui/panels/layers.ts` (checkbox), `src/core/editorState.ts` (`dimOthers: boolean`, domyslnie true), `src/app.ts`
- Test: `tests/level.test.ts` (flattenWithSource)

**Zachowanie:**
- `flattenWithSource(layers: Layer[]): Map<string, { ch: string; layerIndex: number }>` (klucz "x,y"; tylko widoczne warstwy; najwyzsza wygrywa; layerIndex = indeks w tablicy layers). TDD: test analogiczny do flattenLayers (gorna wygrywa i niesie swoj indeks; niewidoczne pomijane).
- Renderer: gdy `dimOthers` wlaczone I widocznych warstw > 1: rysuje z flattenWithSource; komorki z warstwy aktywnej alpha 1.0, pozostale `DIM_ALPHA = 0.5` (globalAlpha wokol fillText; stala nazwana). Gdy wylaczone albo 1 warstwa: dotychczasowa sciezka flatten (cache po contentRev zachowany; cache musi uwzgledniac tez activeLayer i dimOthers przy sciezce z dim - najprosciej: klucz cache poszerzony o activeLayer/dimOthers albo cache tylko dla sciezki bez dim, odnotowac wybor).
- Checkbox `Dim other layers` w karcie Layers pod lista (styl v1 checkbox); zmiana -> markDirty (bez historii - to ustawienie widoku, jak visibility toggle... visibility JEST w historii; dim to ustawienie WIDOKU nie tresci - BEZ historii, BEZ autosave, sesyjne).
- Miniatury/eksporty/thumb: bez zmian (pelna nieprzezroczystosc).

- [ ] **Step 1:** TDD flattenWithSource (test -> FAIL -> implementacja -> PASS).
- [ ] **Step 2:** Renderer + checkbox + stan.
- [ ] **Step 3:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: 2 warstwy z roznymi znakami - nie-aktywna przyciemniona, przelaczenie aktywnej odwraca dim, checkbox off = wszystko 100%, 1 warstwa = brak dim; screenshot; zero bledow konsoli; kill + ps.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Dim non-active layers on canvas with toggle"`

---

### Task 5: Tryb Simplified/Advanced

**Files:**
- Create: `src/ui/mode.ts`, `src/ui/panels/map.ts`
- Modify: `index.html` (karta Map + kontener przelacznika), `src/ui/panels.ts`, `src/ui/layout.ts` (tolerancja ukrytych kart), `src/styles.css`, `src/app.ts`

**Zachowanie:**
- **Stan:** localStorage `ascii-level-editor-mode` = `advanced` | `simplified`. Brak klucza przy starcie -> modal wyboru (openModal, bez X i bez zamykania Esc/overlay LUB Esc wybiera advanced - wybrac prostsze, odnotowac): dwa duze przyciski [Advanced] [Simplified] + jednozdaniowe opisy ("Full editor: projects, layers, engine exports" / "Classic editor like the original: map, characters, generators"). Wybor zapisuje klucz i stosuje tryb.
- **Przelacznik:** staly element top-center (fixed, top 12px, wycentrowany poziomo): dwusegmentowy pill `Advanced | Simplified` w stylistyce v1 (bialy, ramka 2px, aktywny segment niebieski z bialym tekstem). Klik przelacza tryb natychmiast (bez reloadu) i zapisuje. Nie nachodzi na modale/toasty (z-index ponizej modali).
- **Simplified ukrywa** karty: Project, Layers, Export, Import (klasa `mode-simplified` na body + CSS `display:none` po data-section; layout.ts pomija ukryte karty w miary/DnD - drag handle i tak niedostepny gdy display:none, ale saved layout NIE jest modyfikowany ukryciem). **Pokazuje** karte **Map** (istnieje w DOM zawsze, ukryta w Advanced): textarea (~140px, 11px font) z zawartoscia mapy w wybranym formacie (select: Text / Array of strings / Array of arrays; zrodlo exportLegacy na flattenLayers z union bounds), odswiezana przy zmianach mapy (debounce ~300ms po onMutate/contentRev, NIE odswiezac gdy textarea ma focus - user moze wkleic wlasna); przyciski: [Load] (zielony; parseProject z textarea -> ta sama sciezka co paste-import: replace level + ReplaceCommand do historii + toast) i [Copy] (niebieski; kopiuje aktualna zawartosc textarea + toast + pop). To odtwarza UX starej wersji.
- **W Simplified** edycja nadal dziala na aktywnej warstwie (dane warstw/projektow nietkniete, tylko ukryte); undo/redo, legenda, generatory, autosave - bez zmian. Powrot do Advanced pokazuje wszystko z powrotem.
- **Kolizja trybu z DnD/centrowanie:** przelaczenie trybu -> przelicz centrowanie (szerokosci kolumn moga sie zmienic gdy karty znikaja); wywolac istniejacy mechanizm (centerOnPaper lub panX-shift - wybrac spojnie z dotychczasowym zachowaniem dropu).

- [ ] **Step 1:** mode.ts (stan, chooser, switch, klasa body) + CSS.
- [ ] **Step 2:** map.ts (karta Map: podglad/format/Load/Copy przez istniejace sciezki - zero duplikacji logiki importu/eksportu).
- [ ] **Step 3:** layout.ts tolerancja ukrytych + centrowanie przy przelaczeniu.
- [ ] **Step 4:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: swiezy profil -> chooser -> Simplified -> tylko Draw/Legend/Generate/Map widoczne + switch na gorze; malowanie odswieza textarea; edycja textarea + Load laduje mape (undo cofa); Copy dziala; przelaczenie na Advanced pokazuje wszystko; reload pamieta tryb; zero bledow konsoli; screenshoty obu trybow; kill + ps.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Add simplified mode with first run chooser and top switch"`

---

### Task 6: Docs + wersja 2.4.0 + pakowanie

**Files:**
- Modify: `README.md` (sekcje: Brush size, Dim other layers, Modes - simplified/advanced z opisem karty Map, ikony Lucide w Credits), `itch-page.md` (features + changelog "v2.4: simplified mode for classic workflow, brush sizes, layer dimming, icon polish"), `package.json` (`"version": "2.4.0"`)

- [ ] **Step 1:** Docs (ASCII, bez dlugich myslnikow; fact-check twierdzen vs kod) + wersja.
- [ ] **Step 2:** `npm run zip`; `unzip -l`; standalone.html file:// headless check - w tym chooser trybu przy swiezym profilu (jedna sesja, kill + ps).
- [ ] **Step 3:** `npm test` + `npm run build` zielone.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Document modes and polish, bump version to 2.4.0"`

---

## Self-Review (wykonany)

- **Prosby 1-10 pokryte:** 1 ikony (T1), 2 licznik na swatchu (T3), 3 rozmiar pedzla (T2), 4-5 typografia/W/H (T3), 6-7 uklad/full-height dropzone (T3), 8 dedup legacy (T3) + odpowiedz udzielona, 9 dim warstw (T4) + rekomendacja stalej zamiast gradacji, 10 tryby (T5).
- **Placeholdery:** brak; taski behawioralne wg konwencji planow v2.1-v2.3, logika (flattenWithSource) z TDD.
- **Spojnosc:** brushSize/dimOthers w EditorState (T2/T4); forEachFootprintCell jedna implementacja; karta Map uzywa exportLegacy/parseProject/ReplaceCommand z istniejacych modulow (zero duplikacji); layout.ts styka sie z T3 (full-height) i T5 (ukryte karty) - T5 po T3 sekwencyjnie.
- **Ryzyko:** pointer-events przy full-height dropzone (jawny test kliku w mape w T3); cache flatten przy dim (jawny wybor w T4); chooser bez sciezki ucieczki (decyzja implementera z adnotacja w T5).
