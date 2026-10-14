// A graph step's pattern matched (editor spec §20, graph_step_io): every way the things and links of the pattern can be
// found in the graph the step is given, as GQL matches a path pattern: a link is used once in a match (different
// edges), a name used twice is the same thing, and a link written either way matches both. The work is bounded, so a
// step over a large graph never holds the page (spec §9): past `MOST_MATCHES`, or `MOST_TRIES` partial matches, it stops
// and says so rather than give part of an answer.
import type { StepRule, ThingPattern } from './steps-rule.ts';

/** A graph as a step takes it: its things, each with its kinds and properties, and its links, from, type and to. */
export interface StepGraph {
  things: Map<string, { kinds: Set<string>; props: Record<string, unknown> }>;
  links: [string, string, string][];
}

/** One match: the thing found at each place of the pattern, and the link (an index into the graph's links) at each link. */
export interface StepMatch {
  ids: string[];
  links: number[];
}

/** The most matches a step is taken through: a step that finds more is stopped, and says so. */
export const MOST_MATCHES = 10_000;

/** The most partial matches tried: a pattern that keeps almost matching over a large graph is stopped too. */
export const MOST_TRIES = 1_000_000;

/** Whether a thing fits its place in the pattern: its kind, its properties, and the thing its name is already given to. */
function fits(g: StepGraph, id: string, p: ThingPattern, named: Map<string, string>): boolean {
  const t = g.things.get(id);
  if (!t || (p.kind && !t.kinds.has(p.kind))) return false;
  if (p.props.some(([k, v]) => t.props[k] !== v)) return false;
  return !p.name || (named.get(p.name) ?? id) === id;
}

/**
 * Every match of the rule's pattern in `g`, in the order its things and links are written; `over` when the work went
 * past its bound, and then nothing is given.
 */
export function matchesOf(rule: StepRule, g: StepGraph): { found: StepMatch[]; over: boolean } {
  const out = new Map<string, number[]>(),
    inc = new Map<string, number[]>();
  const add = (m: Map<string, number[]>, key: string, i: number) => {
    const list = m.get(key);
    if (list) list.push(i);
    else m.set(key, [i]);
  };
  g.links.forEach(([from, , to], i) => {
    add(out, from, i);
    add(inc, to, i);
  });
  const found: StepMatch[] = [];
  let tries = 0,
    over = false;
  const ids: string[] = [],
    used: number[] = [],
    named = new Map<string, string>();
  const place = (at: number, id: string, then: () => void) => {
    const p = rule.things[at] as ThingPattern;
    if (!fits(g, id, p, named)) return;
    const fresh = !!p.name && !named.has(p.name);
    if (fresh) named.set(p.name as string, id);
    ids.push(id);
    then();
    ids.pop();
    if (fresh) named.delete(p.name as string);
  };
  const walk = (at: number): void => {
    if (over) return;
    if (++tries > MOST_TRIES) {
      over = true;
      return;
    }
    if (at === rule.links.length) {
      if (found.length === MOST_MATCHES) over = true;
      else found.push({ ids: [...ids], links: [...used] });
      return;
    }
    const here = ids[at] as string,
      { type, way } = rule.links[at] ?? { way: 'out' };
    const ways = way === 'either' ? ['out', 'in'] : [way];
    const seen = new Set<number>();
    for (const w of ways)
      for (const e of (w === 'out' ? out : inc).get(here) ?? []) {
        const [from, t, to] = g.links[e] as [string, string, string];
        if (seen.has(e) || used.includes(e) || (type && t !== type)) continue;
        seen.add(e);
        used.push(e);
        place(at + 1, w === 'out' ? to : from, () => walk(at + 1));
        used.pop();
      }
  };
  for (const id of g.things.keys()) {
    if (over) break;
    place(0, id, () => walk(0));
  }
  return over ? { found: [], over } : { found, over };
}
