// Curves kept by what was laid out (spec §11, curves_saved). Past 300 things a card is drawn straight first, and its
// curves are laid out next (curves_after_drawing). The layout worker keeps the curved drawing Graphviz gave, by the
// source it was handed. So the same graph opened again is drawn curved at once, with no layout. An edit changes the
// source, so it is laid out again. What is kept is only a copy, in memory, up to a size: losing it costs one layout.

/** The most kept by default, in characters of sources and drawings: about 64 MB. */
export const CURVES_SAVED_MOST = 32_000_000;

/** Graphviz's drawings, by the source each was laid out from: the newest kept, up to `most` characters. */
export class CurvesSaved {
  private readonly kept = new Map<string, string>();
  private size = 0;
  private readonly most: number;

  constructor(most = CURVES_SAVED_MOST) {
    this.most = most;
  }

  /** The drawing kept for `dot`, now the newest; or undefined when none is. */
  get(dot: string): string | undefined {
    const svg = this.kept.get(dot);
    if (svg === undefined) return undefined;
    this.kept.delete(dot);
    this.kept.set(dot, svg);
    return svg;
  }

  /** Keeps `svg` for `dot` as the newest, and lets the oldest go past the size. One larger than the size is not kept. */
  keep(dot: string, svg: string): string {
    const old = this.kept.get(dot);
    if (old !== undefined) {
      this.kept.delete(dot);
      this.size -= dot.length + old.length;
    }
    if (dot.length + svg.length > this.most) return svg;
    this.kept.set(dot, svg);
    this.size += dot.length + svg.length;
    for (const [key, drawn] of this.kept) {
      if (this.size <= this.most) break;
      this.kept.delete(key);
      this.size -= key.length + drawn.length;
    }
    return svg;
  }
}
