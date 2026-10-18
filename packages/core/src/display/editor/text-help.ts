// The help beside the block editor's text (spec §4, §8): what is typed, read; then the coloured picture with each line
// read back, the problems listed, their fixes offered on the caret's line, suggestions offered where the caret is, and
// new problems said to screen readers. It keeps what it read, so each of them shows the same reading.
import { completions, diagnostics, estimateFix, gqlSpans, linkInBlock, readBack, spanOf } from '@thoughtknot/core';
import type { CompletionItem, Diagnostic, NoteReading, PaneSession } from '@thoughtknot/core';
import type { EditorParts } from './editor-layout';
import { paintText } from './text-picture';
import { announce, caretLine, heardKey, listProblems, showFixes } from './problem-help';
import type { FixChanges } from './problem-help';
import { acceptSuggestion, chooseSuggestion, placeSuggestions, showSuggestions } from './suggestions';
import { InlineCompletion } from './inline-completion';
import { unnamedPlace } from '../graph-view/suggested-name';
import type { Chosen } from '../graph-view/view-options';

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
  /** What the fix bar shows now, so it is drawn again only when that changes. */
  private shownFixes: { bar: HTMLElement; problems: Diagnostic[]; line: number } | null = null;
  /** What the suggestion list shows now, by its words, for the same reason. */
  private shownSuggestions: { bar: HTMLElement; words: string } | null = null;
  /**
   * Whether the suggestion list is open, and the option chosen in it: it opens as a word is typed (or by Control+Space),
   * and closes on Escape, a click, the caret moved by the keys, or the focus leaving, so the keys are the field's again.
   */
  private list = { open: false, active: 0 };
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
    // too large to read (§9): the picture is the text, plain, as colouring it would hold the page
    if (this.reading?.tooLarge) el.overlay.setText(s.text);
    else if (this.reading)
      paintText(el.overlay, s.text, this.problems, readBack(this.reading, s.graph, s.text), this.inline.ghost);
  }

  /**
   * The problems on the caret's line, with their fixes: drawn again only when the problems or the line change, so a fix
   * the keyboard is going to as the field loses the focus is still there to take it (spec §41, a11y_keyboard_auto).
   */
  fixbar(el: EditorParts): void {
    const line = caretLine(el.text),
      was = this.shownFixes;
    if (was && was.bar === el.fixbar && was.problems === this.problems && was.line === line) return;
    this.shownFixes = { bar: el.fixbar, problems: this.problems, line };
    showFixes(el.fixbar, this.problems, line, (changes) => this.on.fix(changes));
  }

  /**
   * Names, kinds and relationships already in the graph, offered where the caret is: the list drawn again only when they
   * change, so the option chosen stays chosen as the caret moves within the word. A list kept is the same suggestions, at
   * the same word, so it takes what it shows. It shows only while open.
   */
  suggest(el: EditorParts, s: PaneSession): void {
    if (!this.reading) return;
    const caret = el.text.selectionStart ?? el.text.value.length;
    this.suggestions = completions(this.reading, s.graph, el.text.value, caret);
    const { from, items } = this.suggestions;
    const shown = this.list.open ? items : [];
    const words = JSON.stringify([from, shown.map((i) => [i.label, i.insertText, i.detail, i.from])]);
    const was = this.shownSuggestions;
    if (!was || was.bar !== el.suggest || was.words !== words) {
      this.shownSuggestions = { bar: el.suggest, words };
      this.list.active = 0;
      showSuggestions(el.suggest, shown, this.list.active, (item) => this.on.accept(item));
    }
    if (shown.length) placeSuggestions(el.suggest, el.text);
    chooseSuggestion(el.suggest, el.text, shown.length ? this.list.active : null);
    this.moved = this.inline.update(el.text, this.reading, s.graph, this.suggestions.items.length > 0);
  }

  /** Opens the list (as a word is typed, or by Control+Space) or closes it, and shows it so. */
  openList(el: EditorParts, s: PaneSession | null, open: boolean): void {
    if (this.list.open === open) return;
    this.list.open = open;
    if (s) this.suggest(el, s);
  }

  /** Whether the list is open with options in it, for the field's keys to work it. */
  listShown(): boolean {
    return this.list.open && this.suggestions.items.length > 0;
  }

  /** Moves the choice in the list by `by`, round from the last to the first and back. */
  moveChoice(el: EditorParts, by: number): void {
    const n = this.suggestions.items.length;
    if (!n) return;
    this.list.active = (((this.list.active + by) % n) + n) % n;
    chooseSuggestion(el.suggest, el.text, this.list.active);
  }

  /** Moves the help with the caret: the suggestions and the inline match where it is, and the fixes on its line. */
  caretMoved(el: EditorParts, s: PaneSession | null): void {
    if (s) this.suggest(el, s);
    if (s && this.moved) this.picture(el, s);
    this.fixbar(el);
  }

  /** Takes the inline match into the field (not a closer, if `wordsOnly`), then calls `then`; says whether it did. */
  takeInline(t: HTMLTextAreaElement, then: () => void, wordsOnly: boolean): boolean {
    if (!this.inline.take(t, wordsOnly)) return false;
    then();
    return true;
  }

  /** Puts the inline match away, out of the picture; says whether there was one. */
  dismissInline(el: EditorParts, s: PaneSession): boolean {
    if (!this.inline.dismiss(el.text)) return false;
    this.picture(el, s);
    return true;
  }

  /** Where a box, a link or an estimated link chosen in the drawing is written in `text`, the block being edited, if it is. */
  whereIs(chosen: Chosen, text: string, graph: string): { from: number; to: number } | null {
    const reading = this.reading;
    if (!reading) return null;
    if ('estimate' in chosen) {
      // an estimated link, at its misspelt word, on the line the fix bar offers its fix (§3)
      const at = estimateFix(reading, graph, chosen.estimate, text, '')?.range,
        lines = text.split('\n');
      const offset = (p: { line: number; character: number }) =>
        lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
      return at ? { from: offset(at.start), to: offset(at.end) } : null;
    }
    // a thing drawn under a suggested name is found where its ( is, as its name is not written (§4)
    if ('thing' in chosen) return spanOf(text, chosen, unnamedPlace(reading, graph, chosen.thing, text));
    return spanOf(text, { link: linkInBlock(reading, graph, chosen.link, text) });
  }

  /**
   * The option chosen in the open list, which Enter or Tab takes in `t`: none when the list is closed, or when the word
   * being typed already is it, as taking it would change nothing, so the key does what it does anywhere else: Tab leaves
   * the field and Enter ends the line (spec §41, a11y_keyboard_auto).
   */
  chosen(t: HTMLTextAreaElement): CompletionItem | undefined {
    const item = this.listShown() ? this.suggestions.items[this.list.active] : undefined;
    if (!item) return undefined;
    const caret = t.selectionStart ?? t.value.length;
    return t.value.slice(item.from ?? this.suggestions.from, caret) === (item.insertText ?? item.label)
      ? undefined
      : item;
  }

  /** Writes a suggestion into the field in place of the word being typed. */
  accept(t: HTMLTextAreaElement, item: CompletionItem): void {
    acceptSuggestion(t, item, this.suggestions.from);
  }
}
