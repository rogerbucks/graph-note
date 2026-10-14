// The layout source of a folded, merged or routed drawing (editor spec §25): the last steps after the source is made, never
// a change to it, so with nothing folded, merged or routed it stays byte-identical to the Python library's (spec §12).
// Folded, a busy hub's links are one stub marked with their count (untangle_hubs) and a group is one box showing its count
// (untangle_groups); merged, two or more links running from one group to another share a trunk (untangle_merge); routed,
// links are straight or right-angled (untangle_routing). Every box and link still drawn is written with the id Graphviz
// gave it unfolded (`node3`, `edge7`), so the host finds each by its number as before; each link of a trunk is drawn as
// its own two lines, from its thing to the trunk (`edge7_tail`) and from the trunk on with its reading (`edge7`), so it is
// still tapped and read as itself. Ids are written with underscores, which Graphviz writes into the SVG as they are. The
// Python library writes the same (graphspec/style/fold_source.py).
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { LINK_LINE } from './arrows.ts';
import { STYLE } from './layout.ts';
import type { Folding } from './untangle-fold.ts';

const NODE_LINE = /^ {2}"([^"]*)" \[label=/;
const LINK_PARTS = /^ {2}"([^"]*)" -> "([^"]*)" \[(.*)\];$/;
const INVISIBLE = /^ {2}"([^"]*)" -> "([^"]*)" \[style=invis\];$/;
const KIND_COLUMN = '  { rank=same; ';
const SAME_RANK = '  {rank=same; ';
const CLUSTER = '  subgraph cluster_';
/** A quoted word and a semicolon in a box's line: one of its things, unless it is an attribute's value, after its `=`. */
const QUOTED_ITEM = /"([^"]*)"; /g;
const COLOUR = /, color="(#[0-9a-f]{6})"/;
const MUTED = 'color="#0000fe", fontcolor="#0000fe"';

/** A link line still drawn: its place among the link lines, its ends as drawn, and its attributes. */
interface Drawn {
  n: number;
  from: string;
  to: string;
  attrs: string;
}

const quotedIn = (line: string): string[] => [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? '');

/** The two lines that draw a link of trunk `t`: from its thing to the trunk, then from the trunk on, with its reading. */
function trunkLines(l: Drawn, t: number): string[] {
  const colour = COLOUR.exec(l.attrs)?.[1] ?? '#0000fc';
  const back = /, dir=back(,|$)/.test(l.attrs),
    fixed = l.attrs.includes('constraint=false') ? ', constraint=false' : '';
  return [
    `  "${l.from}" -> "trunk: ${t} in" [id="edge${l.n + 1}_tail", color="${colour}", dir=${back ? 'back' : 'none'}${fixed}];`,
    `  "trunk: ${t} out" -> "${l.to}" [id="edge${l.n + 1}", ${l.attrs.replace(', dir=back', ', dir=none')}];`,
  ];
}

/**
 * The Graphviz source `dot` (as render.ts writes it, nudges and all) as `plan` folds and merges it: each thing hidden and
 * each link folded left out, and named nowhere else, so Graphviz never makes it; a folded group's things drawn as its
 * box, the links to them drawn to the box and its box around them gone; each line left given its unfolded id; then each
 * folded group's box, each hub's stub and each trunk, before the last line. With no plan, or nothing it changes, `dot`.
 */
