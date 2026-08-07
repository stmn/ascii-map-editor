# v2.9 Sidebar Auto-hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realizacja zatwierdzonego specu docs/superpowers/specs/2026-08-06-v29-sidebar-autohide-design.md: stale centrowanie wzgledem srodka ekranu (mapa na pelne okno), sidebary jako nakladki z opcjonalnym auto-chowaniem (waski pasek przy krawedzi, plynne wysuwanie przy zblizeniu kursora), pinezka per strona (domyslnie przypiete = obecne zachowanie).

**Architecture:** T1 upraszcza centrowanie (usuwa cala maszynerie kompensacji szerokosci sidebarow), T2 dodaje auto-hide + pinezki na tak uproszczonym gruncie. Sidebary juz sa position:fixed nad canvasem - "overlay" realizuje sie przez zmiane centrowania, nie przez przebudowe layoutu.

**Tech Stack:** jak dotad. Zero runtime deps.

## Global Constraints

- WSZYSTKO LOKALNIE: zadnego push/remote. Commity lokalne, angielskie, jednolinijkowe, bez Co-Authored-By.
- UI po angielsku; komentarze PL bez diakrytykow; NIGDY dlugich myslnikow - tylko "-". Stylistyka v1 (bez gradientow/box-shadow; przejscia transform dozwolone).
- Headless Chrome ZAWSZE z --use-mock-keychain; wlasny vite --port 5190 --strictPort (serwer usera na 5173 NIETYKALNY); jedna sesja CDP per task UI; po niej kill + ps/lsof.
- Zero duplikacji i zero martwego kodu (usuwane funkcje maja zniknac wraz z wywolaniami).
- Ikony: inline Lucide w src/ui/icons.ts, STROKE_WIDTH='3'.
- Simplified (replika v1) NIETKNIETE - auto-hide wylaczone w mode-simplified.
- Branch: `v29-sidebar-autohide` od `main`. Po ukonczeniu: lokalny merge.

## File Structure

```
src/ui/renderer.ts           # MOD (T1): centeredPan liczone z okna, bez sidebarow
src/app.ts                   # MOD (T1): wywolania centeredPan bez parametrow sidebarow
src/ui/layout.ts             # MOD (T1): USUNAC sidebarWidths/viewOffset/withOffsetShift; MOD (T2): persystencja pinezek
src/ui/panels.ts             # MOD (T1): USUNAC shiftView i kompensacje przy mode switch / drop karty
src/ui/autohide.ts           # NOWY (T2): logika auto-chowania (proximity, opoznienia, stany wymuszone)
src/ui/icons.ts              # MOD (T2): pin, pin-off
src/styles.css               # MOD (T2): transform/transition sidebarow, pasek krawedzi, przycisk pinezki
README.md, itch-page.md, package.json  # MOD (T3): docs + 2.9.0
```

---

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/darek/Code/level-editor && git checkout -b v29-sidebar-autohide main`

---

### Task 1: Stale centrowanie wzgledem srodka ekranu

**Files:**
- Modify: `src/ui/renderer.ts`, `src/app.ts`, `src/ui/layout.ts`, `src/ui/panels.ts`

**Zachowanie (spec pkt 1):**
- `centeredPan` liczy pan wylacznie z wymiarow okna/canvasa - srodek mapy laduje w srodku EKRANU, bez odejmowania szerokosci sidebarow. Sprawdz obecna sygnature i wywolania (renderer.ts, app.ts, center fab) - fab dziala jak dotad (prog ~2px na roznicy pan od centeredPan), zoom/pan/resize aktualizuja widocznosc bez zmian.
- USUNAC jako martwe wraz z wywolaniami: `sidebarWidths`, `viewOffset`, `withOffsetShift` (layout.ts), `shiftView`/kompensacje przesuniecia przy przelaczeniu trybu i przy drop karty (panels.ts, layout.ts onLayoutChange -> uproscic sygnature jesli offsetShift przestaje istniec; drop karty NIE rusza juz widoku). Grep po nazwach na koncu: zero trafien.
- Przelaczenie trybu Advanced/Simplified NIE przesuwa widoku (dotad kompensowalo zmiane szerokosci kolumn - po zmianie centrowania kompensacja jest bezprzedmiotowa).
- Zadnych zmian w historii/zapisie - pan jest sesyjny.

- [ ] **Step 1:** Implementacja + usuniecie martwych funkcji.
- [ ] **Step 2:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP (--use-mock-keychain, port 5190): boot -> mapa wysrodkowana wzgledem OKNA (zmierz: srodek bounding boxa narysowanych komorek ~= innerWidth/2 z tolerancja komorki); klik fab po odsunieciu -> centruje do srodka okna; przelaczenie trybu i drag karty miedzy kolumnami NIE ruszaja pan (odczytaj view przed/po); fab pojawia sie/znika poprawnie; zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "Center view on window instead of free area"`

---

### Task 2: Auto-chowanie sidebarow + pinezki

**Files:**
- Create: `src/ui/autohide.ts`
- Modify: `src/ui/layout.ts`, `src/ui/icons.ts`, `src/styles.css`, `src/ui/panels.ts` (lub app.ts - wpiecie)

