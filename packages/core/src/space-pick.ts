// Picking in the 3D view (editor spec §53, scale_space_view). It finds what is under a pixel of the screen, so a click
// or tap can pick it. A box is picked by its top or a side; a ball by the circle it makes on the screen. Host-free and pure.
import { FIELD, projectPoint } from './space-view.ts';
import type { Block, SpaceMarks } from './space-view.ts';

/** A block's faces as rings of four corners: its top, then its four sides. Its floor is never seen from above. */
const FACES = [
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
] as const;

/**
 * The nearest block with a face, its top or a side, covering screen pixel (`x`, `y`), so a click can pick one. A
 * tall block is picked by its side as well as its top (Roger, 23 Oct 2026).
 */
export function blockAt(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Block | null {
  let best: Block | null = null,
    bestFar = Infinity;
  for (const b of space.blocks) {
    if (space.round) {
      // a ball is picked inside the circle it makes on the screen
      const r = b.width / 2;
      const c = projectPoint(matrix, [b.x + r, b.y + r, b.floor + r], width, height);
      if (!c) continue;
      if (Math.hypot(x - c.x, y - c.y) <= (r * height) / 2 / Math.tan(FIELD / 2) / c.far && c.far < bestFar) {
        best = b;
        bestFar = c.far;
      }
      continue;
    }
    const ring = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.depth],
      [b.x, b.y + b.depth],
    ] as const;
    const corners = [b.floor, b.floor + b.tall].flatMap((z) =>
      ring.map(([cx, cy]) => projectPoint(matrix, [cx, cy, z], width, height)),
    );
    if (corners.some((c) => !c)) continue;
    const at = corners as { x: number; y: number; far: number }[];
    for (const face of FACES) {
      const quad = face.map((k) => at[k] as { x: number; y: number; far: number });
      if (!inside(quad, x, y)) continue;
      const far = quad.reduce((n, c) => n + c.far, 0) / 4;
      if (far < bestFar) {
        best = b;
        bestFar = far;
      }
    }
  }
  return best;
}

/** Whether (`x`, `y`) is inside the four-sided shape `quad`, whichever way round its corners go. */
function inside(quad: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i] as { x: number; y: number },
      b = quad[(i + 1) % quad.length] as { x: number; y: number };
    const side = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (side === 0) continue;
    if (sign === 0) sign = side;
    else if (side !== sign) return false;
  }
  return true;
}
