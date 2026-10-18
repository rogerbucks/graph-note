// Where a drawing's card is placed (spec §3, §4). It is read-only in reading view, a hover preview or an embed. It is
// editable in Live Preview and Source mode. Live Preview draws a block into a card that goes on the page only after. So
// this also holds what waits for a card to be put on the page before deciding what it offers. It also holds the part of
// the screen its note is seen in, and scrolling that note (§25). The details sheet is pinned to the foot of that part.

/**
 * Whether a card is where the note is only read, not edited: reading view, a hover preview or an embed. That is as
 * opposed to Live Preview or Source mode (spec §3, "Read-only in Reading view"; decided 9 Oct 2026). A graph in an
 * embed of another note is read-only wherever it is shown. Such an embed is `![[Other note]]`, which Obsidian draws in
 * an `.internal-embed.markdown-embed`. It is read-only inside a note in Live Preview too (reading_view_whole_note, 11
 * Oct 2026). Only the note's own block, where the note is edited, is editable.
 */
export const readOnlyHere = (el: HTMLElement): boolean =>
  !!el.closest('.markdown-embed, .internal-embed') ||
  (!!el.closest('.markdown-reading-view, .markdown-preview-view') && !el.closest('.markdown-source-view'));

/** What scrolls a note: CodeMirror's scroller in the editing view, the preview in reading view. */
const SCROLLER = '.cm-scroller, .markdown-preview-view';

/**
 * The part of the screen a card's note is seen in (§25, the details sheet). It holds its scroller's top and foot within
 * the window. It holds how far that foot is above the window's, where a phone's toolbar may sit. The whole window when
 * there is none.
 */
export function screenOf(el: HTMLElement): { top: number; bottom: number; below: number } {
  const height = el.win.innerHeight,
    r = el.closest(SCROLLER)?.getBoundingClientRect();
  const top = Math.max(0, r?.top ?? 0),
    bottom = Math.min(height, r?.bottom ?? height);
  return { top, bottom, below: height - bottom };
}

/** Scrolls the note a card is in down by `by` pixels, so what is in the card rises by as much (§25). */
export function scrollNote(el: HTMLElement, by: number): void {
  const scroller = el.closest(SCROLLER);
  if (scroller) scroller.scrollTop += by;
}

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
 * Live Preview draws a block into a card that goes on the page only after. That is at once when the block is in view,
 * but only once it is scrolled to when it is not. A card drawn while the layout engine starts waits for it. So the
 * wait has no time limit; a card given up on would offer nothing, its Edit here doing nothing. It does no work while
 * it waits: one watcher per document hears each change to the page, rather than every card polling on a timer.
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
 * Runs now the checks of cards just put on the page, rather than when the page next tells of a change. The editing
 * view's own card puts a new drawing in place and has its editor moved in at once. So the card is never seen without
 * it (§4). And Edit here pressed on a card acts on it at once.
 */
export function settlePlacements(): void {
  for (const checks of [...waiting.values()]) for (const check of [...checks]) check();
}
