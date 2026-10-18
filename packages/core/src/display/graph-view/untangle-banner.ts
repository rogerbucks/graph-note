// The banner over an untangled drawing (editor spec §25): what the drawing is filtered to, the path asked for, or the
// question waiting for a second thing — each in a sentence with its way back — announced to screen readers as it changes.

/** One line of the banner: what it says, and the buttons that act on it. */
export interface BannerRow {
  words: string;
  actions: { label: string; run: () => void }[];
}

/** The banner of one drawing, empty and hidden until something is filtered, chosen or asked for. */
export class Banner {
  private readonly el: HTMLElement;

  /** Puts the banner into a card, where it is at the end of what is there. */
  constructor(root: HTMLElement) {
    this.el = root.createDiv({ cls: 'thoughtknot-untangle', attr: { role: 'status' } });
    this.el.hidden = true;
  }

  /** Shows these lines, replacing what was there; none hides the banner. */
  show(rows: BannerRow[]): void {
    this.el.empty();
    this.el.hidden = rows.length === 0;
    for (const row of rows) {
      const line = this.el.createDiv({ cls: 'thoughtknot-untangle-row' });
      line.createSpan({ text: row.words });
      for (const a of row.actions) {
        const b = line.createEl('button', { text: a.label, attr: { type: 'button' } });
        b.addEventListener('click', a.run);
      }
    }
  }
}
