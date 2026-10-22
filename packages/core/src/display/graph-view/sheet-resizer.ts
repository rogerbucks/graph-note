// The details sheet's resize bar (editor spec §25, sheet_resized). It sits on the sheet's edge facing the drawing. It
// is a named separator that takes the keyboard. A drag with a pointer moves it; so do the arrow keys across it, with
// Home and End taking it to its least and most. It says which way it lies and how big the sheet is. The sheet decides
// the bounds and keeps the size; this only turns a drag or a key into the size wanted.
import { RESIZE_STEP, sheetBounds, sideways, word } from '@thoughtknot/core';
import type { SheetDock } from '@thoughtknot/core';

/** What the resize bar asks of its sheet. */
export interface ResizerHost {
  /** Where the sheet sits. */
  dock: () => SheetDock;
  /** The side it is seen on, at a side; null at the bottom or top. */
  side: () => 'left' | 'right' | null;
  /** How far its size is measured across the screen, in pixels. */
  across: () => number;
  /** How big it is across the screen now, in pixels. */
  span: () => number;
  /** Sizes it to as near `px` as its bounds allow. */
  resize: (px: number) => void;
}

/** The resize bar of one open sheet. */
export class SheetResizer {
  readonly el: HTMLElement;
  private readonly host: ResizerHost;
  private readonly sheet: HTMLElement;

  /** Puts a new bar first in `sheet`. */
  constructor(sheet: HTMLElement, host: ResizerHost) {
    this.sheet = sheet;
    this.host = host;
    const g = sheet.createDiv({
      cls: 'thoughtknot-sheet-resizer',
      attr: { role: 'separator', tabindex: '0', 'aria-label': word('details.resize') },
    });
    sheet.prepend(g);
    g.addEventListener('pointerdown', (e: PointerEvent) => this.drag(e));
    g.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
    this.el = g;
  }

  /** Takes the bar away. */
  remove(): void {
    this.el.remove();
  }

  /** Which way a pointer moving across the bar grows the sheet: +1 when its coordinate rising grows it, -1 when falling. */
  private growth(): { axis: 'x' | 'y'; sign: number } {
    const side = this.host.side();
    if (side) return { axis: 'x', sign: side === 'left' ? 1 : -1 };
    return { axis: 'y', sign: this.host.dock() === 'top' ? 1 : -1 };
  }

  /** A drag of the bar: the sheet follows the pointer until it lets go. */
  private drag(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = this.el,
      { axis, sign } = this.growth(),
      r = this.sheet.getBoundingClientRect(),
      from = axis === 'x' ? e.clientX : e.clientY,
      size = axis === 'x' ? r.width : r.height;
    g.setPointerCapture?.(e.pointerId);
    this.sheet.addClass('is-resizing');
    const move = (m: PointerEvent) => {
      m.preventDefault();
      this.host.resize(size + sign * ((axis === 'x' ? m.clientX : m.clientY) - from));
    };
    const up = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      this.sheet.removeClass('is-resizing');
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  }

  /** The arrow keys across the bar move it a step; Home and End take it to its least and most. */
  private key(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { axis, sign } = this.growth(),
      across = this.host.across(),
      { least, most } = sheetBounds(this.host.dock(), across),
      keys: Record<string, number> =
        axis === 'x' ? { ArrowRight: sign, ArrowLeft: -sign } : { ArrowDown: sign, ArrowUp: -sign };
    let to: number | null = null;
    if (e.key in keys) to = this.host.span() + (keys[e.key] ?? 0) * RESIZE_STEP * across;
    else if (e.key === 'Home') to = least;
    else if (e.key === 'End') to = most;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    this.host.resize(to);
  }

  /** Says which way the bar lies and how big the sheet is (`span`), as a share of the screen across it. */
  say(span: number, across: number): void {
    if (across <= 0) return;
    const { least, most } = sheetBounds(this.host.dock(), across),
      pc = (n: number) => String(Math.round((n / across) * 100));
    this.el.setAttribute('aria-orientation', sideways(this.host.dock()) ? 'vertical' : 'horizontal');
    this.el.setAttribute('aria-valuemin', pc(least));
    this.el.setAttribute('aria-valuemax', pc(most));
    this.el.setAttribute('aria-valuenow', pc(span));
  }
}
