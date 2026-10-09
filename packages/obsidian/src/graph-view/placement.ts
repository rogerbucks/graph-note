// Where a drawing's card is placed (spec §3, §4): read-only in reading view, a hover preview or an embed, editable in
// Live Preview and Source mode; and, since Live Preview draws a block into a card that goes on the page only after,
// what waits for a card to be put on the page before deciding what it offers.

/**
 * Whether a card is where the note is only read, not edited: reading view, a hover preview or an embed, as opposed to
 * Live Preview or Source mode (spec §3, "Read-only in Reading view"; decided 9 Oct 2026).
 */
export const readOnlyHere = (el: HTMLElement): boolean =>
  !!el.closest('.markdown-reading-view, .markdown-preview-view') && !el.closest('.markdown-source-view');

/** The checks still waiting for their card to be put on the page, by the document the card is drawn in. */
const waiting = new Map<Document, Set<() => void>>();

/** One watcher for each document that has cards waiting, told whenever anything is put on its page. */
const watchers = new Map<Document, MutationObserver>();

/** Stops watching a document's page once no card in it waits. */
function settle(doc: Document): void {
  if (waiting.get(doc)?.size) return;
  waiting.delete(doc);
  watchers.get(doc)?.disconnect();
  watchers.delete(doc);
}

/**
 * Runs `then` once `el` is on the page, at once when it already is, and never when the card is no longer `wanted`.
 * Live Preview draws a block into a card that goes on the page only after: at once when the block is in view, but only
 * once it is scrolled to when it is not, and a card drawn while the layout engine starts waits for it. So the wait has
 * no time limit; a card given up on would offer nothing, its Edit here doing nothing. It does no work while it waits:
 * one watcher per document hears each change to the page, rather than every card polling on a timer.
 */
export function whenPlaced(el: HTMLElement, then: () => void, wanted: () => boolean = () => true): void {
  if (el.isConnected) return then();
  const doc = el.ownerDocument;
  const checks = waiting.get(doc) ?? waiting.set(doc, new Set()).get(doc)!;
  const check = () => {
    if (wanted() && !el.isConnected) return;
    checks.delete(check);
    settle(doc);
    if (wanted()) then(); // else the card was unloaded before it was placed
  };
  checks.add(check);
  if (!watchers.has(doc)) {
    const watcher = new MutationObserver(() => {
      for (const c of [...(waiting.get(doc) ?? [])]) c();
    });
    watcher.observe(doc.documentElement, { childList: true, subtree: true });
    watchers.set(doc, watcher);
  }
}

/**
 * Runs now the checks of cards just put on the page, rather than when the page next tells of a change: the editing
 * view's own card puts a new drawing in place and has its editor moved in at once, so the card is never seen without it
 * (§4); and Edit here pressed on a card acts on it at once.
 */
export function settlePlacements(): void {
  for (const checks of [...waiting.values()]) for (const check of [...checks]) check();
}
