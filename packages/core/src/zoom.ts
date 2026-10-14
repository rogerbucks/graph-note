// Zoom, pan and full-screen for a drawing (spec §3), with the gestures maps and photo apps have taught everyone. Host-free:
// the host passes plain events in and draws the view this returns. handle() says whether the event was used, so the host
// stops the browser's own handling only then — in a note the wheel and a one-finger drag still scroll the note. The
// limits it holds the drawing within are zoom-fit.ts's.
import { MAX_SCALE, STEP, clamp, clampPan, fitScale, hasSize, held, outLimit } from './zoom-fit.ts';
import type { Mode, Size } from './zoom-fit.ts';

export { MAX_SCALE, STEP } from './zoom-fit.ts';
export type { Mode, Size } from './zoom-fit.ts';

/** Two taps this close in time (ms) and place (px) are a double tap; a pointer that moves further than TAP_SLOP is a drag. */
const DOUBLE_TAP_MS = 300,
  DOUBLE_TAP_PX = 30,
  TAP_SLOP = 10;
/**
 * How much faster than the fingers a pinch zooms: each spread, as a factor, is raised to this power, so twice as far apart
 * is 2 ** 1.4 times the size. It was 1, following the fingers exactly (device checks Z-01 and Z-03; Roger, 11 Oct 2026:
 * "pinch zoom in and out should be a little quicker"). The limits still hold.
 */
const PINCH_RATE = 1.4;
/**
 * How far one unit of wheel travel zooms: a mouse notch of 100 is about a third (e ** 0.28, about 1.32). A trackpad pinch
 * sends small steps as the wheel with Ctrl, so it is as much quicker as a pinch on touch; and so is the wheel itself,
 * with Ctrl or Command in a note, and alone in full screen and the pane, which cannot be told from it.
 */
const WHEEL_RATE = 0.002 * PINCH_RATE;

/** The drawing's scale, its top-left corner in the viewport, and its size there — set as its size, so text stays sharp. */
export interface View {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A scale and the drawing's top-left corner in the viewport: where a view is, or is going (§25). */
export interface Place {
  scale: number;
  x: number;
  y: number;
}

interface Mods {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}
/** An input the host passes in: a key, the wheel, a pointer, or a double click. */
export type ZoomEvent =
  | ({ kind: 'key'; key: string } & Mods)
  | ({ kind: 'wheel'; x: number; y: number; dy: number } & Mods)
  | {
      kind: 'down';
      id: number;
      pointer: 'mouse' | 'touch' | 'pen';
      x: number;
      y: number;
      onBox?: boolean;
      near?: boolean;
    }
  | { kind: 'move'; id: number; x: number; y: number }
  | { kind: 'up'; id: number; x: number; y: number; time: number }
  | { kind: 'cancel'; id: number }
  | { kind: 'dblclick'; x: number; y: number; onBox?: boolean; near?: boolean };

/**
 * `near`: down, or a double click, near a box or link, so a tap or click there chooses between them (the host's), and is
 * never half of a double tap, nor a double click that zooms (tap_cycles_near, §3).
 */
interface Pointer {
  touch: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
  onBox: boolean;
  near: boolean;
  pans: boolean;
}
interface Pinch {
  d: number;
  px: number;
  py: number;
  scale: number;
}

const EPS = 1e-9;

/** Zoom and pan for one drawing: takes the host's events, and reports the view to draw. */
export class Zoom {
  /** Called with the new view whenever it changes. */
  onChange?: (view: View) => void;
  /** Called when Escape asks to leave full-screen. */
  onExit?: () => void;

  private scale = 1;
  private x = 0;
  private y = 0;
  private readonly pointers = new Map<number, Pointer>();
  private pinch: Pinch | null = null;
  private lastTap: { x: number; y: number; time: number } | null = null;
  /** The strip at the foot of the viewport kept clear, in pixels: what a sheet over it covers (§25). */
  private clear = 0;
  /** Whether the drawing was fitted when its card was hidden, so it is fitted again when it shows (§25). */
  private refit = false;

  protected content: Size;
  protected viewport: Size;
  protected mode: Mode;

  constructor(content: Size, viewport: Size, mode: Mode) {
    this.content = content;
    this.viewport = viewport;
    this.mode = mode;
    this.place(this.fitScale(), 0, 0, true);
  }

  view(): View {
    return {
      scale: this.scale,
      x: this.x,
      y: this.y,
      width: this.content.width * this.scale,
      height: this.content.height * this.scale,
    };
  }

  /** The scale that shows the whole drawing: in a note never above natural size, as a note draws it; elsewhere up to the limit. */
  fitScale(): number {
    return fitScale(this.content, this.viewport, this.mode);
  }

