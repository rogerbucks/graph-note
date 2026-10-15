// The pane's block picker (spec §4): the note's graph blocks to choose from, built again from the note as the session
// last saw it each time the head's tools are shown — after every write, reload and change made outside the editor — so
// the lines it offers are never those of an older note; a block chosen is found again in the note as it is once what was
// typed is written, by its place among the graph blocks and its graph, and said when it is no longer there.
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

/** The picker in the pane's head, offered when the note has several graph blocks (never in place). */
export class BlockPicker {
  private readonly host: PickerHost;
  private head: HTMLElement | null = null;
  private select: HTMLSelectElement | null = null;
  /** The choices the picker shows, in the order shown. */
  private shown: Choice[] = [];

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
   * again in the note as it is then, at the place among the graph blocks it was shown at, of the graph shown.
   */
  private async chosen(value: string): Promise<void> {
    const at = this.shown.findIndex((c) => String(c.line) === value),
      graph = this.shown[at]?.graph;
    if (at < 0) return;
    if (this.host.session()?.dirty) await this.host.write();
    const s = this.host.session(),
      now = s?.choices()[at];
    if (s && now && now.graph === graph && s.select(now.line)) return this.host.opened();
    new Notice(CHOSEN_GONE);
    this.show();
  }
}
