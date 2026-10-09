// The draft banner of the block editor (spec §9): what was typed is never lost. When a write is refused because the block
// changed in the note meanwhile, what was typed is kept as a draft, offered to be restored or discarded.
import { button } from './editor-layout';

/** A draft kept for a block: the text, and when it was kept. */
export interface KeptDraft {
  text: string;
  kept: string;
}

/** What the banner says when a write was refused, and the block reloaded from the note. */
export const reloadedMessage = (reason: string): string =>
  `The block changed in the note while you were typing (${reason}), so it was reloaded. What you typed is kept as a draft.`;

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
