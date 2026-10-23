// The rows the mesh's local store keeps for one note (mesh-index.ts): its things, links and groups. They are read
// from its text by readNote and grouped by scale-groups.ts, each with the note lines it came from.
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import { blockItems } from './block-items.ts';
import { graphOf } from './blocks.ts';
import { readNote } from './drawing.ts';
import { gqlBlocks } from './fences.ts';
import { groupsOf } from './scale-groups.ts';
import type { GroupedBy } from './scale-groups.ts';

/** The note lines, 1-based and inclusive, a thing or link was read from. */
export interface Span {
  line: number;
  end: number;
}

/** One thing as the index keeps it. */
export interface ThingRow {
  note: string;
  graph: string;
  key: string;
  kind: string;
  text: string;
  group: string;
  /** Its properties as written, as JSON, so the index holds everything authored about it. */
  props: string;
  span: Span | null;
}

/** One link as the index keeps it: its place among its graph's links, its ends and their groups. */
export interface LinkRow {
  note: string;
  graph: string;
  n: number;
  from: string;
  type: string;
  to: string;
  fromGroup: string;
  toGroup: string;
  span: Span | null;
}

/** One group of a graph, with how many things it holds and how many links stay inside it. */
export interface GroupRow {
  note: string;
  graph: string;
  id: string;
  label: string;
  by: GroupedBy;
  things: number;
  links: number;
}

/** The links between two groups, counted. */
export interface BetweenRow {
  note: string;
  graph: string;
  from: string;
  to: string;
  links: number;
}

/** Everything one note gives the index, and the hash of the text it was built from. */
export interface NoteRows {
  note: string;
  version: string;
  things: ThingRow[];
  links: LinkRow[];
  groups: GroupRow[];
  between: BetweenRow[];
}

/** Where the index keeps its rows. Every backend answers each query alike, in the same order. */
export interface MeshBackend {
  readonly kind: 'memory' | 'sqlite';
  /** Puts a note's rows in place of any it had. */
  put(rows: NoteRows): void;
  /** Takes a note's rows out. */
  drop(note: string): void;
  version(note: string): string | null;
  notes(): string[];
  groups(note: string): { groups: GroupRow[]; between: BetweenRow[] };
  things(note: string, groups: readonly string[]): ThingRow[];
  links(note: string): LinkRow[];
}

/** A page of things: those after `after` (a key), at most `limit` of them. */
export interface Page {
  limit?: number;
  after?: string;
}

/** The most rows one read gives by default, so no read gives a whole huge graph. */
export const PAGE_MOST = 500;

/** A value as canonical JSON (RFC 8785), a date as its text: what the index keeps and compares. */
export const json = (v: unknown): string => gs.jcs(v);

/** The note line span of the first item in a graph's blocks that `match` accepts. */
function spanOf(
  blocks: { text: string; line: number }[],
  graph: string,
  match: (item: string) => boolean,
): Span | null {
  for (const b of blocks) {
    if (graphOf(b.text) !== graph) continue;
    for (const it of blockItems(b.text))
      if (match(it.text)) return { line: b.line + 1 + it.line, end: b.line + 1 + it.end };
  }
  return null;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A note's text read into the rows the index keeps. */
export function noteRows(note: string, text: string): NoteRows {
  const blocks = gqlBlocks(text);
  const reading = readNote(blocks.map((b) => b.text));
  const out: NoteRows = { note, version: sha256(text), things: [], links: [], groups: [], between: [] };
  for (const [graph, drawing] of reading.graphs) {
    const grouping = groupsOf(drawing);
    const groupOf = new Map<string, string>();
    grouping.groups.forEach((g) => g.keys.forEach((k) => groupOf.set(k, g.id)));
    const world = reading.world[graph];
    const propsOf = new Map<string, Record<string, unknown>>();
    if (world) for (const id of world.nodes.keys()) propsOf.set(id, world.p(id));
    for (const box of drawing.boxes) {
      const defines = new RegExp(`^\\s*\\(\\s*${escape(box.key)}\\s*[:){\\s]`),
        names = new RegExp(`\\(\\s*${escape(box.key)}\\s*[:){\\s]`);
      out.things.push({
        note,
        graph,
        key: box.key,
        kind: box.kind,
        text: box.text,
        group: groupOf.get(box.key) ?? '',
        props: json(propsOf.get(box.key) ?? {}),
        span: spanOf(blocks, graph, (t) => defines.test(t)) ?? spanOf(blocks, graph, (t) => names.test(t)),
      });
    }
    drawing.links.forEach((l, n) => {
      const typed = new RegExp(`:\\s*${escape(l.type)}\\b`);
      out.links.push({
        note,
        graph,
        n,
        from: l.from,
        type: l.type,
        to: l.to,
        fromGroup: groupOf.get(l.from) ?? '',
        toGroup: groupOf.get(l.to) ?? '',
        span: spanOf(blocks, graph, (t) => typed.test(t) && t.includes(l.from) && t.includes(l.to)),
      });
    });
    const inside = new Map<string, number>();
    for (const l of out.links)
      if (l.graph === graph && l.fromGroup === l.toGroup) inside.set(l.fromGroup, (inside.get(l.fromGroup) ?? 0) + 1);
    for (const g of grouping.groups)
      out.groups.push({
        note,
        graph,
        id: g.id,
        label: g.label,
        by: g.by,
        things: g.keys.length,
        links: inside.get(g.id) ?? 0,
      });
    for (const b of grouping.between)
      out.between.push({
        note,
        graph,
        from: grouping.groups[b.from]?.id ?? '',
        to: grouping.groups[b.to]?.id ?? '',
        links: b.links,
      });
  }
  return out;
}
