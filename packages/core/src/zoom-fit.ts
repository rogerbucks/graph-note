// The limits a drawing is zoomed and panned within (spec §3, §25): how far in and out it zooms, the scale that fits the
// whole drawing, and where it may sit in its viewport. Pure and host-free: zoom.ts's `Zoom`, and zoom-across.ts's
// `AcrossZoom` through it, hold a drawing to them, and work them out again from the sizes they hold each time they ask.

/** The furthest the drawing zooms out. */
export const MIN_SCALE = 0.25;
/** The furthest the drawing zooms in. */
export const MAX_SCALE = 4;
/** One press of zoom in or zoom out. */
export const STEP = 1.25;

/** Where the drawing is shown: in a note, full-screen, or in the edit pane. Only in a note does the wheel alone scroll. */
export type Mode = 'note' | 'full' | 'pane';

/** A width and a height, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/** `v` held between `lo` and `hi`. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The scale at which the whole drawing just fits its viewport; 1 for a drawing with no size. */
export function wholeFit(content: Size, viewport: Size): number {
  const { width: cw, height: ch } = content,
    { width: vw, height: vh } = viewport;
  return cw > 0 && ch > 0 ? Math.min(vw / cw, vh / ch) : 1;
}

/** The scale that shows the whole drawing: in a note never above natural size, as a note draws it; elsewhere up to the limit. */
export function fitScale(content: Size, viewport: Size, mode: Mode): number {
  return clamp(wholeFit(content, viewport), MIN_SCALE, mode === 'note' ? 1 : MAX_SCALE);
}

/** Where the drawing may sit: its viewport, the strip kept clear at the viewport's foot (§25), and its size there. */
export interface Room {
  content: Size;
  viewport: Size;
  /** The strip at the foot of the viewport kept clear, in pixels: what a sheet over it covers. */
  clear: number;
}

/**
 * Keeps the drawing in view: centred on an axis where it is smaller than the viewport, edge to edge where it is larger;
 * up and down, it may also rise into the strip kept clear at the foot, by as much as the strip and no further. With
 * `centre`, centred on both axes.
 */
export function clampPan(room: Room, scale: number, x: number, y: number, centre = false): [number, number] {
  const w = room.content.width * scale,
    h = room.content.height * scale,
    { width: vw, height: vh } = room.viewport;
  const range = (size: number, space: number): [number, number] =>
    size <= space ? [(space - size) / 2, (space - size) / 2] : [space - size, 0];
  const axis = (v: number, size: number, space: number) => {
    const [lo, hi] = range(size, space);
    return centre ? (space - size) / 2 : clamp(v, lo, hi);
  };
  if (centre || !room.clear) return [axis(x, w, vw), axis(y, h, vh)];
  const [lo, hi] = range(h, vh);
  return [axis(x, w, vw), clamp(y, Math.min(lo, vh - room.clear - h), hi)];
}
