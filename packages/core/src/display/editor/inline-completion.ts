// The inline match of the block editor (spec §4, autocomplete): the one best completion for the caret, from the core, kept
// while the field is focused with its caret alone; shown as ghost text in the coloured picture, and written into the field
// only when taken — never unasked. Escape dismisses it until the text or the caret changes.
import { inlineCompletion } from '@thoughtknot/core';
import type { Inline, NoteReading } from '@thoughtknot/core';

/** Ghost text for the picture: where in the text it goes, and what it says. */
export interface Ghost {
  at: number;
  text: string;
}

/** The inline match for one field. */
export class InlineCompletion {
  private offer: { at: number; match: Inline } | null = null;
  /** The text and caret Escape dismissed the match at: no match is shown again until either changes. */
  private dismissed: { text: string; caret: number } | null = null;

  /** The ghost text to show now, if there is a match. */
  get ghost(): Ghost | null {
    return this.offer ? { at: this.offer.at, text: this.offer.match.add } : null;
  }

  /**
   * Looks for the match at the field's caret, and says whether what is shown changed. Nothing is offered unless the field
   * has the focus and a caret alone, and a closer only when there is no name to suggest first (`suggested`), so Tab keeps
   * taking the name after a bare (.
   */
  update(t: HTMLTextAreaElement, reading: NoteReading | null, graph: string, suggested: boolean): boolean {
    const was = this.offer,
      caret = t.selectionStart ?? t.value.length,
      mute = this.dismissed?.text === t.value && this.dismissed.caret === caret;
    const wanted =
      reading && !mute && t.ownerDocument.activeElement === t && t.selectionEnd === caret
        ? inlineCompletion(reading, graph, t.value, caret)
        : null;
    const match = wanted && !(wanted.kind === 'closer' && suggested) ? wanted : null;
    this.offer = match ? { at: caret, match } : null;
    return was?.at !== this.offer?.at || was?.match.add !== this.offer?.match.add;
  }

  /** Dismisses the match; says whether there was one. */
  dismiss(t: HTMLTextAreaElement): boolean {
    if (!this.offer) return false;
    this.dismissed = { text: t.value, caret: t.selectionStart ?? t.value.length };
    this.offer = null;
    return true;
  }

  /**
   * Writes the match into the field, with the caret where the match says; says whether there was one to take. With
   * `wordsOnly` a closer is left: Enter takes a word, never a closer, since typing the closer is free (it is stepped over).
   */
  take(t: HTMLTextAreaElement, wordsOnly = false): boolean {
    const o = this.offer;
    if (!o || (wordsOnly && o.match.kind === 'closer') || t.selectionStart !== o.at || t.selectionEnd !== o.at)
      return false;
    t.value = t.value.slice(0, o.at) + o.match.add + t.value.slice(o.at);
    t.setSelectionRange(o.at + o.match.caretAfter, o.at + o.match.caretAfter);
    this.offer = null;
    return true;
  }
}
