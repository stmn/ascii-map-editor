# v2.8 IO Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pelny redesign Export/Import (decyzja usera 2026-08-06: "pelny redesign"): jeden dialog Export z przelacznikiem level/project, opisami formatow i uczciwa informacja o warstwach, [Copy][Save file] wszedzie; jeden dialog Import z autodetekcja typu i wyborem akcji po rozpoznaniu; KaPlay wraca do JEDNEGO addLevel (uwaga usera: "addLevel to nie jest dla warstw"); dropdowny w karcie Project zastapione dwoma zwyklymi przyciskami; menu.ts usuniete jako martwe.

**Architecture:** Nowy modul detekcji importu w core (TDD), przebudowa obu modali, poprawka eksportera KaPlay (TDD). Simplified (replika v1: To clipboard/Load/SWITCH FORMAT) NIETKNIETE.

**Tech Stack:** jak dotad. Zero runtime deps.

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote. Commity lokalne, angielskie, jednolinijkowe, bez Co-Authored-By.
- UI po angielsku; komentarze PL bez diakrytykow; NIGDY dlugich myslnikow - tylko "-". Stylistyka v1.
- Headless Chrome ZAWSZE z --use-mock-keychain; wlasny vite --port 5190 --strictPort (serwer usera na 5173 NIETYKALNY); jedna sesja CDP per task UI; po niej kill + ps/lsof.
- Zero duplikacji; zero martwego kodu (menu.ts po usunieciu dropdownow LECI, wraz ze stylami .menu-*).
- Branch: `v28-io-redesign` od `main` (po zmergowaniu patcha v271-polish). Po ukonczeniu: lokalny merge.

## File Structure

```
src/export/kaplay.ts         # MOD (T1): jeden addLevel z wybranej siatki
tests/export.test.ts (lub istniejacy plik testow kaplay)  # MOD (T1)
src/core/importDetect.ts     # NOWY (T2): detekcja typu wsadu + podsumowanie
tests/importDetect.test.ts   # NOWY (T2)
src/ui/panels/exportModal.ts # MOD (T3): redesign
src/ui/panels/importModal.ts # MOD (T4): redesign z autodetekcja
src/ui/panels/project.ts     # MOD (T5): dwa zwykle przyciski
src/ui/menu.ts               # DELETE (T5)
src/styles.css               # MOD (T3-T5)
README.md, itch-page.md, package.json  # MOD (T6): docs + 2.8.0
```

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v28-io-redesign main`

---

### Task 1: KaPlay - jeden addLevel (TDD)

**Files:**
- Modify: `src/export/kaplay.ts`, testy kaplay (znajdz istniejacy plik testow eksporterow)

**Zachowanie:**
- `exportKaplay(level, grid?)` - sygnatura dostaje OPCJONALNA siatke zrodlowa (Grid): gdy podana, snippet buduje sie z niej; gdy nie, z flatten widocznych warstw (domyslne "All merged"). Wynik: `const tiles = {...}` (jak dotad, z legendy) + JEDEN `addLevel([...])`. Zadnego bloku per warstwa, zadnych komentarzy "// layer:".
- Wyrownanie: linie z toLines(bounds) siatki zrodlowej (bounds tej siatki, nie union warstw - eksportujemy jedna siatke).
- TDD: poziom z 2 warstwami (nakladajace sie komorki) -> dokladnie JEDNO wystapienie "addLevel" w wyniku; komorka nakryta wyzsza warstwa ma znak wyzszej (flatten top-wins); wariant z przekazana siatka aktywnej warstwy daje znak tej warstwy. Istniejacy test KaPlay zaktualizowac (byl na bloki per warstwa).
- Flatten poziomu istnieje juz w codebase (flattenWithSource/renderer albo core) - UZYC wspolnej sciezki, nie pisac drugiej (zero duplikacji). Jesli flatten jest w ui/, wyciagnac czysta funkcje do core/level.ts i uzyc w obu miejscach.

- [ ] **Step 1:** Test FAIL -> implementacja -> PASS; `npm test` + `npm run build` (UWAGA: exportModal.ts moze wolac stara sygnature - dopuszczalny stan przejsciowy jak w poprzednich etapach: `npx tsc --noEmit 2>&1 | grep -v 'src/ui/'` puste; pelny build wraca w T3).
- [ ] **Step 2: Commit.** `git add -A && git commit -m "Emit single addLevel in kaplay export"`

---

### Task 2: Detekcja importu (TDD)

**Files:**
- Create: `src/core/importDetect.ts`, `tests/importDetect.test.ts`

**Interfaces:**
- Produces:

```ts
export type DetectedImport =
  | { kind: 'level'; level: Level; summary: string }        // np. "Level 24x12, 3 layers"
  | { kind: 'project'; name: string; levels: number; json: string; summary: string }   // "Project 'Dungeon', 5 levels"
  | { kind: 'projects'; projects: number; levels: number; json: string; summary: string }; // legacy workspace: "2 projects, 7 levels"

