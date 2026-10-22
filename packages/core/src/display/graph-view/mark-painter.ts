// Painting marks on a canvas (editor spec §53, scale_painters; wiki/Massive-graphs-design.md, way E, step 4). A massive
// graph's overview, and later its opened groups, are drawn here, never as SVG: SVG stalls past about 10,000 shapes.
//
// There are three painters, and the device picks: WebGPU where it works, else WebGL 2, else the plain 2D canvas. The
// choice is made by trying each, never by the platform's name. So an iPhone on iOS 26 gets WebGPU, and an older one
// WebGL 2. This file holds what they share, the 2D canvas painter, and the picking.
//
// A painter only paints. It is given the marks to draw, from the mark index (mark-index.ts), the camera and the
// colours. Text is always painted by the 2D canvas, on top: the graphics chip paints shapes, not words.
import type { BoxShape, DrawMark } from '../../drawing-marks.ts';
import type { Palette } from '../../palette.ts';
import type { MarkPoint } from '../../plugin-diagrams.ts';

/** Where the screen looks: the space's point at its top left corner, and screen pixels to each pixel of the space. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** How one style token is painted, each as a colour a canvas takes: a fill, a line and text. Any may be left out. */
export interface Paint {
  fill?: string;
  line?: string;
  text?: string;
}

/** The paint for each style token. */
export type Paints = (style: string) => Paint;

/** The kinds of painter, from the fastest. */
export type PainterKind = 'webgpu' | 'webgl2' | 'canvas';

/** Something that paints marks onto one canvas. */
export interface MarkPainter {
  readonly kind: PainterKind;
  /** The canvas's size in CSS pixels, and the device's pixels in each. Call it when the canvas is resized. */
  resize(width: number, height: number, ratio: number): void;
  /** Paints `marks` in order, the earlier underneath, as `camera` sees them. Each call paints a whole new frame. */
  paint(marks: readonly DrawMark[], camera: Camera, paints: Paints): void;
  /** Resolves once the graphics chip has finished the frames sent, so the canvas can be read, as for a picture. */
  painted(): Promise<void>;
  /** Lets go of what the painter holds, such as the graphics chip's memory. */
  destroy(): void;
}

/** A way to make a painter for a canvas, or null where the device cannot. It may wait, as WebGPU does. */
export type PainterMaker = (canvas: HTMLCanvasElement) => MarkPainter | null | Promise<MarkPainter | null>;

/**
 * The first painter `makers` can make for `canvas`, tried in order. A maker that fails or throws is passed over, so
 * a device that claims a feature it cannot give still gets a painter. Null only when none can paint at all. The 3D
 * view's painters (space-painter.ts) are picked the same way.
 */
export async function pickPainter<P extends { readonly kind: PainterKind } = MarkPainter>(
  canvas: HTMLCanvasElement,
  makers: readonly ((canvas: HTMLCanvasElement) => P | null | Promise<P | null>)[],
): Promise<P | null> {
  for (const make of makers) {
    try {
      const painter = await make(canvas);
      if (painter) return painter;
    } catch {
      // this device claims what it cannot do: the next painter is tried
    }
  }
  return null;
}

/**
 * The paint of each style token, from the drawing's palette. A token not named takes the paint of the token it
 * starts with, so `overview.link` is painted as `link` until a theme names it.
 */
export function paintsOf(palette: Palette): Paints {
  const table: Record<string, Paint> = {
    thing: { fill: palette.fill('blue'), line: palette.blend('blue', 60), text: palette.text },
    group: { fill: palette.fill('purple'), line: palette.blend('purple', 60), text: palette.text },
    link: { line: palette.edge },
    'thing.name': { text: palette.text },
    'overview.group': { fill: palette.fill('cyan'), line: palette.blend('cyan', 60) },
    'overview.name': { text: palette.text },
    'overview.count': { text: palette.muted },
  };
  return (style) => {
    for (let s = style; s; s = s.slice(0, Math.max(0, s.lastIndexOf('.')))) {
      const paint = table[s];
      if (paint) return paint;
    }
    return { line: palette.edge, text: palette.text };
  };
}

