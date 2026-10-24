// Earlier drawings kept for review (editor spec §36, drawing_history_diffs). A redrawn SVG replaces the current one.
// The one before stays in the history, so it can be opened again: after a theme broke the drawing, say. The
// difference between two drawings is said in things, links and theme rules, never in pixels.
import type { Graph } from '@thoughtknot/graph-spec';
import type { ThemeRule } from './theme-graph.ts';

/** One drawing as it was made: its SVG, and the graph and theme rules it was drawn from. */
export interface DrawingVersion {
  svg: string;
  graph: Graph;
  rules: readonly ThemeRule[];
}

/** What changed between two drawings, in things, links and theme rules. */
export interface DrawingDiff {
  things: { added: string[]; removed: string[] };
  links: { added: string[]; removed: string[] };
  rules: { added: string[]; removed: string[]; changed: string[] };
}

const linksOf = (g: Graph): Set<string> => new Set(g.edges.map(([a, t, b]) => `${a}-${t}->${b}`));
const gained = (a: Set<string>, b: Set<string>): string[] => [...b].filter((x) => !a.has(x)).sort();

/** The difference between two drawings, never in pixels. */
export function drawingDiff(before: DrawingVersion, after: DrawingVersion): DrawingDiff {
  const things = [new Set(before.graph.nodes.keys()), new Set(after.graph.nodes.keys())] as const;
  const links = [linksOf(before.graph), linksOf(after.graph)] as const;
  const rulesBefore = new Map(before.rules.map((r) => [r.id, r])),
    rulesAfter = new Map(after.rules.map((r) => [r.id, r]));
  const changed = [...rulesAfter]
    .filter(([id, r]) => {
      const was = rulesBefore.get(id);
      return was !== undefined && JSON.stringify(was) !== JSON.stringify(r);
    })
    .map(([id]) => id)
    .sort();
  return {
    things: { added: gained(things[0], things[1]), removed: gained(things[1], things[0]) },
    links: { added: gained(links[0], links[1]), removed: gained(links[1], links[0]) },
    rules: {
      added: gained(new Set(rulesBefore.keys()), new Set(rulesAfter.keys())),
      removed: gained(new Set(rulesAfter.keys()), new Set(rulesBefore.keys())),
      changed,
    },
  };
}

/** A drawing's history: the current drawing, and every one it replaced, oldest first. */
export class DrawingHistory {
  #versions: DrawingVersion[] = [];
  /** How many drawings it keeps, the oldest going first. */
  readonly most: number;

  constructor(most = 20) {
    this.most = most;
  }

  /** The drawing shown now, or null before the first. */
  get current(): DrawingVersion | null {
    return this.#versions.at(-1) ?? null;
  }

  /** How many drawings it holds, the current one too. */
  get length(): number {
    return this.#versions.length;
  }

  /** A new drawing replaces the current one, which stays in the history. */
  redraw(version: DrawingVersion): void {
    this.#versions.push(version);
    if (this.#versions.length > this.most) this.#versions.shift();
  }

  /** An earlier drawing, opened for review: `back` drawings before the current one. Null past the oldest. */
  open(back: number): DrawingVersion | null {
    return this.#versions.at(-1 - back) ?? null;
  }

  /** What changed from an earlier drawing to the current one. */
  diffSince(back: number): DrawingDiff | null {
    const was = this.open(back),
      now = this.current;
    return was && now ? drawingDiff(was, now) : null;
  }
}