  isFitted(): boolean {
    const f = this.fitScale(),
      [x, y] = this.clampPan(f, 0, 0, true);
    return Math.abs(this.scale - f) < EPS && Math.abs(this.x - x) < EPS && Math.abs(this.y - y) < EPS;
  }

  /** Whether the drawing is larger than it is when fitted — then one finger pans it rather than scrolling the note. */
  zoomedIn(): boolean {
    return this.scale > this.fitScale() + EPS;
  }

  /** The CSS touch-action the host sets: the browser scrolls the note with one finger unless the drawing is zoomed in. */
  touchAction(): 'pan-x pan-y' | 'pan-y' | 'none' {
    return this.zoomedIn() ? 'none' : 'pan-x pan-y';
  }

  fit(): void {
    this.place(this.fitScale(), 0, 0, true);
  }
  zoomIn(): void {
    this.zoomAt(STEP, this.viewport.width / 2, this.viewport.height / 2);
  }
  zoomOut(): void {
    this.zoomAt(1 / STEP, this.viewport.width / 2, this.viewport.height / 2);
  }

  /** Zooms by `factor` about a point of the viewport, which stays where it is unless the limits stop it. */
  zoomAt(factor: number, px: number, py: number): void {
    const s = held(this.scale * factor, this.content, this.viewport),
      r = s / this.scale;
    this.place(s, px - (px - this.x) * r, py - (py - this.y) * r);
  }

  /** Shows the drawing at a scale and position saved before (a view saved as shown, spec §7), within the limits. */
  restore(scale: number, x: number, y: number): void {
    this.place(held(scale, this.content, this.viewport), x, y);
  }

  /**
   * Brings a rectangle of the drawing into view (finding a thing, §25), given as fractions of the drawing's width and
   * height. One already wholly in view is left where it is; any other is centred, at the same scale, as far as the
   * drawing's edges allow.
   */
  reveal(box: { x: number; y: number; width: number; height: number }): void {
    const to = this.aim(box);
    if (to) this.place(to.scale, to.x, to.y);
  }

  /**
   * Where the view would go to bring a rectangle of the drawing (fractions of it) wholly into the part of the viewport not
   * kept clear, without going there: null when it is already there at a scale of at least `minScale`. Otherwise the zoom
   * is kept, or raised to `minScale` when it is below (a thing too small to read, §25), and the rectangle centred in that
   * part, as far as the drawing's edges and the strip kept clear allow.
   */
  aim(box: { x: number; y: number; width: number; height: number }, minScale = 0): Place | null {
    const { width: cw, height: ch } = this.content,
      vw = this.viewport.width,
      room = this.viewport.height - this.clear,
      s = Math.max(this.scale, Math.min(minScale, MAX_SCALE));
    const left = this.x + box.x * cw * s,
      top = this.y + box.y * ch * s;
    const inView = left >= 0 && top >= 0 && left + box.width * cw * s <= vw && top + box.height * ch * s <= room;
    if (s === this.scale && inView) return null;
    const [x, y] = this.clampPan(
      s,
      vw / 2 - (box.x + box.width / 2) * cw * s,
      room / 2 - (box.y + box.height / 2) * ch * s,
    );
    return { scale: s, x, y };
  }

  /**
   * Keeps a strip of `bottom` pixels at the foot of the viewport clear, as a sheet over it covers it (§25): the drawing
   * may pan up into it, by as much and no further, so a thing near its bottom can be seen above the sheet. Zero, as at
   * first, puts it back within its edges.
   */
  keepClear(bottom: number): void {
    this.clear = clamp(bottom, 0, this.viewport.height);
    this.place(this.scale, this.x, this.y);
  }

  panBy(dx: number, dy: number): void {
    this.place(this.scale, this.x + dx, this.y + dy);
  }

  /**
   * A new viewport, and the drawing's size too when the View menu laid it out again (§25). A fitted drawing is fitted
   * again; any other keeps its zoom, brought up about the viewport's middle to the fit worked out again if that is above
   * it (zoom_fit_recomputed). A viewport with no size (a hidden card's) is no resize: only the drawing's size is taken,
   * and the view kept, or, fitted then (`refit`), fitted again at the next resize with a size.
   */
  resize(viewport: Size, content = this.content): void {
    const fitted = this.refit || this.isFitted();
    this.content = content;
    this.refit = fitted && !hasSize(viewport);
    if (!hasSize(viewport)) return;
    this.viewport = viewport;
    if (fitted) {
      this.fit();
      return;
    }
    const s = held(this.scale, this.content, viewport),
      r = s / this.scale,
      [mx, my] = [viewport.width / 2, viewport.height / 2];
    this.place(s, mx - (mx - this.x) * r, my - (my - this.y) * r);
  }