export function foldedSource(dot: string, plan: Folding | undefined): string {
  if (!plan) return dot;
  const hidden = new Set(plan.hidden),
    folded = new Set(plan.folded),
    box = new Map<string, string>(),
    groupOf = new Map<string, number>();
  plan.groups.forEach(([, things, isFolded], i) => {
    for (const k of things) if (isFolded) box.set(k, `group: ${i + 1}`);
    for (const k of isFolded ? [`group: ${i + 1}`] : things) groupOf.set(k, i);
  });
  const gone = (k: string) => hidden.has(k) || box.has(k);
  const lines = dot.split('\n'),
    drawn = new Map<number, Drawn>();
  let n = -1;
  for (const line of lines) {
    if (!LINK_LINE.test(line)) continue;
    const m = LINK_PARTS.exec(line);
    n++;
    if (folded.has(n) || !m) continue;
    drawn.set(n, {
      n,
      from: box.get(m[1] ?? '') ?? m[1] ?? '',
      to: box.get(m[2] ?? '') ?? m[2] ?? '',
      attrs: m[3] ?? '',
    });
  }
  // two or more links from one group to another, in the order of their first: a trunk
  const pairs = new Map<string, Drawn[]>();
  if (plan.merge)
    for (const l of drawn.values()) {
      const a = groupOf.get(l.from),
        b = groupOf.get(l.to);
      if (a === undefined || b === undefined || a === b) continue;
      pairs.set(`${a}>${b}`, [...(pairs.get(`${a}>${b}`) ?? []), l]);
    }
  const trunks = [...pairs.values()].filter((ls) => ls.length > 1),
    trunkOf = new Map(trunks.flatMap((ls, t) => ls.map((l): [number, number] => [l.n, t + 1])));
  const boxes = plan.groups.flatMap(([label, things, isFolded], i) =>
    isFolded ? [[i + 1, label, things.length] as const] : [],
  );
  if (!hidden.size && !folded.size && !plan.hubs.length && !boxes.length && !trunks.length) return dot;

  const out: string[] = [];
  let node = 0;
  n = -1;
  for (const line of lines) {
    const named = NODE_LINE.exec(line)?.[1];
    if (named !== undefined) {
      node++;
      if (!gone(named)) out.push(`  "${named}" [id="node${node}", ${line.slice(`  "${named}" [`.length)}`);
    } else if (LINK_LINE.test(line)) {
      const l = drawn.get(++n),
        t = trunkOf.get(n);
      if (l && t !== undefined) out.push(...trunkLines(l, t));
      else if (l) out.push(`  "${l.from}" -> "${l.to}" [id="edge${n + 1}", ${l.attrs}];`);
    } else if (line.startsWith(KIND_COLUMN) || line.startsWith(SAME_RANK)) {
      const keep = quotedIn(line).filter((k) => !gone(k));
      if (keep.length > 1)
        out.push(
          line.startsWith(KIND_COLUMN)
            ? `${KIND_COLUMN}${keep.map((k) => `"${k}";`).join(' ')} }`
            : `${SAME_RANK}${keep.map((k) => `"${k}"`).join('; ')};}`,
        );
    } else if (INVISIBLE.test(line)) {
      if (!quotedIn(line).some(gone)) out.push(line);
    } else if (line.startsWith(CLUSTER)) {
      const member = (at: number) => line[at - 1] !== '=';
      const members = [...line.matchAll(QUOTED_ITEM)].filter((m) => member(m.index)).map((m) => m[1] ?? '');
      if (!members.length || !members.every(gone))
        out.push(line.replace(QUOTED_ITEM, (all, k: string, at: number) => (member(at) && gone(k) ? '' : all)));
    } else out.push(line);
  }
  const added = [
    ...boxes.map(
      ([i, label, count]) =>
        `  "group: ${i}" [id="fold_group_${i}", label=<${GraphLayout.escape(label)}<br/><font point-size="${STYLE.kind_font_size}">${count} thing${count === 1 ? '' : 's'}</font>>, style="rounded", ${MUTED}];`,
    ),
    ...plan.hubs.flatMap(([hub, count], j) => [
      `  "hub: ${j + 1}" [id="fold_hub_${j + 1}", label="${count} link${count === 1 ? '' : 's'}", shape=box, style="rounded,dashed", fontsize=${STYLE.kind_font_size}, ${MUTED}];`,
      `  "${hub}" -> "hub: ${j + 1}" [id="fold_hub_${j + 1}_link", style=dashed, dir=none, color="#0000fe"];`,
    ]),
    ...trunks.flatMap((_ls, t) => [
      `  "trunk: ${t + 1} in" [id="trunk_${t + 1}_in", shape=point, width=0.08, label=""];`,
      `  "trunk: ${t + 1} out" [id="trunk_${t + 1}_out", shape=point, width=0.08, label=""];`,
      `  "trunk: ${t + 1} in" -> "trunk: ${t + 1} out" [id="trunk_${t + 1}", dir=none, penwidth=2.5];`,
    ]),
  ];
  out.splice(out.length - 1, 0, ...added);
  return out.join('\n');
}

const LINK_LABEL = /^( {2}"[^"]*" -> "[^"]*" \[(?:id="[^"]*", )?)label=/;

/**
 * The source `dot` with its links routed (untangle_routing): straight lines, or right angles, whose readings are set
 * beside them (`xlabel`), as Graphviz places a right-angled link's label. Curved, or none, is how Graphviz draws them:
 * `dot` unchanged.
 */
export function routedSource(dot: string, routing: string | undefined): string {
  if (routing !== 'straight' && routing !== 'right-angled') return dot;
  const lines = dot.split('\n');
  const routed = routing === 'straight' ? lines : lines.map((l) => l.replace(LINK_LABEL, '$1xlabel='));
  routed.splice(1, 0, `  graph [splines=${routing === 'straight' ? 'line' : 'ortho'}];`);
  return routed.join('\n');
}
