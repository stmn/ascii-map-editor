// Panel Level: eksport/import BIEZACEGO poziomu. Wlasna karta (dawniej rzad w karcie Project),
// bo modale operuja tylko na poziomie w pamieci (state.level) - dziala zawsze, niezaleznie od
// tego, czy magazyn/projekty w ogole istnieja.
import { button, el } from '../dom';

export function initLevelIo(box: HTMLElement, modals: { openExport(): void; openImport(): void }): void {
  const row = el('div', 'btn-row');
  row.append(
    button('Export level', '', modals.openExport),
    button('Import level', 'success', modals.openImport),
  );
  box.append(row, el('p', 'hint', 'Current level only - use the Project card for whole projects.'));
}
