// Rejestr historii edytora: jedna instancja History, przyciski Undo/Redo nad karta Draw,
// skroty klawiszowe i hook pushHistory dla pozostalych paneli. KAZDE wykonanie komendy
// przechodzi przez run(), wiec odswiezenie widoku i obsluga bledu maja jedno miejsce.
import { bumpContent } from '../../core/editorState';
import { History } from '../../core/history';
import { button, el } from '../dom';
import { isTypingTarget } from '../input';
import { isModalOpen } from '../modal';
import { PanelsCtx, errorMessage, scheduleSave, setOnLevelSwitch, toast } from './context';

/** Historia jest sesyjna i dotyczy JEDNEGO poziomu - przelaczenie poziomu ja kasuje. */
const history = new History();

/**
 * Wolane raz przez panels.ts, PRZED initDraw - oba dokladaja do tego samego pudelka,
 * wiec rzad Undo/Redo laduje na gorze karty Draw.
 */
export function initHistory(ctx: PanelsCtx, drawBox: HTMLElement): void {
  const undoBtn = button('Undo', 'history-btn', () => run('undo'));
  undoBtn.title = 'Undo (Ctrl+Z)';
  const redoBtn = button('Redo', 'history-btn', () => run('redo'));
  redoBtn.title = 'Redo (Ctrl+Shift+Z)';
  const row = el('div', 'btn-row');
  row.append(undoBtn, redoBtn);
  drawBox.append(row);

  function syncButtons(): void {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  /** Wspolny epilog: komenda ruszyla model, wiec canvas, karty i autozapis musza za nia nadazyc. */
  function afterRun(): void {
    bumpContent(ctx.state);
    ctx.markDirty();
    ctx.hooks.renderLayers();
    ctx.hooks.renderLegend();
    scheduleSave();
    // stan przyciskow odswiezamy takze tutaj: gdy komenda rzucila, History nie zdazylo zawolac onChange.
    // Popu nie gramy - undo bywa trzymane na skrocie, a seria dzwiekow byla by meczaca.
    syncButtons();
  }

  function run(action: 'undo' | 'redo'): void {
    if (!(action === 'undo' ? history.canUndo() : history.canRedo())) return;
    try {
      if (action === 'undo') history.undo();
      else history.redo();
    } catch (e) {
      // Odwracanie potrafi rzucic - remap wraca na znak, ktory w miedzyczasie zajela inna edycja
      // ('Character already in use'). History zdjelo juz komende ze stosu i nie przelozylo jej na
      // drugi, wiec jest ZUZYTA i swiadomie nie wracamy jej na stos: ponowna proba rzucilaby
      // dokladnie tak samo, a uzytkownik utknalby na tym wpisie i nie cofnal niczego wczesniejszego.
      toast(errorMessage(e), 'error');
    }
    afterRun();
  }

  // Skroty siedza tu, a nie w globalnym handlerze karty Draw (przelaczanie pedzla): tamten
  // odpada juz na pierwszym warunku, gdy wcisniety jest Ctrl/Cmd/Alt, wiec 'z' i 'y' z
  // modyfikatorem nigdy nie zmienia pedzla i oba nasluchy sie nie gryza.
  window.addEventListener('keydown', (e) => {
    // Alt w komplecie to juz inny skrot (i modyfikator gumki) - nie porywamy go na undo
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (isTypingTarget(e.target) || isModalOpen()) return;
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      run(e.shiftKey ? 'redo' : 'undo');
    } else if (key === 'y') {
      e.preventDefault();
      run('redo');
    }
  });

  history.onChange = syncButtons;
  ctx.hooks.pushHistory = (cmd) => history.push(cmd);
  // przelaczenie poziomu/projektu: komendy poprzedniego poziomu nie maja juz czego cofac
  setOnLevelSwitch(() => history.clear());
  syncButtons();
}