export function detectImport(payload: string | Uint8Array): DetectedImport
// Uint8Array (plik binarny): proba .xp (parseXpBytes) -> kind 'level'.
// String: kolejno - project v1 / legacy workspace (po polu app, przez logike z store.ts) -> 'project'/'projects';
// nastepnie parseProject (level.json v3/v2/v1, warianty array, plain text) -> 'level'.
// Nic nie pasuje -> throw Error('Unrecognized import data').
```

- Rozpoznanie project/workspace NIE duplikuje walidacji ze store.ts - wyciagnac z importProject wspolny parser naglowka (np. wewnetrzny `parseProjectFile(json)`) i uzyc w obu miejscach; importProject dalej robi wlasciwy merge-add. Summary liczone z realnych danych (wymiary z union bounds warstw, liczba warstw/poziomow).
- TDD: po jednym tescie na kazda galaz (xp bytes, project v1, legacy workspace, level v3 json, v1 array-text, plain text, smieci -> throw); summary dokladnie w formatach "Level {W}x{H}, {N} layer(s)" / "Project '{name}', {N} level(s)" / "{P} projects, {L} levels".

- [ ] **Step 1:** Testy FAIL -> implementacja -> PASS; `npm test` (pelny build moze dalej byc w stanie przejsciowym z T1).
- [ ] **Step 2: Commit.** `git add -A && git commit -m "Add import payload detection with human summaries"`

---

### Task 3: Redesign dialogu Export

**Files:**
- Modify: `src/ui/panels/exportModal.ts`, `src/styles.css`

**Zachowanie:**
1. **Naglowek dialogu:** przelacznik zakresu jak pill trybow: `This level` / `Whole project` (segmented, klasa jak istniejacy mode-pill; domyslnie This level).
2. **This level - lista formatow** jako wiersze (radio-rows, klik zaznacza): kazdy wiersz ma nazwe, jednolinijkowy opis i badge warstw w STALYM miejscu:
   - `TXT` - "Plain text grid, one char per cell" - `layers: flattened`
   - `CSV` - "Comma separated grid" - `layers: flattened`
   - `KaPlay` - "addLevel snippet for kaplayjs.com" - `layers: flattened`
   - `Godot` - "GDScript dictionaries, one per layer" - `layers: kept`
   - `Tiled .tmx` - "One tile layer per editor layer" - `layers: kept`
   - `REXPaint .xp` - "Native multi-layer format" - `layers: kept`
   - `Level .json` - "Full level for re-import: layers and legend" - `layers: kept`
   - `Legacy v1` - "Array formats of the original editor" - `layers: flattened`
3. **Opcje kontekstowe pod wybranym formatem** (tylko gdy dotycza):
   - TXT/CSV: `Layers:` All merged / Active layer / Each layer separately (nowa opcja: bloki rozdzielone linia `:: {nazwa warstwy}` w TXT, pusta linia + `# {nazwa}` w CSV - proste, parsowalne wzrokiem).
   - KaPlay/Legacy: `Layers:` All merged / Active layer (bez "each" - jeden addLevel / jeden format v1).
   - Legacy: dodatkowo istniejacy wybor wariantu (text/array-text/array-array) jako druga linia opcji (SWITCH FORMAT zostaje TYLKO w Simplified).
   - Formaty `layers: kept`: bez opcji warstw.
