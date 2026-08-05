import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createLevel, makeLayer } from '../src/core/level';
import { exportGodot } from '../src/export/godot';

describe('godot export', () => {
  it('LEVELS per warstwa, wspolne TILES, load_layer', () => {
    const lv = createLevel();
    lv.layers[0]!.grid = Grid.fromLines(['#@']);
    lv.layers.push(makeLayer('deco', Grid.fromLines(['~'], 2, 0)));
    lv.legend.syncWith(['#', '@', '~']);
    const out = exportGodot(lv);
    expect(out).toContain('const LEVELS = {');
    expect(out).toContain('"main": [');
    expect(out).toContain('"deco": [');
    expect(out).toContain('"#@ "');
    expect(out).toContain('"  ~"');
    expect(out).toContain('"#": Vector2i(0, 0)');
    expect(out).toContain('func load_layer(tile_map: TileMapLayer, layer_name: String, source_id: int = 0) -> void:');
    expect(out).toContain('set_cell(Vector2i(x, y), source_id, TILES[ch])');
  });

  it('duplikaty nazw warstw dostaja przyrostek w kluczu, bez zdublowania w wyniku', () => {
    const lv = createLevel();
    lv.layers[0]!.name = 'dup';
    lv.layers[0]!.grid = Grid.fromLines(['#']);
    lv.layers.push(makeLayer('dup', Grid.fromLines(['@'])));
    const out = exportGodot(lv);
    expect(out).toContain('"dup": [');
    expect(out).toContain('"dup (2)": [');
    // klucz "dup" ma wystapic dokladnie raz jako klucz slownika (nie jako czesc "dup (2)")
    const dupKeyOccurrences = out.split('"dup":').length - 1;
    expect(dupKeyOccurrences).toBe(1);
  });

  it('dedupe kluczy dziala tez przy literalnej nazwie rownej sufiksowi', () => {
    const lv = createLevel();
    lv.layers[0]!.name = 'dup';
    lv.layers[0]!.grid = Grid.fromLines(['#']);
    lv.layers.push(makeLayer('dup', Grid.fromLines(['#'])));
    lv.layers.push(makeLayer('dup (2)', Grid.fromLines(['#'])));
    lv.legend.syncWith(['#']);
    const out = exportGodot(lv);
    expect(out).toContain('"dup":');
    expect(out).toContain('"dup (2)":');
    expect(out).toContain('"dup (3)":');
    expect(out.match(/"dup \(2\)":/g)).toHaveLength(1);
  });

  it('niekolidujaca literalna nazwa z sufiksem wychodzi bez zmian', () => {
    const lv = createLevel();
    lv.layers[0]!.name = 'x (2)';
    lv.layers[0]!.grid = Grid.fromLines(['#']);
    lv.legend.syncWith(['#']);
    const out = exportGodot(lv);
    expect(out).toContain('"x (2)":');
    expect(out).not.toContain('"x":');
  });
});
