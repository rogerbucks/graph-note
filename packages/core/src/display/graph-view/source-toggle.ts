// Source, in reading view (spec §3): the block's text, coloured and read-only, shown in place of the drawing, and the drawing
// back; the button that does it names what it will show next.
import { setIcon } from '../host';
import { renderCode } from '../code';
import { word } from '@thoughtknot/core';

/** What the toggle asks of its card. */
export interface SourceHost {
  viewport: () => HTMLElement;
  details: () => HTMLElement;
  /** The block's text. */
  source: () => string;
  /** Whether the details are kept open (§24): they come back with the drawing. */
  keptOpen: () => boolean;
}

/** Source and drawing, taken in turn in one card. */
export class SourceToggle {
  private code: HTMLElement | null = null;
  private readonly card: HTMLElement;
  private readonly host: SourceHost;

  constructor(card: HTMLElement, host: SourceHost) {
    this.card = card;
    this.host = host;
  }

  /** Shows the source if the drawing is showing, the drawing otherwise; `b` is the button, relabelled. */
  toggle(b: HTMLButtonElement): void {
    const viewport = this.host.viewport(),
      details = this.host.details(),
      showing = !viewport.hidden;
    if (!this.code) {
      this.code = renderCode(this.card, this.host.source());
      this.card.insertBefore(this.code, details);
      this.code.hidden = true;
    }
    viewport.hidden = showing;
    this.code.hidden = !showing;
    if (showing) details.hidden = true;
    else if (this.host.keptOpen()) details.hidden = false; // kept open, it is back with the drawing (§24)
    b.empty();
    setIcon(b, showing ? 'network' : 'code');
    b.setAttribute('aria-label', word(showing ? 'bar.show-drawing' : 'bar.show-source'));
  }
}
