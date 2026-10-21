// A long wait shown (editor spec §44, progress_shown). Nothing shows for a wait under a second. After a second the
// wait shows a bar and how long it has taken, said to a screen reader too. After ten seconds it offers Stop. Stopped,
// the one waiting is told at once, and the work's result is not used: it does what it must to leave nothing half done.
import { formatCount, word } from '@thoughtknot/core';
import { button } from './graph-view/view-bar';

/** How long a wait goes before its progress is shown, in milliseconds. */
export const PROGRESS_AFTER_MS = 1000;
/** How long a wait goes before Stop is offered, in milliseconds. */
export const STOP_AFTER_MS = 10_000;

/** What `waitShown` gives back: the work's result, or 'stopped' when the person stopped it first. */
export type Waited<T> = T | 'stopped';

/**
 * Waits for `work`, showing it in `parent` as `what` ("Exporting") once it takes more than a second. `signal` is
 * aborted when the person presses Stop, so the work can check it before it writes anything.
 */
export async function waitShown<T>(
  parent: HTMLElement,
  what: string,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<Waited<T>> {
  const stop = new AbortController();
  let shown: HTMLElement | null = null,
    seconds = 0,
    timer = 0;
  const said = () => word('progress.waited', { what, seconds: formatCount(seconds) });
  // one timer at a time, each set by the one before, so the last is the one cleared
  const tick = (words: HTMLElement) => {
    timer = window.setTimeout(() => {
      seconds += 1;
      words.setText(said());
      if (seconds * 1000 === STOP_AFTER_MS && shown)
        button(shown, word('progress.stop'), 'square', () => stop.abort(), word('progress.stop'));
      tick(words);
    }, 1000);
  };
  timer = window.setTimeout(() => {
    seconds = PROGRESS_AFTER_MS / 1000;
    shown = parent.createDiv({ cls: 'thoughtknot-progress', attr: { role: 'status', 'aria-live': 'polite' } });
    shown.createEl('progress', { attr: { 'aria-label': what } });
    tick(shown.createSpan({ cls: 'thoughtknot-progress-words', text: said() }));
  }, PROGRESS_AFTER_MS);
  const stopped = new Promise<'stopped'>((done) =>
    stop.signal.addEventListener('abort', () => done('stopped'), { once: true }),
  );
  try {
    return await Promise.race([work(stop.signal), stopped]);
  } finally {
    window.clearTimeout(timer);
    (shown as HTMLElement | null)?.remove();
  }
}