4. **Akcje - zawsze te same dwa przyciski w tym samym miejscu:** `[Copy]` `[Save file]`. Copy kopiuje tresc do schowka, Save pobiera plik (nazwy jak dotad: map.txt/map.csv/kaplay.js/godot.gd/map.tmx/map.xp/level.json/legacy.txt - zachowaj istniejace). Wyjatek: `.xp` jest binarny - Copy disabled z title "Binary format - save as file". Toast po akcji jak dotad.
5. **Podglad na zywo** jak obecnie (dla .xp podglad tekstowy pierwszej warstwy lub informacja "binary" - zachowac obecne zachowanie podgladu).
6. **Whole project:** opis "Whole project '{name}' with all its levels as project.json" + te same [Copy] [Save file] (Copy kopiuje JSON). Sciezka exportProjectFile z project.ts przenosi sie/wywoluje stad - JEDNA implementacja (project.ts przekazuje kontekst store/projectId do modalu przy otwarciu).
7. Stary dropdown Scope (Active/Flattened) ZNIKA - zastapiony opcja "Layers" per format. Stara zakladka/lista przyciskow tez znika.
8. KRYTERIUM: pelny `npm run build` znow zielony (koniec stanu przejsciowego z T1).

- [ ] **Step 1:** Implementacja + style (wiersze formatow, badge, segmented, opcje).
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: przeklik KAZDEGO formatu x [Copy] i [Save file] (tresc niepusta i sensowna; KaPlay ma dokladnie jeden addLevel; TXT each-layer ma bloki per warstwa), opcje pojawiaja sie tylko przy wlasciwych formatach, badge zgodne z tabela, przelacznik project -> Copy/Save daja project.json, .xp Copy disabled; zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Redesign export dialog with scope switch and format rows"`

---

### Task 4: Redesign dialogu Import (autodetekcja)

**Files:**
- Modify: `src/ui/panels/importModal.ts`, `src/styles.css`

