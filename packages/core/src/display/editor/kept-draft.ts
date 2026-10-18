// The draft banner of the block editor (spec §9): what was typed is never lost. When a write is refused because the block
// changed in the note meanwhile, the note was deleted, or the note refused an edit made from the drawing (§4), what was
// typed is kept as a draft, offered to be restored or discarded. The banner holds the id of the very draft it shows:
// Restore and Discard act on that draft only, and on no other when it is gone (Roger's choice A, 11 Oct 2026).
import { word } from '@graph-note/core';
import { notice } from '../host';
import { button } from './editor-layout';
import { NOTE_DELETED } from './editor-note';
import type { KeptDraft } from './editor-note';

/**
 * What the banner says when a write was refused: the block reloaded from the note, or the note deleted (`deleted`, which
 * each host words for how its drafts are recovered); or, for an `edit` made from the drawing that the note as written
 * refused (§4), why in the core's words, with the block reloaded; or, the editor `stopped` by a copy of its block (§9), the
 * core's words, nothing reloaded.
 */
export const keptMessage = (reason: string, deleted: string, edit = false, stopped = false): string =>
  edit
    ? word('editor.edit-kept', { reason })
    : stopped
      ? word('editor.stopped-kept', { reason })
      : reason === NOTE_DELETED
        ? deleted
        : word('editor.changed-kept', { reason });

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
    text: message ?? word('editor.draft-kept', { when: kept.kept.slice(0, 16).replace('T', ' ') }),
  });
  const forget = () => {
    banner.hidden = true;
    void drafts.forget(kept.id);
  };
  button(
    banner,
    word('editor.restore'),
    'rotate-ccw',
    () => {
      const now = drafts.draftById(kept.id);
      if (!now) {
        banner.hidden = true;
        notice(word('editor.draft-gone'));
        return;
      }
      el.text.value = now.text;
      forget();
      restored();
    },
    word('editor.restore'),
  );
  button(banner, word('editor.discard'), 'trash', forget, word('editor.discard'));
}
