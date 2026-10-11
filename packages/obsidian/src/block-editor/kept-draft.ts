// The draft banner of the block editor (spec §9): what was typed is never lost. When a write is refused because the block
// changed in the note meanwhile, or because the note refused an edit made from the drawing (§4), what was typed is kept
// as a draft, offered to be restored or discarded.
import { button } from './editor-layout';

/** A draft kept for a block: the text, and when it was kept. */
export interface KeptDraft {
  text: string;
  kept: string;
}

/**
 * What the banner says when a write was refused, and the block reloaded from the note: because the block changed there
 * meanwhile, or, for an `edit` made from the drawing, because the note as written refused it (§4), in the core's words.
 */
export const reloadedMessage = (reason: string, edit = false): string =>
  edit
    ? `The edit was not written: ${reason}. The block is as the note has it, and the edit is kept as a draft.`
    : `The block changed in the note while you were typing (${reason}), so it was reloaded. What you typed is kept as a draft.`;

/** Shows the kept draft, if there is one, with Restore and Discard; hides the banner when there is none. */
export function showDraft(
  el: HTMLElement,
  kept: KeptDraft | undefined,
  message: string | undefined,
  on: { restore: (text: string) => void; discard: () => void },
): void {
  el.empty();
  el.hidden = !kept;
  if (!kept) return;
  el.createEl('p', {
    text: message ?? `A draft of this block, kept on ${kept.kept.slice(0, 16).replace('T', ' ')}, can be restored.`,
  });
  button(el, 'Restore draft', 'rotate-ccw', () => on.restore(kept.text), 'Restore draft');
  button(el, 'Discard draft', 'trash', () => on.discard(), 'Discard draft');
}
