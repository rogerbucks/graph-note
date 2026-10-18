// The changes view (editor spec §41, changes_view): what changed in a graph between two versions of its note. Those may
// be the text as it is now and the last commit or a branch. The two versions are drawn as one: every thing and link of
// the newer, and what the older held that the newer does not. Each is marked added, removed or changed by its line as
// well as its colour, and listed in words. Nothing is written; the host gives the older text however it reads it.
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';
import { marked } from './export-marks.ts';
import { valueText } from './inline-properties.ts';
import type { Box, GraphDrawing, Link, NoteReading } from './note-reading.ts';
import type { Palette } from './palette.ts';
import { MARK_WORDS } from './proposals-marks.ts';
import type { MarkKind, Marks } from './proposals-marks.ts';
import type { ThingLook } from './style-graph.ts';

/** One change, listed: what it did, to a thing or a link, said in a sentence, and each property it changed. */
export interface ChangeLine {
  /** `thing:<key>`, or `link:<n>` for the n-th link of the drawing: the id its mark on the drawing carries. */
  id: string;
  mark: MarkKind;
  on: 'thing' | 'link';
  /** "Added: Alice (Person)", "Removed: Alice knows Bob", "Changed: Large reader". */
  said: string;
  /** For a change, what changed, one line each: "price: 3 → 4", "kind: Option → Choice", "colour added: red". */
  details: string[];
}

/** What the changes view hands a host: the two versions drawn as one, the marks on that drawing, and the list. */
export interface ChangesShown {
  graph: string;
  /** The newer version's reading, with the graph's drawing holding what the older had and the newer has not. */
  reading: NoteReading;
  marks: Marks;
  changes: ChangeLine[];
}

/**
 * How each mark is drawn: added a heavy line, changed dashed, removed dotted with its text in italics. Each is in its
 * own hue too, so none is told by colour alone (editor spec §11).
 */
export const CHANGE_LOOKS: Record<MarkKind, ThingLook> = {
  add: { hue: 'green', line: 'bold' },
  change: { hue: 'orange', line: 'dashed' },
  remove: { hue: 'red', line: 'dotted', format: 'italic' },
};

/** The sentence when nothing changed. */
export const NO_CHANGES = 'No changes between these versions.';

const textsOf = (note: string) => gqlBlocks(note).map((b) => b.text);
const said = (v: Value) => (typeof v === 'string' ? v : valueText(v));
const same = (a: Value | undefined, b: Value | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** What changed in a set of properties, one line each, in the order the newer writes them, then those taken out. */
function propertyChanges(before: Record<string, Value>, after: Record<string, Value>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(after)) {
    const was = before[k];
    if (was === undefined) out.push(`${k} added: ${said(v)}`);
    else if (!same(was, v)) out.push(`${k}: ${said(was)} → ${said(v)}`);
  }
  for (const [k, v] of Object.entries(before)) if (after[k] === undefined) out.push(`${k} removed: ${said(v)}`);
  return out;
}

const linkKey = (l: Link) => `${l.from}\u0000${l.type}\u0000${l.to}`;

/** The properties of each drawn link, in the drawing's order, matched to the graph's links as written. */
function linkProperties(g: Graph | undefined, d: GraphDrawing): Record<string, Value>[] {
  const left = [...(g?.edges ?? [])];
  return d.links.map((l) => {
    const at = left.findIndex(([s, t, e]) => s === l.from && t === l.type && e === l.to);
    return at < 0 ? {} : (left.splice(at, 1)[0]?.[3] ?? {});
  });
}

/**
 * The changes between two versions of a note in graph `graph`: `before` the older text, `after` the newer, each a whole
 * note. A thing is the same thing when its key is; it changed when its kinds, text or properties did. A link is the same
 * link when its ends and type are, the first written matched first; it changed when its properties did. A graph neither
 * version holds shows no changes.
 */
