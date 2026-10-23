// Moving about a graph too large to draw (editor spec §53, scale_massive_card, scale_explore_trail). Drag to move,
// scroll to zoom. The keyboard does the same: arrows move, + and - zoom, Home shows it all again. Alt with the left or
// right arrow steps back or forward along the trail. The view itself is massive-view.ts.

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
}

/** Listens on `stage` for drags, scrolls and keys, and does each as `h` says. */
export function moveControls(stage: HTMLElement, h: MoveHooks): void {
  let dragging: { id: number; x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    h.move(e.clientX - dragging.x, e.clientY - dragging.y);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  const letGo = () => (dragging = null);
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', letGo);
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