**Zachowanie (spec pkt 2-6):**
1. **Pinezka:** u gory kazdego sidebara maly przycisk ikonowy (ikony Lucide `pin` [przypiety] / `pin-off` [auto-hide], STROKE_WIDTH 3, aria-label 'Pin sidebar'/'Unpin sidebar', title). DOMYSLNIE PRZYPIETE. Stan per strona w zapisie layout2 jako pole `unpinned: string[]` (wartosci 'left'/'right'; brak pola = oba przypiete, wstecznie zgodne - wzorzec pola `closed` z v2.8).
2. **Auto-hide (strona odpieta):** sidebar chowa sie przesunieciem transform poza krawedz, zostawiajac WASKI PASEK (~16px, klikalne/hoverowalne "ucho" - wystajacy fragment sidebara, nie osobny element, np. transform: translateX(calc(100% - 16px))). Wysuniecie: kursor w strefie krawedzi (<=48px od krawedzi okna) LUB nad paskiem/sidebar-em -> plynne wysuniecie (CSS transition transform ~150ms). Schowanie: kursor opuszcza sidebar I strefe krawedzi -> opoznienie ~400ms -> chowa. Nasluch pointermove na window (tani - porownanie clientX z progami), timery sprzatane.
3. **Stany wymuszajace wysuniecie (nie chowa sie, dopoki trwaja):** przeciaganie karty (istniejaca klasa drag-active), otwarty modal (isModalOpen z modal.ts), fokus klawiatury wewnatrz sidebara (focusin/focusout), otwarty spinner/select natywny nie wymaga specjalnej obslugi. Po ustaniu stanu - normalna logika proximity.
4. **Overlay:** sidebary pozostaja position:fixed; chowanie/wysuwanie NIE zmienia centrowania (po T1 centrowanie i tak ignoruje sidebary) ani nie wywoluje recenter. Canvas pod spodem klikalne tylko tam, gdzie sidebar nie zaslania (pointer-events juz tak dzialaja - karty lapia zdarzenia, przerwy nie; schowany sidebar ma lapac zdarzenia TYLKO na pasku).
5. **Simplified:** body.mode-simplified wylacza auto-hide calkowicie (oba sidebary zachowuja sie jak przypiete; przyciski pinezki UKRYTE w Simplified). Przelaczenie trybu w trakcie schowania -> sidebar wraca na miejsce.
6. **DnD:** drop karty dziala na wysunietym sidebrze; syncEmpty/kreskowana strefa bez zmian.

- [ ] **Step 1:** icons.ts (pin/pin-off) + styles (transform/transition, pasek, przycisk pinezki).
- [ ] **Step 2:** autohide.ts (stan per strona, proximity, timery, stany wymuszone) + persystencja `unpinned` w layout.ts + wpiecie.
- [ ] **Step 3:** Weryfikacja: `npm test` + `npm run build`; JEDNA sesja CDP: odepnij prawy -> chowa sie do paska po ~400ms od odjechania kursora (zmierz transform przed/po); najedz kursorem blisko krawedzi -> wysuwa sie plynnie; przypnij -> zostaje na stale; stan przezywa reload (localStorage); drag karty przy odpietym -> nie chowa sie w trakcie; otwarty modal -> nie chowa sie; fokus Tab w sidebarze -> nie chowa sie; Simplified -> pinezki ukryte, sidebary normalne; pan/centrowanie NIE zmienia sie przy wysuwaniu/chowaniu (view.pan przed/po identyczne); zero bledow konsoli; kill + ps/lsof.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "Add sidebar auto-hide with per side pin toggles"`

---

### Task 3: Docs + wersja 2.9.0 + pakowanie

**Files:**
- Modify: `README.md` (sekcja o sidebarach: pinezki/auto-hide, stale centrowanie do srodka okna; drzewo plikow +autohide.ts; usuniete wzmianki o kompensacji przesuniec jesli istnieja), `itch-page.md` (changelog "v2.9: auto-hiding sidebars with pin toggles, window-centered view"), `package.json` ("version": "2.9.0")

- [ ] **Step 1:** Docs (ASCII, fact-check przeciw kodowi) + wersja.
- [ ] **Step 2:** `npm run zip`; `unzip -l`; standalone file:// check (jedna sesja, --use-mock-keychain, screenshot, kill + ps).
- [ ] **Step 3:** `npm test` + `npm run build` zielone.
- [ ] **Step 4: Commit.** `git add README.md itch-page.md package.json && git commit -m "Document sidebar autohide and bump version to 2.9.0"`

---

## Self-Review (wykonany)

- Spec pokryty: pkt 1 (T1: window-center + usuniecie maszynerii), pkt 2-5 (T2: overlay/proximity/pinezki/stany wymuszone), pkt 6 (Simplified off). Kolejnosc T1 przed T2 celowa - auto-hide na uproszczonym centrowaniu.
- Placeholdery: brak; progi (16px pasek, 48px strefa, 150ms transition, 400ms delay, 2px fab) jawne.
- Ryzyka nazwane: pointer-events schowanego sidebara (tylko pasek), fokus klawiatury, przelaczenie trybu w trakcie schowania.
