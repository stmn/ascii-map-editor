# v2.9 Sidebar auto-hide - zatwierdzony spec (2026-08-06)

Decyzje usera (rozmowa 2026-08-06, po v2.7.1/v2.8):

1. **Centrowanie ZAWSZE wzgledem srodka ekranu** (decyzja: "niech bedzie stale centrowanie
   wzgledem srodka ekranu"). Mapa/canvas na pelne okno; centeredPan liczy sie z window,
   bez szerokosci sidebarow. KONSEKWENCJA-UPROSZCZENIE: sidebarWidths/viewOffset/withOffsetShift
   (layout.ts) i shiftView (panels.ts) przestaja byc potrzebne - usunac (zero martwego kodu);
   fab centrowania dalej dziala (prog na roznicy pan od centeredPan).
2. **Sidebary jako nakladki (overlay) nad mapa** - nie elementy ukladu; wysuniecie/schowanie
   NIE przesuwa widoku.
3. **Auto-chowanie**: schowany sidebar zostawia waski pasek przy krawedzi; wysuwa sie plynnie
   (CSS transition ~150ms), gdy kursor blisko krawedzi; chowa z malym opoznieniem po odjechaniu.
4. **Pinezka** u gory kazdego sidebara (osobno lewy/prawy), zapamietywana w localStorage.
   DOMYSLNIE PRZYPIETE (obecne zachowanie - nikt nie dostaje zmiany, dopoki nie odepnie).
5. **Stany przypinajace na czas trwania**: drag & drop kart, otwarty dropdown/modal - sidebar
   nie chowa sie w trakcie.
6. **Simplified bez zmian** (replika v1).

Kolejnosc wydan: v2.7.1 (szlify) -> v2.8 (redesign Export/Import, plan istnieje) -> v2.9 (ten spec).
