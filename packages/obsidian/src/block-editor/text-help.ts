// The help beside the block editor's text (spec §4, §8): what is typed, read; then the coloured picture with each line
// read back, the problems listed, their fixes offered on the caret's line, suggestions offered where the caret is, and
// new problems said to screen readers. It keeps what it read, so each of them shows the same reading.
import { completions, diagnostics, gqlSpans, linkInBlock, readBack, spanOf } from '@graph-note/core';
import type { CompletionItem, Diagnostic, NoteReading, PaneSession } from '@graph-note/core';
import type { EditorParts } from './editor-layout';
import { paintText } from './text-picture';
import { announce, caretLine, heardKey, listProblems, showFixes } from './problem-help';
import type { FixChanges } from './problem-help';
import { acceptSuggestion, showSuggestions } from './suggestions';
import { InlineCompletion } from './inline-completion';

/** The help for one editor: what it read last, and what it shows from that. */
export class TextHelp {
  /** What is typed, as read: where the problems, the suggestions, the read-back and the drawing come from. */
  reading: NoteReading | null = null;
  private problems: Diagnostic[] = [];
  private suggestions: { from: number; items: CompletionItem[] } = { from: 0, items: [] };
  /** The best match for the caret, shown as ghost text in the picture; and whether the last look found a new one. */
  private readonly inline = new InlineCompletion();
  private moved = false;
  /** The problems already announced, so only new ones are (spec §8). */
  private heard = new Set<string>();
  private readonly on: { fix: (changes: FixChanges) => void; accept: (item: CompletionItem) => void };

  /** `fix` is called with the edits of a fix chosen, and `accept` with a suggestion chosen. */
  constructor(on: { fix: (changes: FixChanges) => void; accept: (item: CompletionItem) => void }) {
    this.on = on;
  }

  /** Reads the session's text, in its note. */
  read(s: PaneSession, note: string): NoteReading {
    this.reading = s.reading(note);
    return this.reading;
  }

  /** Finds the problems in what was read last, for the block at `s.ref.line` of the note at `path`. */
  check(s: PaneSession, note: string, path: string): void {
    if (!this.reading) return;
    const block = gqlSpans(note).findIndex((x) => x.open === s.ref.line);
    this.problems = diagnostics(this.reading, s.graph, Math.max(0, block), s.text, `app://${path}`);
  }

  /** Takes the problems there are now as heard: a block just shown announces none of them. */
  hearAll(): void {
    this.heard = new Set(this.problems.map(heardKey));
  }

  /** Says new problems to screen readers, without moving the focus. */
  announce(el: EditorParts): void {
    this.heard = announce(el.announce, this.problems, this.heard);
  }

  /** The coloured picture of the text, the problems list, and the bars of fixes and suggestions where the caret is. */
  paint(el: EditorParts, s: PaneSession): void {
    if (!this.reading) return;
    const text = s.text;
    el.text.setAttribute('rows', String(text.split('\n').length + 1)); // grown to its text: it never scrolls apart from its colours
    this.suggest(el, s);
    this.picture(el, s);
    listProblems(el.list, this.problems);
    this.fixbar(el);
  }

  /** The coloured picture of the text, with each line read back and the inline match as ghost text where the caret is. */
  private picture(el: EditorParts, s: PaneSession): void {
    if (this.reading)
      paintText(el.overlay, s.text, this.problems, readBack(this.reading, s.graph, s.text), this.inline.ghost);
  }

  /** The problems on the caret's line, with their fixes. */
  fixbar(el: EditorParts): void {
    showFixes(el.fixbar, this.problems, caretLine(el.text), (changes) => this.on.fix(changes));
  }

  /** Names, kinds and relationships already in the graph, offered where the caret is. */
  suggest(el: EditorParts, s: PaneSession): void {
    if (!this.reading) return;
    const caret = el.text.selectionStart ?? el.text.value.length;
    this.suggestions = completions(this.reading, s.graph, el.text.value, caret);
    showSuggestions(el.suggest, this.suggestions.items, (item) => this.on.accept(item));
    this.moved = this.inline.update(el.text, this.reading, s.graph, this.suggestions.items.length > 0);
  }

  /** Moves the help with the caret: the suggestions and the inline match where it is, and the fixes on its line. */
  caretMoved(el: EditorParts, s: PaneSession | null): void {
    if (s) this.suggest(el, s);
    if (s && this.moved) this.picture(el, s);
    this.fixbar(el);
  }

  /** Takes the inline match into the field, then calls `then`; says whether there was a match to take. */
  takeInline(t: HTMLTextAreaElement, then: () => void): boolean {
    if (!this.inline.take(t)) return false;
    then();
    return true;
  }

  /** Puts the inline match away, out of the picture; says whether there was one. */
  dismissInline(el: EditorParts, s: PaneSession): boolean {
    if (!this.inline.dismiss(el.text)) return false;
    this.picture(el, s);
    return true;
  }

  /** Where a box or a link chosen in the drawing is written in `text`, the block being edited, if it is. */
  whereIs(
    chosen: { thing: string } | { link: number },
    text: string,
    graph: string,
  ): { from: number; to: number } | null {
    const reading = this.reading;
    if (!reading) return null;
    return spanOf(text, 'thing' in chosen ? chosen : { link: linkInBlock(reading, graph, chosen.link, text) });
  }

  /** The first suggestion, which Tab takes. */
  first(): CompletionItem | undefined {
    return this.suggestions.items[0];
  }

  /** Writes a suggestion into the field in place of the word being typed. */
  accept(t: HTMLTextAreaElement, item: CompletionItem): void {
    acceptSuggestion(t, item, this.suggestions.from);
  }
}
