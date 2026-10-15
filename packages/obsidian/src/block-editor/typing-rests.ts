// The block editor's waits after typing (spec §4): what is typed is written once typing rests, in the pane well inside
// the spec's third of a second and in place longer, and the drawing is redrawn a little after it. A write made at once
// clears the write waiting, and the editor going clears both, as this is its child component, so no timer outlives it.
import { Component } from 'obsidian';
import type { Layout } from './editor-layout';

/** How long typing rests before it is written: in the pane well inside the spec's third of a second; in place longer. */
const WRITE_AFTER_MS: Record<Layout, number> = { pane: 150, inline: 700 };
const DRAW_AFTER_MS = 250;

/** The two waits after typing in one block editor: the write as typing rests, and the redraw. */
export class TypingRests extends Component {
  private readonly layout: Layout;
  private readonly on: { write: () => void; draw: () => void };
  private writeTimer: number | null = null;
  private drawTimer: number | null = null;

  constructor(layout: Layout, on: { write: () => void; draw: () => void }) {
    super();
    this.layout = layout;
    this.on = on;
  }

  /** The text changed: the write and the redraw each wait again from now. */
  typed(): void {
    const w = window;
    if (this.writeTimer !== null) w.clearTimeout(this.writeTimer);
    this.writeTimer = w.setTimeout(() => {
      this.writeTimer = null;
      this.on.write();
    }, WRITE_AFTER_MS[this.layout]);
    if (this.drawTimer !== null) w.clearTimeout(this.drawTimer);
    this.drawTimer = w.setTimeout(() => {
      this.drawTimer = null;
      this.on.draw();
    }, DRAW_AFTER_MS);
  }

  /** The write waiting is not needed, as one is made now. */
  noWrite(): void {
    if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
    this.writeTimer = null;
  }

  /** The editor goes, and this with it: neither wait outlives it. */
  override onunload(): void {
    if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
    if (this.drawTimer !== null) window.clearTimeout(this.drawTimer);
    this.writeTimer = this.drawTimer = null;
  }
}
