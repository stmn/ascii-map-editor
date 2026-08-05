# v2.1 Design: Warstwy, Projekty/Poziomy (IndexedDB), Undo/Redo

Status: zatwierdzony przez Darka 2026-08-05 (kierunek + dekompozycja + model warstw "dowolne nazwane").
Kontekst: rozbudowa ASCII Level Editor v2 (branch v2, wydanie 2.0 w finalizacji) jako produktu na itch.io.
Cel biznesowy: atrakcyjnosc narzedzia dla obcych userow (gamedev), argument za platnym standalone (PWYW $2).

## Zasady niezmienne (dziedziczone z v2.0)

- Zero runtime dependencies; 100% client-side; dziala w iframe itch.io i jako single-file standalone.
- Stylistyka v1 (Press Start 2P, kremowy papier, karty z czarnymi ramkami) - patrz style-guide.
- Czysta logika w modulach TS bez DOM, testowana Vitestem; UI cienka warstwa.
- UI po angielsku, komentarze PL bez diakrytykow, bez dlugich myslnikow, commity jednolinijkowe EN.

## Non-goals (swiadomie poza zakresem v2.1)

Narzedzia edycji (zaznaczanie/fill/stemple), import TMX, sharing przez URL, collab, backend,
persystencja historii undo, warstwy per-legend.

## Dekompozycja: trzy etapy, kazdy osobno wydawalny

- Etap A (wydanie 2.1): Warstwy - zmienia format danych i eksportery, idzie pierwszy.
- Etap B (wydanie 2.2): Projekty + poziomy + IndexedDB - magazyn przechowuje gotowy format v3.
- Etap C (wydanie 2.3): Undo/redo - operacje juz layer-aware.

Kazdy etap: wlasny plan implementacji (writing-plans) + SDD + aktualizacja itch.

## Etap A: Warstwy

### Model danych

- `Level = { layers: Layer[], legend: LegendEntry[] }`; `Layer = { id, name, visible, grid: Grid }`.
- Limit 8 warstw (REXPaint toleruje do 9; cap chroni UI i wydajnosc). Add wylaczone przy capie.
- Jedna wspolna legenda na poziom (nie per warstwa) - spojne kolory/nazwy we wszystkich eksportach.
- Wszystkie warstwy dziela jeden uklad wspolrzednych. Union bounds = suma bounds warstw.
- Aktywna warstwa = stan edytora (runtime), nie czesc formatu.
- Nowy modul `src/core/level.ts`: model + `unionBounds(layers)` + `flattenLayers(layers): Grid`
  (najwyzsza widoczna warstwa wygrywa w komorce). Grid i Legend bez zmian.

### Format v3 + kompatybilnosc

```json
{ "app": "ascii-level-editor", "version": 3, "legend": [...],
  "layers": [{ "name": "ground", "visible": true, "origin": [x, y], "lines": ["..."] }] }
```

- parseProject czyta v3 ORAZ dotychczasowe: v2 i wszystkie warianty v1 -> jedna warstwa "main".
- serializeProject emituje v3.

### Rendering i input

- Renderer rysuje widoczne warstwy od dolu do gory (nadpisywanie znakow), pelna nieprzezroczystosc.
- Papier obejmuje union bounds (+1 padding), jak dotad.
- Malowanie/gumka/hover -> tylko aktywna warstwa. `legend.syncWith` na unii usedChars wszystkich warstw.

### UI: karta "Layers"

Miedzy Draw a Legend. Wiersz per warstwa: przycisk oka (widocznosc), input nazwy, strzalki
gora/dol (kolejnosc), usun (confirm gdy niepusta). Aktywny wiersz podswietlony (akcent v1).
Przycisk "Add layer" (niebieski). Nowa warstwa: "layer N", widoczna, pusta, staje sie aktywna.

### Eksportery (wszystkie na union bounds - pliki per warstwa sie pokrywaja pozycyjnie)

- TMX: jedna `<layer>` per warstwa (nazwy z modelu), wspolny tileset/gid z legendy. Niewidoczne
  warstwy: eksportowane z atrybutem `visible="0"` (zachowanie informacji, zgodne z Tiled).
- Godot: `const TILES` wspolne; `const LEVELS = { "ground": [...], ... }` per warstwa;
  `func load_layer(tile_map: TileMapLayer, layer_name: String, source_id := 0)`.
