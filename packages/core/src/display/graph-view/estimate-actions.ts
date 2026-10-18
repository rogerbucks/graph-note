// What an estimated link offers when tapped (spec §3, estimate_never_written; device check V-06, Roger, 11 Oct 2026: "I
// can't click on the estimated link to review it / edit it / fix it. Make that simple (quick fix or full edit options)"):
// the quick fix, which accepts the estimate with its problem's own fix — the one the editor's fix bar offers, found by
// the core's `estimateFix` — written into the text being edited, or else into the note; and Edit the link, which opens
// the editor with the misspelt word selected, where the fix bar offers the same fix. Both write only through the card's
// options, which read-only.ts gates; where the card is read-only neither is offered.
import { estimateFix } from '@thoughtknot/core';
import { withFix } from '../fix-changes';
import { button } from './view-bar';
import type { ViewOptions } from './view-options';

/** Under an estimated link's sentence in its details: the quick fix that accepts it, and Edit the link. */
export function estimateActions(el: HTMLElement, index: number, o: ViewOptions): void {
  // where the card is read-only (read-only.ts): reading view, and full screen opened from it, which sits outside it
  if (o.readOnly?.()) return;
  const e = o.reading.graphs.get(o.graph)?.estimates[index],
    was = e ? o.reading.texts[e.block] : undefined;
  const found = was === undefined ? null : estimateFix(o.reading, o.graph, index, was, 'block');
  const row = el.createDiv({ cls: 'thoughtknot-estimate-actions' });
  let status: HTMLElement | null = null;
  if (found && was !== undefined) {
    const { title, edit } = found.fix;
    button(
      row,
      title,
      'check',
      () => void accept(o, found.block, was, withFix(was, edit.changes)).then((why) => status?.setText(why ?? '')),
      title,
    );
  }
  const at = { estimate: index };
  // while the block is edited, choosing selects where it is written (§4); else the editor opens there
  button(
    row,
    'Edit the link',
    'pencil',
    () => (o.editing?.()?.session || !o.onEditHere ? o.onSelect?.(at) : o.onEditHere(at)),
    'Edit the link',
  );
  status = row.createSpan({ cls: 'thoughtknot-fix', attr: { role: 'status' } });
}

/**
 * The block with the fix made, written into the text being edited in this card, as the fix bar writes a fix, when that
 * text is the block as drawn; else, with no editor on the card, into the note. Resolves to why nothing was written, or null.
 */
async function accept(o: ViewOptions, block: number, was: string, now: string): Promise<string | null> {
  const ed = o.editing?.();
  if (ed?.session) {
    if (ed.session.text !== was)
      return 'The text being edited is not as drawn, so nothing was written. Try again once the drawing is redrawn.';
    ed.replace(now);
    return null;
  }
  return o.writeBlock ? o.writeBlock(block, was, now) : 'Edit the block to fix it: nothing was written.';
}
