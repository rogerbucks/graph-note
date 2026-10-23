// How the 3D view is moved (editor spec §53, scale_space_controls). Roger, 23 Oct 2026: the controls were unclear. You
// could only turn and zoom round the middle, and nothing on screen said how.
//
// So every move has a mouse way, a touch way, a key and a button, and the view says so on screen:
// - turn: drag, one finger, the arrow keys, or the turn buttons;
// - move across: Shift-drag or right-drag, two fingers, Shift and the arrow keys;
// - zoom: scroll, pinch, + and -, or the zoom buttons;
// - show it all again: Home, 0, or Reset view.
// The sums live here, so they are tested without a screen. Host-free and pure.
import { FIELD } from './space-view.ts';
import type { Orbit } from './space-view.ts';

/** How far a key press turns, tilts or moves the camera, as a drag of this many pixels would. */
export const KEY_STEP = 24;
/** How much one press of + or - zooms. */
export const ZOOM_STEP = 1.25;

/**
 * `orbit` moved across the floor by a drag of `dx` and `dy` pixels on a screen `height` pixels high. What is under
 * the pointer follows it: drag right and the drawing goes right; drag down and it comes nearer. The camera keeps its
 * turn, tilt and distance.
 */
export function panBy(orbit: Orbit, dx: number, dy: number, height: number): Orbit {
  // how far one pixel is, in the space, at the point the camera looks at
  const unit = (2 * orbit.distance * Math.tan(FIELD / 2)) / Math.max(1, height);
  // seen from above, a pixel down the screen is one pixel along the floor; seen low, it is many more
  const along = unit / Math.max(0.25, Math.sin(orbit.tilt));
  const c = Math.cos(orbit.turn),
    s = Math.sin(orbit.turn);
  // the camera's right on the floor is (-s, c), and its forward, away from the eye, is (-c, -s)
  const [x, y, z] = orbit.target;
  return {
    ...orbit,
    target: [x + s * dx * unit - c * dy * along, y - c * dx * unit - s * dy * along, z],
  };
}

/** One move the view makes. */
export type SpaceMove =
  | { turn: [number, number] }
  | { pan: [number, number] }
  | { zoom: number }
  | { reset: true }
  | { help: true }
  | { back: true };

/** The move a key makes, or null for a key the view leaves alone. `shift` says whether Shift is held. */
export function keyMove(key: string, shift: boolean): SpaceMove | null {
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-KEY_STEP, 0],
    ArrowRight: [KEY_STEP, 0],
    ArrowUp: [0, -KEY_STEP],
    ArrowDown: [0, KEY_STEP],
  };
  const arrow = arrows[key];
  // Shift and an arrow moves the view the way the arrow points, as in a map: the drawing slides the other way
  if (arrow) return shift ? { pan: [0 - arrow[0], 0 - arrow[1]] } : { turn: arrow };
  if (key === '+' || key === '=') return { zoom: ZOOM_STEP };
  if (key === '-' || key === '_') return { zoom: 1 / ZOOM_STEP };
  if (key === 'Home' || key === '0') return { reset: true };
  if (key === '?') return { help: true };
  if (key === 'Escape') return { back: true };
  return null;
}

/** A finger on the screen, at a pixel. */
export interface Touch {
  x: number;
  y: number;
}

/**
 * What two fingers did as they moved from `was` to `now`. It gives how far their middle moved, and how much to zoom:
 * spreading them apart zooms in.
 */
export function twoFingers(
  was: readonly [Touch, Touch],
  now: readonly [Touch, Touch],
): { dx: number; dy: number; zoom: number } {
  const middle = (t: readonly [Touch, Touch]) => [(t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2] as const;
  const apart = (t: readonly [Touch, Touch]) => Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
  const [x0, y0] = middle(was),
    [x1, y1] = middle(now);
  const before = apart(was);
  return { dx: x1 - x0, dy: y1 - y0, zoom: before > 0 ? apart(now) / before : 1 };
}