  /**
   * The furthest the drawing zooms out now (zoom_out_to_fit): where the whole of it fits the viewport, or natural size
   * when it fits larger; worked out again from the viewport and drawing as they are each time it is asked.
   */
  outLimit(): number {
    return outLimit(this.content, this.viewport);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.fit();
  }

  /** Takes one event; returns true when it was used, so the host should stop the browser's own handling of it. */
  handle(e: ZoomEvent): boolean {
    switch (e.kind) {
      case 'key':
        return this.key(e);
      case 'wheel': {
        if (this.mode === 'note' && !e.ctrl && !e.meta) return false;
        this.zoomAt(Math.exp(-e.dy * WHEEL_RATE), e.x, e.y);
        return true;
      }
      case 'dblclick':
        if (e.onBox || e.near) return false;
        this.zoomAt(2, e.x, e.y);
        return true;
      case 'down':
        return this.down(e);
      case 'move':
        return this.move(e);
      case 'up':
        return this.up(e);
      case 'cancel':
        this.pointers.delete(e.id);
        this.pinch = null;
        return false;
    }
  }

  private key(e: Extract<ZoomEvent, { kind: 'key' }>): boolean {
    if (e.ctrl || e.meta || e.alt) return false;
    if (e.key === '+' || e.key === '=') this.zoomIn();
    else if (e.key === '-') this.zoomOut();
    else if (e.key === '0') this.fit();
    else if (e.key === 'Escape' && this.mode === 'full') this.onExit?.();
    else return false;
    return true;
  }

  private down(e: Extract<ZoomEvent, { kind: 'down' }>): boolean {
    const touch = e.pointer === 'touch';
    const pans = !e.onBox && (!touch || this.zoomedIn());
    this.pointers.set(e.id, {
      touch,
      x: e.x,
      y: e.y,
      sx: e.x,
      sy: e.y,
      moved: false,
      onBox: !!e.onBox,
      near: !!e.near,
      pans,
    });
    const touches = [...this.pointers.values()].filter((p) => p.touch);
    if (touch && touches.length === 2) {
      this.startPinch(touches);
      return true;
    }
    return pans;
  }

  private startPinch([a, b]: Pointer[]): void {
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    this.pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      px: (mx - this.x) / this.scale,
      py: (my - this.y) / this.scale,
      scale: this.scale,
    };
    for (const p of [a, b]) p.moved = true; // a pinch is never a tap
  }

  private move(e: Extract<ZoomEvent, { kind: 'move' }>): boolean {
    const p = this.pointers.get(e.id);
    if (!p) return false;
    const dx = e.x - p.x,
      dy = e.y - p.y;
    p.x = e.x;
    p.y = e.y;
    if (Math.hypot(e.x - p.sx, e.y - p.sy) > TAP_SLOP) p.moved = true;
    if (this.pinch) {
      const [a, b] = [...this.pointers.values()].filter((q) => q.touch);
      if (!a || !b) return false;
      const spread = Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d;
      const s = held(this.pinch.scale * spread ** PINCH_RATE, this.content, this.viewport);
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      this.place(s, mx - this.pinch.px * s, my - this.pinch.py * s);
      return true;
    }
    if (!p.pans) return false;
    this.panBy(dx, dy);
    return true;
  }

  private up(e: Extract<ZoomEvent, { kind: 'up' }>): boolean {
    const p = this.pointers.get(e.id);
    this.pointers.delete(e.id);
    if (this.pinch && [...this.pointers.values()].filter((q) => q.touch).length < 2) {
      this.pinch = null;
      for (const q of this.pointers.values()) {
        q.moved = true;
        q.sx = q.x;
        q.sy = q.y;
      } // the finger left behind does not jump
      return true;
    }
    if (!p || !p.touch || p.moved || p.onBox || p.near) return !!p?.pans;
    const last = this.lastTap;
    if (last && e.time - last.time <= DOUBLE_TAP_MS && Math.hypot(e.x - last.x, e.y - last.y) <= DOUBLE_TAP_PX) {
      this.lastTap = null;
      this.zoomAt(2, e.x, e.y);
      return true;
    }
    this.lastTap = { x: e.x, y: e.y, time: e.time };
    return p.pans;
  }

  /** Keeps the drawing in view, as zoom-fit.ts's `clampPan` says, in this viewport and with this strip kept clear. */
  private clampPan(scale: number, x: number, y: number, centre = false): [number, number] {
    return clampPan({ content: this.content, viewport: this.viewport, clear: this.clear }, scale, x, y, centre);
  }

  private place(scale: number, x: number, y: number, centre = false): void {
    const [cx, cy] = this.clampPan(scale, x, y, centre);
    if (scale === this.scale && cx === this.x && cy === this.y) return;
    this.scale = scale;
    this.x = cx;
    this.y = cy;
    this.onChange?.(this.view());
  }
}