- KaPlay: jeden `addLevel` per WIDOCZNA warstwa, linie padowane do union bounds, wspolne tiles.
- TXT/CSV: dropdown "Export scope": Active layer | Flattened. Oba na union bounds.
- .xp: `layerCount = layers.length`, warstwa 1 = najnizsza; import .xp z N warstwami -> warstwy
  "layer 1..N" + kolory do legendy. Roundtrip w testach.
- project.json: v3 jak wyzej.

### Autosave

Do czasu Etapu B: localStorage jak dotad, ale w formacie v3.

### Testy (TDD)

level.ts (union/flatten), project v3 roundtrip + import v2/v1, tmx N warstw + visible=0,
godot LEVELS/load_layer, kaplay padding, xp multi-layer roundtrip. UI smoke przez CDP.

## Etap B: Projekty + poziomy + IndexedDB

### Storage

- IndexedDB, baza `ascii-level-editor` v1, promisowany wrapper wlasny (~60 linii, `src/core/db.ts`).
- Store `projects` (keyPath `id`): `{ id, name, createdAt, updatedAt }`.
- Store `levels` (keyPath `id`, index `projectId`): `{ id, projectId, name, order, data: string (JSON v3), thumb: dataURL | null, updatedAt }`.
- Id: `crypto.randomUUID()`.

### UI: karta "Project" (na gorze sidebara)

- Dropdown projektow + akcje: New/Rename/Delete project (Delete z confirm, kasuje poziomy).
- Lista poziomow projektu: miniatura (~120x80, render flattened przy zapisie/przelaczeniu),
  nazwa (inline rename), New level, Duplicate, Delete (confirm). Klik = przelaczenie
  (zapis biezacego -> wczytanie wybranego).
- Footer karty: Export workspace / Import workspace (jeden JSON ze wszystkimi projektami
  i poziomami; import dodaje z nowymi id - merge-add, bez nadpisywania).

### Autosave i migracja

- Debounce 500 ms -> rekord biezacego poziomu w IndexedDB (zastepuje localStorage).
- Migracja przy pierwszym uruchomieniu: istniejacy klucz localStorage -> projekt "My project",
  poziom "Level 1"; po udanej migracji klucz przenoszony na `-backup` (nie kasujemy danych).
- Fallback bez IndexedDB (np. tryb prywatny Safari): tryb jednopoziomowy na localStorage
  + zolty toast ostrzegawczy.
- Wiele kart: last-writer-wins (bez lockowania; odnotowane w README).

## Etap C: Undo/redo

### Model

- `src/core/history.ts`: stos komend z inwersja, cap 100, redo czyszczone przy nowej akcji.
- Komendy: `StrokeCommand` (jeden gest malowania/gumki; lista `{x, y, layerId, before, after}`),
  `ReplaceCommand` (snapshot poziomu przed/po: generate, import, clear warstwy),
  `LayerOpCommand` (add/remove/reorder/rename/visibility z inwersja),
  `LegendEditCommand` (name/color przed/po).
- Sesyjny, per poziom (przelaczenie poziomu czysci historie - odnotowane w UI subtelnie).

### UI/skroty

- Ctrl+Z / Ctrl+Shift+Z (i Ctrl+Y), z guardem isTypingTarget; male przyciski undo/redo
  w karcie Draw. Po undo/redo: markDirty + autosave + refresh legendy/warstw.

### Testy

TDD history.ts: apply/undo/redo, inwersje wszystkich komend, cap, kolejnosc redo.

## Ryzyka i notatki

- KaPlay: wiele addLevel wymaga rownego paddingu linii - stad union bounds wszedzie.
- .xp multi-layer: format natywnie wspiera warstwy; weryfikacja strukturalna roundtrip.
- IndexedDB w iframe itch dziala (same-origin per gra); Safari private mode -> fallback.
- Miniatury trzymac male (dataURL ~kilka KB), generowane przy przelaczeniu/zapisie, nie co klatke.
- Monetyzacja bez zmian: web darmowy w pelni, standalone platny PWYW (sugerowane $2).

## Spec self-review (wykonany)

- Placeholdery: brak. Spojnosc: format v3 uzywany przez A i B; undo operuje na modelu z A. OK.
- Zakres: kazdy etap miesci sie w jednym planie implementacyjnym.
- Niejednoznacznosci usuniete: bounds eksportow = union; legenda wspolna; aktywna warstwa poza
  formatem; niewidoczne warstwy w TMX z visible="0", w KaPlay pomijane; import workspace = merge-add.
