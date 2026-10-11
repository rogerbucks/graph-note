// The draft banner of the block editor (spec §9): what was typed is never lost. When a write is refused because the block
// changed in the note meanwhile, or the note was deleted, what was typed is kept as a draft, offered to be restored or
// discarded.
import { button } from './editor-layout';
import { NOTE_DELETED } from './note-writing';
import { RECOVER_COMMAND } from '../drafts';

/** A draft kept for a block: the text, and when it was kept. */
export interface KeptDraft {
  text: string;
  kept: string;
}

/** What is said when the note being edited is deleted while what was typed is not yet written. */
export const DELETED_MESSAGE = `The note was deleted while you were typing. What you typed is kept as a draft: the command "${RECOVER_COMMAND.name}" writes it into a note.`;

/** What the banner says when a write was refused: the block reloaded from the note, or the note deleted. */
export const keptMessage = (reason: string): string =>
  reason === NOTE_DELETED
    ? DELETED_MESSAGE
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
