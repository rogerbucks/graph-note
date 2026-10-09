// Where a drawing's card is placed (spec §3, §4): read-only in reading view, a hover preview or an embed, editable in
// Live Preview and Source mode; and, since Live Preview draws a block into a card that goes on the page only after,
// what waits for a card to be put on the page before deciding what it offers.

/**
 * Whether a card is where the note is only read, not edited: reading view, a hover preview or an embed, as opposed to
 * Live Preview or Source mode (spec §3, "Read-only in Reading view"; decided 9 Oct 2026).
 */
export const readOnlyHere = (el: HTMLElement): boolean =>
  !!el.closest('.markdown-reading-view, .markdown-preview-view') && !el.closest('.markdown-source-view');

/** The checks still waiting for their card to be put on the page. */
const waiting = new Set<() => void>();

/**
 * Runs `then` once `el` is on the page, at once when it already is. Live Preview draws a block into a card that goes on
 * the page only after, and where a card is decides what it offers. Gives up after a couple of seconds.
 */
export function whenPlaced(
  el: HTMLElement,
  then: () => void,
  wanted: () => boolean = () => true,
  giveUpMs = 2000,
): void {
  if (el.isConnected) return then();
  const started = Date.now();
  const check = () => {
    waiting.delete(check);
    if (!wanted()) return; // the card was unloaded before it was placed
    if (el.isConnected) then();
    else if (Date.now() - started < giveUpMs) {
      waiting.add(check);
      window.setTimeout(check, 16);
    }
  };
  waiting.add(check);
  window.setTimeout(check, 16);
}

/**
 * Runs now the checks of cards just put on the page, rather than at their next look: the editing view's own card puts
 * a new drawing in place and has its editor moved in at once, so the card is never seen without it (§4).
 */
export function settlePlacements(): void {
  for (const check of [...waiting]) check();
}
