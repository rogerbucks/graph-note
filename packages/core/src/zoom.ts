// Zoom, pan and full-screen for a drawing (spec §3), with the gestures maps and photo apps have taught everyone. Host-free:
// the host passes plain events in and draws the view this returns. handle() says whether the event was used, so the host
// stops the browser's own handling only then — in a note the wheel and a one-finger drag still scroll the note.

/** The furthest the drawing zooms out. */
export const MIN_SCALE = 0.25;
/** The furthest the drawing zooms in. */
export const MAX_SCALE = 4;
/** One press of zoom in or zoom out. */
export const STEP = 1.25;
/** Two taps this close in time (ms) and place (px) are a double tap; a pointer that moves further than TAP_SLOP is a drag. */
const DOUBLE_TAP_MS = 300,
  DOUBLE_TAP_PX = 30,
  TAP_SLOP = 10;
/** How far one unit of wheel travel zooms: a mouse notch of 100 is about a fifth; a trackpad pinch sends small steps. */
const WHEEL_RATE = 0.002;

/** Where the drawing is shown: in a note, full-screen, or in the edit pane. Only in a note does the wheel alone scroll. */
export type Mode = 'note' | 'full' | 'pane';

/** A width and a height, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/** The drawing's scale, its top-left corner in the viewport, and its size there — set as its size, so text stays sharp. */
export interface View {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
  | { kind: 'dblclick'; x: number; y: number; onBox?: boolean };

/** `near`: down near a box or link, so a tap there chooses between them (the host's), and is never half of a double tap. */
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
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

  private readonly content: Size;
  private viewport: Size;
  private mode: Mode;

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
    const { width: cw, height: ch } = this.content,
      { width: vw, height: vh } = this.viewport;
    const raw = cw > 0 && ch > 0 ? Math.min(vw / cw, vh / ch) : 1;
    return clamp(raw, MIN_SCALE, this.mode === 'note' ? 1 : MAX_SCALE);
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
  touchAction(): 'pan-x pan-y' | 'none' {
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
    const s = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE),
      r = s / this.scale;
    this.place(s, px - (px - this.x) * r, py - (py - this.y) * r);
  }

  panBy(dx: number, dy: number): void {
    this.place(this.scale, this.x + dx, this.y + dy);
  }

  resize(viewport: Size): void {
    const fitted = this.isFitted();
    this.viewport = viewport;
    if (fitted) this.fit();
    else this.place(this.scale, this.x, this.y);
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
        if (e.onBox) return false;
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
      const s = clamp(this.pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d), MIN_SCALE, MAX_SCALE);
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

  /** Keeps the drawing in view: centred on an axis where it is smaller than the viewport, edge to edge where it is larger. */
  private clampPan(scale: number, x: number, y: number, centre = false): [number, number] {
    const w = this.content.width * scale,
      h = this.content.height * scale,
      { width: vw, height: vh } = this.viewport;
    const axis = (v: number, size: number, room: number) =>
      size <= room ? (room - size) / 2 : centre ? (room - size) / 2 : clamp(v, room - size, 0);
    return [axis(x, w, vw), axis(y, h, vh)];
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
