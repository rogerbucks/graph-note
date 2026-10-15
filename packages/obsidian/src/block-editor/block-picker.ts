// The pane's block picker (spec §4): the note's graph blocks to choose from, built again from the note as the session
// last saw it each time the head's tools are shown — after every write, reload and change made outside the editor — so
// the lines it offers are never those of an older note; a block chosen is found again in the note as it is once what was
// typed is written, by its place among the graph blocks, its graph and its text, and said when it is no longer there.
// Open again, in the pane and in place, goes on with the block after the session stopped by a copy of it (§9).
import { Notice } from 'obsidian';
import type { Choice, PaneSession } from '@graph-note/core';

/** Said when the block chosen is no longer in the note. */
const CHOSEN_GONE = 'That graph block is no longer in the note: choose again from the blocks it has now.';

/** What the picker asks of its editor: its session, what is typed written, and the block chosen opened. */
export interface PickerHost {
  session: () => PaneSession | null;
  write: () => Promise<void>;
  opened: () => void;
}

/** The picker in the pane's head, offered when the note has several graph blocks (never in place), and Open again. */
export class BlockPicker {
  private readonly host: PickerHost;
  private head: HTMLElement | null = null;
  private select: HTMLSelectElement | null = null;
  /** The choices the picker shows, in the order shown, and the text of each block as shown. */
  private shown: Choice[] = [];
  private texts: (string | undefined)[] = [];

  constructor(host: PickerHost) {
    this.host = host;
  }

  /** Puts the picker into a head just built, or none where there is no picker (in place). */
  place(head: HTMLElement | null): void {
    this.head = head;
    this.select = null;
    this.shown = [];
    this.show();
  }

  /**
   * Builds the picker again from the note as the session last saw it, the block edited selected; takes it away when the
   * note has one graph block. Its options are made again in the same element, so a picker with the focus keeps it.
   */
  show(): void {
    const head = this.head,
      s = this.host.session();
    if (!head || !s) return;
    const choices = s.choices();
    this.shown = choices;
    this.texts = choices.map((c) => s.blockText(c.line));
    if (choices.length < 2) {
      this.select?.remove();
      this.select = null;
      return;
    }
    const picker = this.select ?? this.made(head);
    picker.empty();
    for (const c of choices) {
      const o = picker.createEl('option', { text: c.label, attr: { value: String(c.line) } });
      if (c.line === s.ref.line) o.setAttribute('selected', '');
    }
    picker.value = String(s.ref.line);
  }

  /** The picker element, first in the head. */
  private made(head: HTMLElement): HTMLSelectElement {
    const picker = head.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Graph block' } });
    head.prepend(picker);
    picker.addEventListener('change', () => void this.chosen(picker.value));
    this.select = picker;
    return picker;
  }

  /**
   * Opens the block chosen: what is typed is written first, which can move the lines below it, so the block is found
   * again in the note as it is then, at the place among the graph blocks it was shown at, of the graph and the text
   * shown; another block come to that place is never opened in its stead (the review of #465).
   */
  private async chosen(value: string): Promise<void> {
    const at = this.shown.findIndex((c) => String(c.line) === value),
      graph = this.shown[at]?.graph,
      text = this.texts[at];
    if (at < 0) return;
    if (this.host.session()?.dirty) await this.host.write();
    const s = this.host.session(),
      now = s?.choices()[at];
    if (s && now && now.graph === graph && s.blockText(now.line) === text && s.select(now.line)) {
      return this.host.opened();
    }
    new Notice(CHOSEN_GONE);
    this.show();
  }

  /**
   * Open again, once the session stopped as it cannot tell its block from a copy (§9): what is typed is kept as a draft
   * first, as the stop refuses its write; then the block of its graph on the line the editor last knew it at, else the
   * first of its graph, is opened with its own history, or the notice says none is left; never another graph's block.
   * The picker cannot do it, as choosing the block shown changes nothing.
   */
  async again(): Promise<void> {
    const s = this.host.session();
    if (!s) return;
    if (s.dirty) await this.host.write();
    const mine = s.choices().filter((x) => x.graph === s.graph),
      c = mine.find((x) => x.line === s.ref.line) ?? mine[0];
    if (c && s.select(c.line)) return this.host.opened();
    new Notice(CHOSEN_GONE);
  }
}
