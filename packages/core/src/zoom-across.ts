// A wide drawing that scrolls one way only (editor spec §15, wide_types_phone). Take a tree, a flow or a timeline wider
// than its card on a phone (types-table.ts, `scrollsOneWay`). It is fitted to the card's height and shown from its
// start. One finger moves it across and never up or down, while the browser keeps scrolling the page up and down.
// It scrolls like a page, stopping at either end. Zoomed in, by a pinch or a button, it pans both ways. It pans freely,
// as any drawing does (pan_freely), and Fit brings the one-way view back.
// Everything else is Zoom's own (zoom.ts), which this only adds to, so the two never differ in anything else.
import { Zoom } from './zoom.ts';
import { MAX_SCALE } from './zoom-fit.ts';
import type { Mode, Size } from './zoom-fit.ts';
import type { ZoomEvent } from './zoom.ts';

const EPS = 1e-9;

/** Zoom and pan for a drawing scrolled across only, while it is wider than its viewport and not zoomed in. */
export class AcrossZoom extends Zoom {
  /** Each finger moving the drawing across, by its pointer id: where it was last, across. */
  private readonly fingers = new Map<number, number>();

  constructor(content: Size, viewport: Size, mode: Mode) {
    super(content, viewport, mode);
    this.toStart();
  }

  /**
   * Fitted to the viewport's height, whatever its width: in a note never above natural size, elsewhere up to the limit.
   * Zooming out still goes on to the fit of the whole drawing (`outLimit`, zoom_out_to_fit), which this is never below.
   */
  override fitScale(): number {
    const { width: cw, height: ch } = this.content;
    const raw = cw > 0 && ch > 0 && this.viewport.height > 0 ? this.viewport.height / ch : 1;
    return Math.min(this.mode === 'note' ? 1 : MAX_SCALE, Math.max(this.outLimit(), raw));
  }

  /** Fitted, and shown from its start: its right end, for a drawing read right to left (§42). */
  override fit(): void {
    super.fit();
    this.toStart();
  }

  /** At the scale that fits it, and, when wider than its viewport, at its start. */
  override isFitted(): boolean {
    const v = this.view();
    const start = this.content.fromRight ? this.viewport.width - v.width : 0;
    return (
      Math.abs(v.scale - this.fitScale()) < EPS && (v.width <= this.viewport.width + EPS || Math.abs(v.x - start) < EPS)
    );
  }

  /** Up and down are the browser's, to scroll the page, while the drawing scrolls across. */
  override touchAction(): 'pan-x pan-y' | 'pan-y' | 'none' {
    return this.zoomedIn() ? 'none' : this.scrollsAcross() ? 'pan-y' : 'pan-x pan-y';
  }

  /**
   * Zoom's own handling, and then a finger put down off every box, while the drawing scrolls across, moves it across
   * only. Two fingers pinch it as Zoom pinches any drawing.
   */
  override handle(e: ZoomEvent): boolean {
    const used = super.handle(e);
    if (e.kind === 'down') {
      if (e.pointer === 'touch' && !e.onBox && this.scrollsAcross()) this.fingers.set(e.id, e.x);
      return used || this.fingers.has(e.id);
    }
    if (e.kind === 'up' || e.kind === 'cancel') return this.fingers.delete(e.id) || used;
    if (e.kind !== 'move') return used;
    const from = this.fingers.get(e.id);
    if (from === undefined) return used;
    this.fingers.set(e.id, e.x);
    if (used || !this.scrollsAcross()) return used; // a pinch is Zoom's; zoomed in, every finger pans both ways
    this.panBy(e.x - from, 0);
    return true;
  }

  /** While it scrolls across, it stops at either end, as a page does. */
  protected override edgeBound(): boolean {
    return this.scrollsAcross();
  }

  /** Wider than its viewport, and not zoomed in. */
  private scrollsAcross(): boolean {
    return !this.zoomedIn() && this.view().width > this.viewport.width + EPS;
  }

  /** To the drawing's start, across, when it is wider than its viewport; centred, as Zoom keeps it, when it is not. */
  private toStart(): void {
    if (this.scrollsAcross()) this.panBy(this.content.fromRight ? -this.view().width : this.view().width, 0);
  }
}
