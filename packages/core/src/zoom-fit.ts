// The limits a drawing is zoomed and panned within (spec §3, §25). They are how far in and out it zooms, the scale that
// fits the whole drawing, and where it may sit in its viewport. Pure and host-free. zoom.ts's `Zoom` holds a drawing to
// them, and zoom-across.ts's `AcrossZoom` does through it. They work them out again from the sizes they hold each time
// they ask. So a resized view, full screen entered or left, or a drawing laid out again has its own
// (zoom_fit_recomputed).
//
// From slice 3 the furthest out is the fit (zoom_out_to_fit). That is where the whole drawing fits its view, or natural
// size when it would fit larger. It replaces §3's quarter of natural size. So a drawing that fits only below a quarter
// can still be seen whole. Four times natural size stays the furthest in.

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
  /** A drawing read right to left (§42): it starts at its right end. */
  fromRight?: boolean;
}

/** `v` held between `lo` and `hi`. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The scale at which the whole drawing just fits its viewport; 1, natural size, for a drawing or a view with no size. */
export function wholeFit(content: Size, viewport: Size): number {
  const { width: cw, height: ch } = content,
    { width: vw, height: vh } = viewport;
  return cw > 0 && ch > 0 && vw > 0 && vh > 0 ? Math.min(vw / cw, vh / ch) : 1;
}

/** Whether a viewport has a size: one with none (its card hidden, or not yet laid out) has no fit to hold a drawing to. */
export const hasSize = (viewport: Size): boolean => viewport.width > 0 && viewport.height > 0;

/**
 * The furthest the drawing zooms out (zoom_out_to_fit): where the whole of it fits, or natural size if it fits larger.
 * 0 while the viewport has no size: no fit is known yet, so a zoom restored before layout is kept until there is one.
 */
export function outLimit(content: Size, viewport: Size): number {
  return hasSize(viewport) ? Math.min(wholeFit(content, viewport), 1) : 0;
}

/** A scale held within the limits: no further out than the fit, if one is known, and never 0; no further in than 4. */
export function held(scale: number, content: Size, viewport: Size): number {
  return clamp(scale, outLimit(content, viewport) || Number.MIN_VALUE, MAX_SCALE);
}

/** The scale that shows the whole drawing: in a note never above natural size, as a note draws it; elsewhere up to the limit. */
export function fitScale(content: Size, viewport: Size, mode: Mode): number {
  return Math.min(wholeFit(content, viewport), mode === 'note' ? 1 : MAX_SCALE);
}

/** Where the drawing may sit: its viewport, the strip kept clear at the viewport's foot (§25), and its size there. */
export interface Room {
  content: Size;
  viewport: Size;
  /** The strip at the foot of the viewport kept clear, in pixels: what a sheet over it covers. */
  clear: number;
}

/**
 * Keeps the drawing in view. It is centred on an axis where it is smaller than the viewport, edge to edge where it is
 * larger. Up and down, it may also rise into the strip kept clear at the foot, by as much as the strip and no further.
 * With `centre`, centred on both axes.
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
