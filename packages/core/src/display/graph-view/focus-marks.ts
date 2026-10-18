// Focus, filters and the highlight put on the drawing (editor spec §25): what the core says is kept at full strength, hidden
// or highlighted becomes a class on each box and link of the SVG Graphviz drew, and `styles.css` does the rest. Only
// classes change, never an attribute that places or sizes anything, so nothing moves and nothing is laid out again.
import type { FocusTarget, Kept } from '@thoughtknot/core';

/** What the drawing is to show: what stays at full strength (null: all of it), what is hidden, and what is highlighted. */
export interface Marks {
  kept: Kept | null;
  hidden: Kept;
  hot: Kept | null;
}

/**
 * The place among the drawing's links of a link's element, from its id in the SVG (`edge3` is the third, so 2); a link
 * merged into a trunk (§25) has a second line to the trunk, `edge3_tail`, which is the same link.
 */
export function edgeNumber(g: Element): number {
  const n = /^edge(\d+)(?:_tail)?$/.exec(g.getAttribute('id') ?? '')?.[1];
  return n === undefined ? -1 : Number(n) - 1;
}

/** The thing or link an element of the drawing belongs to, if any. */
export function focusTargetOf(el: EventTarget | null): FocusTarget | null {
  const near = el as Element | null;
  const key = near?.closest?.('g.node')?.getAttribute('data-key');
  if (key) return { thing: key };
  const edge = near?.closest?.('g.edge');
  const n = edge ? edgeNumber(edge) : -1;
  return n >= 0 ? { edge: n } : null;
}

/** Whether two are the same thing or the same link. */
export function sameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (!a || !b) return a === b;
  if ('thing' in a) return 'thing' in b && a.thing === b.thing;
  return 'edge' in b && a.edge === b.edge;
}

/**
 * The boxes and links of one drawing, found once, and marked as the drawing is to look: `thoughtknot-hidden` for what is
 * hidden; with something kept, `thoughtknot-kept` for what stays at full strength and `thoughtknot-dim` for what fades —
 * except what is highlighted, which comes forward under the pointer (`thoughtknot-hot`) over any focus, the focus itself
 * being as it was when the highlight goes. A change of highlight marks only the things it touched.
 */
export class DrawingMarks {
  private readonly nodes = new Map<string, Element>();
  /** Each link's lines: one, or two for a link merged into a trunk. */
  private readonly edges = new Map<number, Element[]>();

  /** For a drawing's SVG, whose boxes and links are looked up once. */
  constructor(svg: Element) {
    // a fold's stub, box or trunk (§25) is no thing or link of the graph, so focus never marks it
    for (const g of Array.from(svg.querySelectorAll('g.node[data-key]')))
      this.nodes.set(g.getAttribute('data-key') ?? '', g);
    for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
      const n = edgeNumber(g);
      if (n >= 0) this.edges.set(n, [...(this.edges.get(n) ?? []), g]);
    }
  }

  /** Marks every box and link. */
  all(m: Marks): void {
    for (const [key, g] of this.nodes)
      this.mark(g, m, m.hidden.things.has(key), !!m.kept?.things.has(key), !!m.hot?.things.has(key));
    for (const [n, gs] of this.edges)
      for (const g of gs) this.mark(g, m, m.hidden.edges.has(n), !!m.kept?.edges.has(n), !!m.hot?.edges.has(n));
  }

  /** Marks only these boxes (by key) and links (by place), as `m` says: the ones a change of highlight touched. */
  some(m: Marks, things: Iterable<string>, links: Iterable<number>): void {
    for (const key of things) {
      const g = this.nodes.get(key);
      if (g) this.mark(g, m, m.hidden.things.has(key), !!m.kept?.things.has(key), !!m.hot?.things.has(key));
    }
    for (const n of links)
      for (const g of this.edges.get(n) ?? [])
        this.mark(g, m, m.hidden.edges.has(n), !!m.kept?.edges.has(n), !!m.hot?.edges.has(n));
  }

  private mark(g: Element, m: Marks, hidden: boolean, kept: boolean, hot: boolean): void {
    g.classList.toggle('thoughtknot-hidden', hidden);
    g.classList.toggle('thoughtknot-kept', !!m.kept && kept);
    g.classList.toggle('thoughtknot-dim', !!m.kept && !kept && !hot);
    g.classList.toggle('thoughtknot-hot', hot);
  }
}
