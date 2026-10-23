// Moving about a graph too large to draw (editor spec §53, scale_massive_card, scale_explore_trail). Drag to move,
// scroll to zoom. The keyboard does the same: arrows move, + and - zoom, Home shows it all again. Alt with the left or
// right arrow steps back or forward along the trail. A click that does not move chooses what is under it (a thing
// found by search is chosen too). The view itself is massive-view.ts.

/** How far a key press moves the view, in screen pixels. */
const KEY_STEP = 48;

/** What the stage's moves do in the overview. */
export interface MoveHooks {
  /** Zooms by `k`, about the screen point `sx`, `sy`, or the middle when not given. */
  zoom(k: number, sx?: number, sy?: number): void;
  /** Moves the view by `dx`, `dy` screen pixels. */
  move(dx: number, dy: number): void;
  /** Shows it all again. */
  home(): void;
  back(): void;
  forward(): void;
  /** Chooses what is at the screen point `sx`, `sy`. */
  pick(sx: number, sy: number): void;
}

/** How far a press may move, in screen pixels, and still be a click rather than a drag. */
const STILL = 4;

/** Listens on `stage` for drags, scrolls and keys, and does each as `h` says. */
export function moveControls(stage: HTMLElement, h: MoveHooks): void {
  let dragging: { id: number; x: number; y: number; moved: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    const [dx, dy] = [e.clientX - dragging.x, e.clientY - dragging.y];
    h.move(dx, dy);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: dragging.moved + Math.hypot(dx, dy) };
  });
  stage.addEventListener('pointerup', (e) => {
    const at = stage.getBoundingClientRect();
    if (dragging?.id === e.pointerId && dragging.moved < STILL) h.pick(e.clientX - at.left, e.clientY - at.top);
    dragging = null;
  });
  stage.addEventListener('pointercancel', () => (dragging = null));
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const at = stage.getBoundingClientRect();
      h.zoom(Math.pow(1.0015, -e.deltaY), e.clientX - at.left, e.clientY - at.top);
    },
    { passive: false },
  );
  stage.addEventListener('keydown', (e) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const by = moves[e.key];
    if (e.altKey && e.key === 'ArrowLeft') h.back();
    else if (e.altKey && e.key === 'ArrowRight') h.forward();
    else if (by) h.move(...by);
    else if (e.key === '+' || e.key === '=') h.zoom(1.25);
    else if (e.key === '-') h.zoom(0.8);
    else if (e.key === 'Home') h.home();
    else return;
    e.preventDefault();
  });
}
