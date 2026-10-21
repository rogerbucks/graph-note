// The short tour of a first graph (editor spec §44, first_run_help). It shows in the card, one step at a time, with
// Step back, Next step and Skip the tour. The last step's Next becomes Finish the tour. Escape skips it too, and the
// keyboard goes back to the drawing. A host opens it on the drawing that follows a first example, and again by command.
import { TOUR_STEPS, word } from '@thoughtknot/core';
import type { WordKey } from '@thoughtknot/core';

/** Opens the tour in the card `root`, at its first step; the keyboard goes back to `back` when it closes. */
export function showTour(root: HTMLElement, back: HTMLElement): void {
  root.querySelector('.thoughtknot-tour')?.remove();
  const tour = root.createDiv({ cls: 'thoughtknot-tour', attr: { role: 'dialog', 'aria-label': word('tour.title') } });
  const close = () => {
    tour.remove();
    back.focus({ preventScroll: true });
  };
  let at = 0;
  const draw = () => {
    tour.empty();
    tour.createEl('h3', { text: word('tour.title') });
    tour.createEl('p', {
      cls: 'thoughtknot-quiet',
      text: word('tour.step', { at: at + 1, all: TOUR_STEPS.length }),
    });
    tour.createEl('p', { text: word(`tour.${TOUR_STEPS[at]}` as WordKey), attr: { 'aria-live': 'polite' } });
    const row = tour.createDiv({ cls: 'thoughtknot-tour-buttons' });
    const button = (text: string, then: () => void) => {
      const b = row.createEl('button', { text, attr: { type: 'button', 'aria-label': text } });
      b.addEventListener('click', then);
      return b;
    };
    if (at > 0)
      button(word('tour.back'), () => {
        at--;
        draw();
      });
    const last = at === TOUR_STEPS.length - 1;
    const next = button(word(last ? 'tour.finish' : 'tour.next'), () => {
      if (last) return close();
      at++;
      draw();
    });
    button(word('tour.skip'), close);
    next.focus({ preventScroll: true });
  };
  tour.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  draw();
}
