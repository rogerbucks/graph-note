// A card in full screen (spec §3): the same card drawn again in an overlay over the whole window, as a dialog, closed by its
// own bar or Escape. The overlay belongs to the card it was opened from, and goes with it.
import type { Child, Lifecycle } from '../lifecycle';

/** What full screen asks of its card. */
export interface FullScreenHost {
  /** The graph's name, for the dialog's label. */
  graph: string;
  /** The card that owns the full-screen one, which is loaded and unloaded with it. */
  card: Lifecycle;
  /** Draws the card in `el`; `close` is what its Close full screen does. */
  draw: (el: HTMLElement, close: () => void) => Child;
  /** Full screen closed: the card it was opened from takes over again. */
  closed: () => void;
}

/** The full-screen card of one card, if it is open. */
export class FullScreen {
  private open: { view: Child; overlay: HTMLElement } | null = null;
  private readonly host: FullScreenHost;

  constructor(host: FullScreenHost) {
    this.host = host;
  }

  /** Opens full screen; nothing happens when it is open already. */
  show(): void {
    if (this.open) return;
    const overlay = activeDocument.body.createDiv({
      cls: 'graph-note-fullscreen',
      attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.host.graph}, full screen` },
    });
    const view = this.host.draw(overlay.createDiv({ cls: 'graph-note' }), () => this.hide());
    this.open = { view, overlay };
    this.host.card.addChild(view);
  }

  /** Closes full screen, and tells the card. */
  hide(): void {
    const f = this.open;
    if (!f) return;
    this.open = null;
    this.host.card.removeChild(f.view);
    f.overlay.remove();
    this.host.closed();
  }

  /** The card is going: the overlay goes with it. */
  unload(): void {
    this.open?.overlay.remove();
    this.open = null;
  }
}
