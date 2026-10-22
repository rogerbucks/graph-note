// The 2D canvas painter of the 3D view (editor spec §53, scale_space_painters), for a device with neither WebGPU nor
// WebGL 2. And the 3D view's text, which the 2D canvas always paints, on a canvas laid over the shapes. At most
// LABELS_MOST labels are painted (space-view.ts), nearest on top.
import type { Block, ScreenLabel, Vec3 } from '../../space-view.ts';
import { projectPoint } from '../../space-view.ts';
import type { Paints } from './mark-painter.ts';
import type { SpacePainter } from './space-painter.ts';

/** A block's four top corners and four floor corners, as points of the space. */
function cornersOf(b: Block): Vec3[] {
  const ring = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.depth],
    [b.x, b.y + b.depth],
  ] as const;
  return [...ring.map(([x, y]): Vec3 => [x, y, b.floor + b.tall]), ...ring.map(([x, y]): Vec3 => [x, y, b.floor])];
}

/**
 * The 2D canvas painter of the 3D view: every device has it. It paints each block's sides and top, far blocks first,
 * so near ones cover them. It is slower than the graphics chip, so it suits a few thousand blocks.
 */
export function canvasSpacePainter(canvas: HTMLCanvasElement): SpacePainter | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let width = 1,
    height = 1,
    ratio = 1;
  return {
    kind: 'canvas',
    resize(w, h, r) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      ratio = r;
      canvas.width = Math.max(1, Math.round(w * r));
      canvas.height = Math.max(1, Math.round(h * r));
    },
    paint(space, matrix, paints) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 1;
      const placed = space.blocks
        .map((b) => ({ b, at: cornersOf(b).map((p) => projectPoint(matrix, p, width, height)) }))
        .filter(({ at }) => at.every((p) => p !== null))
        .map(({ b, at }) => {
          const points = at as { x: number; y: number; far: number }[];
          return { b, points, far: points.reduce((n, p) => n + p.far, 0) / points.length };
        })
        .sort((a, b) => b.far - a.far);
      for (const { b, points } of placed) {
        const paint = paints(b.style);
        // the four sides, far ones first, then the top: so the sides facing the camera cover the ones facing away
        const farOf = (face: number[]) => face.reduce((n, k) => n + (points[k]?.far ?? 0), 0);
        const sides = [
          [0, 1, 5, 4],
          [1, 2, 6, 5],
          [2, 3, 7, 6],
          [3, 0, 4, 7],
        ].sort((a, b) => farOf(b) - farOf(a));
        for (const face of [...sides, [0, 1, 2, 3]]) {
          ctx.beginPath();
          face.forEach((k, i) => {
            const p = points[k] as { x: number; y: number };
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          if (paint.fill) {
            ctx.fillStyle = paint.fill;
            ctx.fill();
          }
          if (paint.line) {
            ctx.strokeStyle = paint.line;
            ctx.stroke();
          }
        }
      }
      for (const l of space.lines) {
        const line = paints(l.style).line;
        if (!line) continue;
        ctx.beginPath();
        let drawing = false;
        for (const p of l.points) {
          const at = projectPoint(matrix, p, width, height);
          if (!at) {
            drawing = false;
            continue;
          }
          if (drawing) ctx.lineTo(at.x, at.y);
          else ctx.moveTo(at.x, at.y);
          drawing = true;
        }
        ctx.strokeStyle = line;
        ctx.stroke();
      }
    },
    painted: () => Promise.resolve(),
    destroy() {
      canvas.width = canvas.height = 0;
    },
  };
}

/** Paints `labels` on `ctx`, already at their pixels, with a halo of the page colour so they read over blocks. */
export function paintSpaceLabels(
  ctx: CanvasRenderingContext2D,
  labels: readonly ScreenLabel[],
  paints: Paints,
  ratio: number,
  halo: string,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // far ones first, so the nearest is on top
  for (const l of [...labels].reverse()) {
    const text = paints(l.style).text;
    if (!text) continue;
    ctx.font = `${l.size}px sans-serif`;
    ctx.lineWidth = Math.max(2, l.size / 5);
    ctx.strokeStyle = halo;
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = text;
    ctx.fillText(l.text, l.x, l.y);
  }
}
