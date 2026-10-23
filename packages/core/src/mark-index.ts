// Finding the marks on screen fast (editor spec §53, scale_overview; wiki/Massive-graphs-design.md, way E, step 4). A
// renderer asks for the marks in view on every pan and zoom, so it must never walk all of them.
//
// The drawing's space is cut into a grid of cells, about one for each mark. Each cell lists the marks that touch it.
// A view reads only the cells it covers. Marks are given back in drawing order. A mark too small to see at the scale
// is left out. That is a label whose text would be too small to read, or a box or link under a pixel.
//
// Host-free and pure. It is built once for a drawing, and again only when the marks change.
import { drawOrder, markBounds } from './drawing-marks.ts';
import type { DrawMark, MarkBounds } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import { at } from './louvain.ts';

/** The smallest text drawn, in screen pixels. Smaller text cannot be read, so it is left out. */
export const TEXT_LEAST = 6;
/** The smallest box or link drawn, in screen pixels. */
const SEEN_LEAST = 1;
/** A mark over this many cells, such as a long link, is kept in a list of its own, so the grid stays small. */
const CELLS_MOST = 64;

/** The marks of a drawing, by where they are, ready to be asked which are in view. */
export class MarkIndex {
  /** The marks, in drawing order. */
  readonly marks: DrawMark[];
  private readonly bounds: MarkBounds[];
  private readonly cell: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly start: Int32Array;
  private readonly list: Int32Array;
  private readonly seen: Int32Array;
  /** The marks over `CELLS_MOST` cells, checked by their bounds on every ask. */
  private readonly wide: number[] = [];
  private asked = 0;

  constructor({ space, marks }: LaidMarks) {
    this.marks = drawOrder(marks);
    this.bounds = this.marks.map(markBounds);
    const area = Math.max(1, space.width * space.height);
    this.cell = Math.max(1, Math.sqrt(area / Math.max(1, this.marks.length)));
    this.columns = Math.max(1, Math.ceil(space.width / this.cell));
    this.rows = Math.max(1, Math.ceil(space.height / this.cell));
    const cells = this.columns * this.rows;
    this.start = new Int32Array(cells + 1);
    this.each((c) => (this.start[c + 1] = at(this.start, c + 1) + 1));
    for (let c = 0; c < cells; c++) this.start[c + 1] = at(this.start, c + 1) + at(this.start, c);
    const fill = this.start.slice(0, cells);
    this.list = new Int32Array(at(this.start, cells));
    this.each((c, i) => {
      this.list[at(fill, c)] = i;
      fill[c] = at(fill, c) + 1;
    });
    this.seen = new Int32Array(this.marks.length);
  }

  /** `visit` called for every cell each mark touches, with the cell's number and the mark's place. */
  private each(visit: (cell: number, mark: number) => void): void {
    const first = !this.wide.length;
    this.bounds.forEach((b, i) => {
      if (this.span(b) > CELLS_MOST) {
        if (first) this.wide.push(i);
      } else this.cells(b, (c) => visit(c, i));
    });
  }

  /** How many cells `b` touches. */
  private span(b: MarkBounds): number {
    const across = (from: number, size: number) =>
      Math.floor((from + size) / this.cell) - Math.floor(from / this.cell) + 1;
    return across(b.x, b.width) * across(b.y, b.height);
  }

  /** `visit` called for every cell `b` touches. */
  private cells(b: MarkBounds, visit: (cell: number) => void): void {
    const clamp = (v: number, most: number) => Math.min(most - 1, Math.max(0, Math.floor(v / this.cell)));
    const x0 = clamp(b.x, this.columns),
      x1 = clamp(b.x + b.width, this.columns),
      y0 = clamp(b.y, this.rows),
      y1 = clamp(b.y + b.height, this.rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit(y * this.columns + x);
  }

  /** The places of the marks that touch `view`, in drawing order, each once. */
  inView(view: MarkBounds): number[] {
    const found: number[] = [];
    const ask = ++this.asked;
    this.cells(view, (c) => {
      for (let k = at(this.start, c); k < at(this.start, c + 1); k++) {
        const i = at(this.list, k);
        if (at(this.seen, i) === ask) continue;
        this.seen[i] = ask;
        if (touches(this.bounds[i] as MarkBounds, view)) found.push(i);
      }
    });
    for (const i of this.wide) if (touches(this.bounds[i] as MarkBounds, view)) found.push(i);
    return found.sort((a, b) => a - b);
  }

  /**
   * The marks to draw for `view`, a part of the space, at `scale` screen pixels to each pixel of the space. Marks off
   * screen, labels too small to read and marks under a pixel are left out.
   */
  visible(view: MarkBounds, scale: number): DrawMark[] {
    return this.inView(view)
      .filter((i) => seen(this.marks[i] as DrawMark, this.bounds[i] as MarkBounds, scale))
      .map((i) => this.marks[i] as DrawMark);
  }
}

/** Whether `a` and `b` overlap or meet. */
const touches = (a: MarkBounds, b: MarkBounds) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

/** Whether mark `m`, with bounds `b`, can be seen at `scale`. */
function seen(m: DrawMark, b: MarkBounds, scale: number): boolean {
  if (m.kind === 'label') return m.size * scale >= TEXT_LEAST;
  if (m.kind === 'arrowhead') return m.size * scale >= SEEN_LEAST;
  return Math.max(b.width, b.height) * scale >= SEEN_LEAST;
}

/**
 * The marks of `marks` to draw for `view` at `scale`, as `MarkIndex.visible` gives them, by walking every mark once.
 * For marks that move on every frame, such as groups gliding after a filter, where building an index each frame would
 * cost more. `marks` must be in drawing order already.
 */
export function visibleOf(marks: readonly DrawMark[], view: MarkBounds, scale: number): DrawMark[] {
  return marks.filter((m) => {
    const b = markBounds(m);
    return touches(b, view) && seen(m, b, scale);
  });
}
