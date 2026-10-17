// A card in full screen (spec §3): the same card drawn again in an overlay over the whole window, as a dialog, closed by its
// own bar or Escape. The overlay belongs to the card it was opened from, and goes with it. As a dialog does (spec §41,
// a11y_keyboard_auto), it takes the keyboard when it opens, keeps Tab and Shift+Tab in it, leaves on Escape from any
// control in it, and gives the keyboard back to what had it.
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

/** What the keyboard can rest on, before the hidden and the left-out are taken away. */
const STOPS = 'a[href], button, input, select, textarea, [tabindex]';

/** The overlay's stops in Tab's order: shown, not disabled, and not taken out of the order. */
function stopsOf(overlay: HTMLElement): HTMLElement[] {
  return Array.from(overlay.querySelectorAll<HTMLElement>(STOPS)).filter(
    (e) => !e.closest('[hidden]') && !e.hasAttribute('disabled') && e.getAttribute('tabindex') !== '-1',
  );
}

/** The full-screen card of one card, if it is open. */
export class FullScreen {
  private open: { view: Child; overlay: HTMLElement; opener: HTMLElement | null } | null = null;
  private readonly host: FullScreenHost;

  constructor(host: FullScreenHost) {
    this.host = host;
  }

  /** Opens full screen, with the keyboard in it; nothing happens when it is open already. */
  show(): void {
    if (this.open) return;
    const had = activeDocument.activeElement;
    const overlay = activeDocument.body.createDiv({
      cls: 'graph-note-fullscreen',
      attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.host.graph}, full screen` },
    });
    overlay.addEventListener('keydown', (e) => this.key(e, overlay));
    const view = this.host.draw(overlay.createDiv({ cls: 'graph-note' }), () => this.hide());
    this.open = { view, overlay, opener: had as HTMLElement | null };
    this.host.card.addChild(view);
    // the drawing first, where the zoom keys work; else the first control
    (overlay.querySelector<HTMLElement>('.graph-note-viewport') ?? stopsOf(overlay)[0])?.focus();
  }

  /** Escape leaves, unless something in the card took it first; Tab and Shift+Tab go round the overlay's stops. */
  private key(e: KeyboardEvent, overlay: HTMLElement): void {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      this.hide();
      return;
    }
    if (e.key !== 'Tab') return;
    const stops = stopsOf(overlay),
      at = stops.indexOf(activeDocument.activeElement as HTMLElement);
    if (!stops.length) return;
    if (e.shiftKey ? at <= 0 : at === -1 || at === stops.length - 1) {
      e.preventDefault();
      (e.shiftKey ? stops[stops.length - 1] : stops[0])?.focus();
    }
  }

  /** Closes full screen, tells the card, and gives the keyboard back to what had it, if it is still there. */
  hide(): void {
    const f = this.open;
    if (!f) return;
    this.open = null;
    this.host.card.removeChild(f.view);
    f.overlay.remove();
    this.host.closed();
    if (f.opener?.isConnected) f.opener.focus();
  }

  /** The card is going: the overlay goes with it. */
  unload(): void {
    this.open?.overlay.remove();
    this.open = null;
  }
}