/** How a label's anchor is written on a canvas. */
const ALIGN = { start: 'left', middle: 'center', end: 'right' } as const;

/** The outline of a box of `shape` on `ctx`, in screen pixels. */
function outline(ctx: CanvasRenderingContext2D, shape: BoxShape, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'diamond') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else if (shape === 'round' && typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(w, h) / 4);
  else ctx.rect(x, y, w, h);
}

/** Paints one mark on `ctx`, as `camera` sees it. Only text when `textOnly`, for a painter on the graphics chip. */
function paintMark(ctx: CanvasRenderingContext2D, m: DrawMark, camera: Camera, paint: Paint, textOnly: boolean) {
  const { scale } = camera;
  const sx = (x: number) => (x - camera.x) * scale,
    sy = (y: number) => (y - camera.y) * scale;
  if (m.kind === 'label') {
    if (!paint.text) return;
    ctx.fillStyle = paint.text;
    ctx.font = `${m.size * scale}px sans-serif`;
    ctx.textAlign = ALIGN[m.anchor];
    ctx.textBaseline = 'alphabetic';
    if (m.maxWidth === undefined) ctx.fillText(m.text, sx(m.x), sy(m.y));
    else ctx.fillText(m.text, sx(m.x), sy(m.y), m.maxWidth * scale);
    return;
  }
  if (textOnly) return;
  // a board item and a fold are drawn as plain boxes until the whiteboard and the process views style them
  if (m.kind === 'box' || m.kind === 'group' || m.kind === 'item' || m.kind === 'fold') {
    outline(ctx, m.kind === 'box' ? (m.shape ?? 'rect') : 'rect', sx(m.x), sy(m.y), m.width * scale, m.height * scale);
    if (paint.fill) {
      ctx.fillStyle = paint.fill;
      ctx.fill();
    }
    if (paint.line) {
      ctx.strokeStyle = paint.line;
      ctx.stroke();
    }
    return;
  }
  if (!paint.line) return;
  if (m.kind === 'link') {
    const [first, ...rest] = m.points;
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(sx(first[0]), sy(first[1]));
    if (m.curve)
      for (let i = 0; i + 2 < rest.length; i += 3) {
        const [a, b, c] = rest.slice(i, i + 3) as [MarkPoint, MarkPoint, MarkPoint];
        ctx.bezierCurveTo(sx(a[0]), sy(a[1]), sx(b[0]), sy(b[1]), sx(c[0]), sy(c[1]));
      }
    else for (const p of rest) ctx.lineTo(sx(p[0]), sy(p[1]));
    ctx.strokeStyle = paint.line;
    ctx.stroke();
    return;
  }
  // an arrowhead: a triangle with its tip at (x, y), pointing along `angle` degrees; a board's marks are not painted yet
  if (m.kind !== 'arrowhead') return;
  const turn = (m.angle * Math.PI) / 180,
    size = m.size * scale,
    tipX = sx(m.x),
    tipY = sy(m.y);
  const corner = (side: number) => [
    tipX - size * Math.cos(turn) + (side * size * Math.sin(turn)) / 2,
    tipY - size * Math.sin(turn) - (side * size * Math.cos(turn)) / 2,
  ];
  const [ax = 0, ay = 0] = corner(1),
    [bx = 0, by = 0] = corner(-1);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fillStyle = paint.line;
  ctx.fill();
}

/**
 * The 2D canvas painter: every device has it. With `textOnly`, it paints only the labels, over a painter on the
 * graphics chip, on a canvas of its own laid over that one.
 */
export function canvasPainter(canvas: HTMLCanvasElement, textOnly = false): MarkPainter | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let ratio = 1;
  return {
    kind: 'canvas',
    resize(width, height, r) {
      ratio = r;
      canvas.width = Math.max(1, Math.round(width * r));
      canvas.height = Math.max(1, Math.round(height * r));
    },
    paint(marks, camera, paints) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 1;
      for (const m of marks) paintMark(ctx, m, camera, paints(m.style), textOnly);
    },
    painted: () => Promise.resolve(),
    destroy() {
      canvas.width = canvas.height = 0;
    },
  };
}