**Zachowanie:**
1. **Krok 1 - wsad:** pole pliku (file input, dowolne rozszerzenie) LUB textarea na wklejenie - jak teraz, ale bez zadnych przelacznikow typu. Po wybraniu pliku/wpisaniu tekstu automatycznie leci detectImport (dla pliku: proba tekstowa, dla .xp bytes).
2. **Krok 2 - rozpoznanie:** dialog pokazuje summary z detectImport i TYLKO adekwatne akcje:
   - kind 'level': `Level 24x12, 3 layers` -> `[Replace current level]` `[Add as new level]` (Add tworzy nowy poziom w biezacym projekcie sciezka jak "New level" + wgrywa dane; disabled gdy brak store'a, z krotkim hintem).
   - kind 'project': `Project 'X', N levels` -> `[Add project]` (istniejaca sciezka importProject; disabled bez store'a).
   - kind 'projects' (legacy workspace): `P projects, L levels` -> `[Add projects]`.
   - blad detekcji: czerwony komunikat w dialogu (nie toast), wsad zostaje do poprawy.
3. Zamkniecie/Esc jak dotad; po udanej akcji toast + odswiezenie karty Project (istniejace sciezki refresh/applyLevelToPanels; snapshot licznika bledow zapisu jak dotad).
4. "Replace current level" przechodzi przez historie (istniejaca sciezka replaceCommand) - undo dziala; "Add as new level" i "Add project(s)" to operacje na store (bez historii, jak dotychczasowy import projektu).
5. Import project/level z karty Project otwiera TEN SAM dialog (project.ts w T5 podpina jeden przycisk Import).

- [ ] **Step 1:** Implementacja + style.
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: wklej TXT -> "Replace/Add as new level" dzialaja oba (undo cofa replace; Add tworzy poziom widoczny w Project); plik level.json, project.json, legacy workspace.json, .xp -> wlasciwe summary i akcje; smieci -> czerwony komunikat; zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Redesign import dialog around payload detection"`

---

### Task 5: Karta Project - dwa zwykle przyciski; menu.ts OUT

**Files:**
- Modify: `src/ui/panels/project.ts`, `src/ui/panels.ts`, `src/styles.css`
- Delete: `src/ui/menu.ts`

**Zachowanie:**
- Rzad io w karcie Project: dwa zwykle przyciski `[Export...]` `[Import...]` (50/50, niebieski/zielony jak dawniej) otwierajace nowe dialogi. Zadnych dropdownow. Sciezki exportProjectFile/importProjectFile wywolywane odtad z dialogow (T3/T4) - project.ts przekazuje modalom store/projectId przy inicie/otwarciu; usun z project.ts nieuzywane juz elementy (fileInput dropdownu itd.).
- `src/ui/menu.ts` USUNAC wraz ze stylami `.menu-*` w styles.css (zero martwego kodu). Grep na 'menuButton|closeAnyMenu|menu-panel|menu-trigger' po src/ ma byc pusty.
- Degenerate galezie karty: przycisk Export otwiera dialog (zakres project disabled bez store'a - dialog dostaje null i pokazuje sekcje project jako disabled z hintem); Import analogicznie (akcje store-owe disabled).

- [ ] **Step 1:** Implementacja + usuniecie menu.ts/styli.
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: dwa przyciski otwieraja dialogi, przeklik smoke (jeden format Copy, jeden import paste), grep martwego kodu pusty; zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Replace project io dropdowns with plain dialog buttons"`

---

### Task 7 (poprawka ownera 2026-08-06, wykonywana PO Task 5, PRZED Task 6): Zapamietywanie zwiniecia akordeonow

**Files:**
- Modify: `src/ui/layout.ts`, ewentualnie `src/ui/panels.ts`

**Zachowanie:**
- Stan zwiniecia kazdej karty (<details open>) jest zapamietywany i odtwarzany miedzy sesjami. Rozszerzenie istniejacego zapisu 'ascii-level-editor-layout2' o pole `closed: string[]` (id sekcji zwinietych; brak pola = wszystko otwarte, wstecznie zgodne). applySavedLayout ustawia atrybut open PRZED pierwszym paintem (ten sam moment co kolejnosc kart - bez migniecia). Zapis przy kazdym zdarzeniu 'toggle' na <details> (nasluch podpinany w initLayout obok bindCard). Karty ukryte przez tryb (map/extra w Advanced) zachowuja swoj zapisany stan - display:none nie rusza atrybutu open.
- TDD tam, gdzie sie da bez DOM (serializacja/deserializacja closed w read/save - jesli logika jest czysto DOM-owa, wystarczy weryfikacja CDP).

- [ ] **Step 1:** Implementacja.
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: zwin 2 karty -> reload -> zwiniete te same; stary zapis bez pola closed dziala (wszystko otwarte); zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Persist accordion collapsed state in layout storage"`

---

### Task 6: Docs + wersja 2.8.0 + pakowanie

**Files:**
- Modify: `README.md` (sekcje Export/Import dialogow od nowa: zakresy w dialogu, badge warstw, Copy/Save, autodetekcja importu z akcjami, KaPlay jeden addLevel; drzewo plikow: +importDetect.ts, -menu.ts), `itch-page.md` (changelog "v2.8: redesigned export and import dialogs, honest layer handling, import auto-detection"), `package.json` ("version": "2.8.0")

- [ ] **Step 1:** Docs (ASCII, fact-check przeciw kodowi) + wersja.
- [ ] **Step 2:** `npm run zip`; `unzip -l`; standalone file:// check (jedna sesja, --use-mock-keychain, kill + ps).
- [ ] **Step 3:** `npm test` + `npm run build` zielone.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Document io redesign and bump version to 2.8.0"`

---

## Self-Review (wykonany)

- Decyzje usera pokryte: pelny redesign (zatwierdzony), KaPlay jeden addLevel (uwaga o addLevel), warstwy uczciwie opisane per format, dropdowny out (menu.ts bez uzyc -> delete), autodetekcja importu z "Add as new level".
- Placeholdery: brak; DetectedImport i sygnatura exportKaplay jawne; stan przejsciowy T1->T3 jawny.
- Zero duplikacji: flatten wspolny (ekstrakcja do core jesli trzeba), parser naglowka projektu wspolny ze store.ts, exportProjectFile jedna sciezka.
- Simplified nietkniete (replika v1 ma wlasne To clipboard/Load/SWITCH FORMAT).