export function changesView(before: string, after: string, graph: string, shared: string[] = []): ChangesShown {
  const old = readNote(textsOf(before), undefined, shared);
  const now = readNote(textsOf(after), undefined, shared);
  const was = old.graphs.get(graph);
  const is = now.graphs.get(graph);
  const empty: GraphDrawing = { graph, boxes: [], links: [], estimates: [] };
  const a = was ?? empty,
    b = is ?? empty;
  const marks: Marks = { boxes: new Map(), links: new Map() };
  const changes: ChangeLine[] = [];
  const oldBoxes = new Map(a.boxes.map((x) => [x.key, x]));
  const newKeys = new Set(b.boxes.map((x) => x.key));
  const removedBoxes = a.boxes.filter((x) => !newKeys.has(x.key));
  const boxes: Box[] = [...b.boxes, ...removedBoxes];
  const textOf = (key: string) => boxes.find((x) => x.key === key)?.text ?? key;
  const kindOf = (x: Box) => (x.kind ? ` (${x.kind})` : '');
  const oldProps = (key: string) => old.world[graph]?.p(key) ?? {};
  const newProps = (key: string) => now.world[graph]?.p(key) ?? {};
  const thing = (mark: MarkKind, x: Box, details: string[] = []) => {
    const id = `thing:${x.key}`;
    marks.boxes.set(x.key, { kind: mark, ids: [id] });
    changes.push({ id, mark, on: 'thing', said: `${MARK_WORDS[mark]}: ${x.text}${kindOf(x)}`, details });
  };
  for (const x of b.boxes) {
    const y = oldBoxes.get(x.key);
    if (!y) {
      thing('add', x);
      continue;
    }
    const details = [
      ...(y.kind !== x.kind ? [`kind: ${y.kind || 'none'} → ${x.kind || 'none'}`] : []),
      ...propertyChanges(oldProps(x.key), newProps(x.key)),
    ];
    if (details.length) thing('change', x, details);
  }
  for (const x of removedBoxes) thing('remove', x);
  // links: each newer link matched to an older one with the same ends and type, the first written first
  const oldLinkProps = linkProperties(old.world[graph], a),
    newLinkProps = linkProperties(now.world[graph], b);
  const unmatched = new Map<string, number[]>();
  a.links.forEach((l, i) => unmatched.set(linkKey(l), [...(unmatched.get(linkKey(l)) ?? []), i]));
  const links: Link[] = b.links.map(({ from, type, reading, to, note }) => ({
    from,
    type,
    reading,
    to,
    ...(note ? { note } : {}),
  }));
  const link = (mark: MarkKind, n: number, l: Link, details: string[] = []) => {
    const id = `link:${n}`;
    marks.links.set(n, { kind: mark, ids: [id] });
    const sentence = `${textOf(l.from)} ${l.reading || l.type} ${textOf(l.to)}`;
    changes.push({ id, mark, on: 'link', said: `${MARK_WORDS[mark]}: ${sentence}`, details });
  };
  b.links.forEach((l, n) => {
    const at = unmatched.get(linkKey(l))?.shift();
    if (at === undefined) return link('add', n, l);
    const details = propertyChanges(oldLinkProps[at] ?? {}, newLinkProps[n] ?? {});
    if (details.length) link('change', n, l, details);
  });
  const removedLinks = [...unmatched.values()].flat().sort((x, y) => x - y);
  for (const i of removedLinks) {
    const l = a.links[i] as Link;
    links.push({ from: l.from, type: l.type, reading: l.reading, to: l.to });
    link('remove', links.length - 1, l);
  }
  // drawn as a plain network in the newer's direction, every link still, nothing folded or nudged and no near miss
  // guessed. So every change is in sight, and what the older held has a place
  const drawing: GraphDrawing = {
    graph,
    boxes,
    links,
    estimates: [],
    ...(b.direction ? { direction: b.direction } : {}),
  };
  const graphs = new Map(now.graphs);
  if (was || is) graphs.set(graph, drawing);
  return { graph, reading: { ...now, graphs }, marks, changes };
}

/** The changes listed as text, one line each, a change's details indented below it; or that nothing changed. */
export function changesText(shown: ChangesShown): string {
  if (!shown.changes.length) return NO_CHANGES;
  return shown.changes.flatMap((c) => [c.said, ...c.details.map((d) => `  ${d}`)]).join('\n');
}

/**
 * The SVG Graphviz drew of the changes view's drawing with each change marked in `palette`'s fixed colours. The line of
 * each box and link is its mark's look (CHANGE_LOOKS). So an image or an isolated pane shows it in either theme.
 */
export function markedChanges(svg: string, shown: ChangesShown, palette: Palette): string {
  const drawing = shown.reading.graphs.get(shown.graph);
  if (!drawing) return svg;
  const things = new Map([...shown.marks.boxes].map(([k, m]) => [k, CHANGE_LOOKS[m.kind]]));
  const links = new Map([...shown.marks.links].map(([n, m]) => [n, CHANGE_LOOKS[m.kind]]));
  return marked(
    svg,
    drawing.boxes.map((x) => x.key),
    { faded: { things: [], links: [] }, looks: { things, links } },
    palette,
  );
}
