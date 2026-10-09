// The block editor's own undo history (spec §4): the text's, whose steps are put into the field. Unlike the field's own
// history, the text's survives the field leaving the page; the keys that ask for a step are in typing-keys.ts.
import { TextHistory } from '@graph-note/core';
import type { Change, TextState } from '@graph-note/core';

/** A step through the history. */
export type Step = 'undo' | 'redo';

/** The field's text and selection, as the history keeps them. */
function fieldState(t: HTMLTextAreaElement | undefined): TextState {
  const text = t?.value ?? '';
  return { text, start: t?.selectionStart ?? text.length, end: t?.selectionEnd ?? text.length };
}

/** The text's own undo history, which, unlike the field's, survives the field leaving the page (spec §4). */
export class FieldHistory {
  private undoes: TextHistory | null = null;

  /** Whether a history has been started. */
  get started(): boolean {
    return this.undoes !== null;
  }

  /** Starts a history on a new field's text, with the caret at its end. */
  start(text: string): void {
    this.undoes = new TextHistory({ text, start: text.length, end: text.length });
  }

  /** Records the field's text and selection, as a step of this kind of change. */
  record(t: HTMLTextAreaElement | undefined, change: Change): void {
    this.undoes?.record(fieldState(t), change);
  }

  /** Starts the history again from the field as it is: a text reloaded from the note, or changed there by Undo or Redo. */
  reset(t: HTMLTextAreaElement | undefined): void {
    this.undoes?.reset(fieldState(t));
  }

  /** Takes a step through the history into the field, text and selection; says whether there was one to take. */
  step(t: HTMLTextAreaElement, which: Step): boolean {
    const to = which === 'undo' ? this.undoes?.undo() : this.undoes?.redo();
    if (!to) return false;
    t.value = to.text;
    t.setSelectionRange(to.start, to.end);
    return true;
  }
}
