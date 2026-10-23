// Growing the picture from one thing (editor spec §53, scale_expand_on_demand). Roger, 22 Oct 2026: in a massive graph
// the reader starts from one thing and asks for more, one step at a time. Never the whole graph at once.
//
// An expansion starts at a thing. Each step adds the things one link further out: its ring. A ring too big to read is
// cut to its best-linked things, and the whole is never more than can be laid out at once. A step back takes the last
// ring away. `part` is the drawing cut down to what is kept, to lay out on its own.
//
// Host-free and pure: it reads the drawing, and never changes it.
import { adjacency, edgesOf } from './focus.ts';
import type { GraphDrawing } from './note-reading.ts';

/** The most things one step adds: more is a crowd, not an answer. */
export const RING_MOST = 60;
/** The most things an expansion holds in all, so it can always be laid out in one go. */
export const EXPANSION_MOST = 400;

/** The things kept around one thing, a ring per step, and the drawing to lay out for them. */
export class Expansion {
  /** The rings, nearest first: the first holds only the thing it starts from. */
  readonly rings: string[][];
  /** How many things each ring left out, as too many to show. */
  readonly cut: number[];
  private readonly drawing: GraphDrawing;
  private readonly adj: Map<string, [number, string][]>;
  private readonly kept: Set<string>;

  /** An expansion of `drawing` from thing `from`. */
  constructor(drawing: GraphDrawing, from: string) {
    this.drawing = drawing;
    this.adj = adjacency(edgesOf(drawing));
    this.rings = [[from]];
    this.cut = [0];
    this.kept = new Set([from]);
  }

  /** The thing it starts from. */
  get from(): string {
    return this.rings[0]?.[0] as string;
  }

  /** How many steps out it reaches. */
  get steps(): number {
    return this.rings.length - 1;
  }

  /** Every thing kept, in rings, nearest first. */
  keys(): string[] {
    return this.rings.flat();
  }

  /**
   * One step further out: the things linked to the last ring that are not kept yet. The best-linked come first, and
   * ties keep the order they are written in. Gives back the new ring, empty when there is nothing more to add.
   */
  grow(): string[] {
    const last = this.rings.at(-1) ?? [];
    const found = new Map<string, number>();
    for (const at of last)
      for (const [, other] of this.adj.get(at) ?? [])
        if (!this.kept.has(other)) found.set(other, (found.get(other) ?? 0) + 1);
    if (!found.size) return [];
    const order = new Map(this.drawing.boxes.map((b, i) => [b.key, i]));
    const ranked = [...found]
      .sort(([a, x], [b, y]) => y - x || (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(([k]) => k);
    const room = Math.min(RING_MOST, EXPANSION_MOST - this.kept.size);
    const ring = ranked.slice(0, Math.max(0, room));
    if (!ring.length) return [];
    for (const k of ring) this.kept.add(k);
    this.rings.push(ring);
    this.cut.push(ranked.length - ring.length);
    return ring;
  }

  /** One step back: the last ring is taken away. The thing it starts from always stays. */
  shrink(): void {
    if (this.rings.length < 2) return;
    for (const k of this.rings.pop() ?? []) this.kept.delete(k);
    this.cut.pop();
  }

  /** The drawing cut down to the things kept and the links among them, to lay out on its own. */
  part(): GraphDrawing {
    const { folding: _folding, ...rest } = this.drawing;
    return {
      ...rest,
      boxes: this.drawing.boxes.filter((b) => this.kept.has(b.key)),
      links: this.drawing.links.filter((l) => this.kept.has(l.from) && this.kept.has(l.to)),
      estimates: [],
    };
  }
}
