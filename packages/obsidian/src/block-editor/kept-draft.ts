// The draft banner of the block editor (spec §9): what was typed is never lost. When a write is refused because the block
// changed in the note meanwhile, or the note was deleted, what was typed is kept as a draft, offered to be restored or
// discarded. The banner holds the id of the very draft it shows: Restore and Discard act on that draft only, and on no
// other when it is gone (Roger's choice A, 11 Oct 2026).
import { Notice } from 'obsidian';
import { button } from './editor-layout';
import { NOTE_DELETED } from './note-writing';
import { RECOVER_COMMAND } from '../drafts';

/** A draft kept for a block: the text, when it was kept, and its id, given once when it is first kept and never again. */
export interface KeptDraft {
  text: string;
  kept: string;
  id: string;
}

/** What is said when the note being edited is deleted while what was typed is not yet written. */
export const DELETED_MESSAGE = `The note was deleted while you were typing. What you typed is kept as a draft: the command "${RECOVER_COMMAND.name}" writes it into a note.`;

/** What is said when Restore is pressed on a draft that is no longer kept, restored or discarded elsewhere. */
const GONE_MESSAGE =
  'That draft is no longer kept: it was restored or discarded elsewhere, so nothing was changed. Any other draft is offered when the block is opened again.';

/** What the banner says when a write was refused: the block reloaded from the note, or the note deleted. */
export const keptMessage = (reason: string): string =>
  reason === NOTE_DELETED
    ? DELETED_MESSAGE
    : `The block changed in the note while you were typing (${reason}), so it was reloaded. What you typed is kept as a draft.`;

/** The drafts an editor's banner offers and acts on: the one to show, and each by its id. */
export interface DraftsOf {
  draft(): KeptDraft | undefined;
  draftById(id: string): KeptDraft | undefined;
  forget(id: string): Promise<void>;
}

/**
 * Shows the draft `drafts` offers, if there is one, in the editor's banner, `el.draft`, with Restore and Discard; hides
 * the banner when there is none. Each button acts on the draft shown, by its id: Restore puts its text in the field,
 * `el.text`, and tells `restored`; on a draft no longer kept it says so and changes nothing.
 */
export function offerDraft(
  el: { draft: HTMLElement; text: HTMLTextAreaElement },
  drafts: DraftsOf,
  message: string | undefined,
  restored: () => void,
): void {
  const kept = drafts.draft(),
    banner = el.draft;
  banner.empty();
  banner.hidden = !kept;
  if (!kept) return;
  banner.createEl('p', {
    text: message ?? `A draft of this block, kept on ${kept.kept.slice(0, 16).replace('T', ' ')}, can be restored.`,
  });
  const forget = () => {
    banner.hidden = true;
    void drafts.forget(kept.id);
  };
  button(
    banner,
    'Restore draft',
    'rotate-ccw',
    () => {
      const now = drafts.draftById(kept.id);
      if (!now) {
        banner.hidden = true;
        new Notice(GONE_MESSAGE);
        return;
      }
      el.text.value = now.text;
      forget();
      restored();
    },
    'Restore draft',
  );
  button(banner, 'Discard draft', 'trash', forget, 'Discard draft');
}
