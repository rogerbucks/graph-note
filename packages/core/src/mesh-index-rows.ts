// The rows the mesh's local store keeps for one note (mesh-index.ts): its things, links and groups. They are read
// from its text by readNote and grouped by scale-groups.ts, each with the note lines it came from.
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import { dataKind } from './blocks.ts';
import { gqlBlocks } from './fences.ts';
import { textTooLarge } from './layout-limits.ts';
import { namedKeys, readInParts, readWhole } from './note-parts.ts';
import type { GraphRead, PartItem } from './note-parts.ts';
import type { Link } from './note-reading.ts';
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

/** Where a graph's things and links were written: for each, the first item that wrote it, found without a search per thing. */
function spans(items: PartItem[]): { thing: (key: string) => Span | null; link: (l: Link) => Span | null } {
  const leads = new Map<string, number>(),
    names = new Map<string, number>(),
    typed = new Map<string, number[]>();
  items.forEach((it, i) => {
    const keys = namedKeys(it.text);
    const lead = /^\s*\(/.test(it.text) ? keys[0] : undefined;
    if (lead !== undefined && !leads.has(lead)) leads.set(lead, i);
    for (const k of keys) if (!names.has(k)) names.set(k, i);
    for (const m of it.text.matchAll(/:\s*(\w+)\b/g)) {
      const list = typed.get(m[1] ?? '') ?? [];
      if (list[list.length - 1] !== i) list.push(i);
      typed.set(m[1] ?? '', list);
    }
  });
  const span = (i: number | undefined): Span | null => {
    const it = i === undefined ? undefined : items[i];
    return it ? { line: it.line, end: it.end } : null;
  };
  let last = 0;
  return {
    thing: (key) => span(leads.get(key) ?? names.get(key)),
    // a graph's links are found in the order they were written, each from where the last was found
    link: (l) => {
      const list = typed.get(l.type) ?? [];
      const wrote = (i: number) => {
        const t = items[i]?.text ?? '';
        return t.includes(l.from) && t.includes(l.to);
      };
      // where the last link was found, then on to the end, then from the start
      let at = 0,
        hi = list.length;
      while (at < hi) {
        const mid = (at + hi) >> 1;
        if ((list[mid] ?? 0) < last) at = mid + 1;
        else hi = mid;
      }
      for (let k = 0; k < list.length; k++) {
        const j = (at + k) % list.length,
          i = list[j] ?? 0;
        if (!wrote(i)) continue;
        last = i;
        return span(i);
      }
      return null;
    },
  };
}

/**
 * A note's text read into the rows the index keeps. A note within the read limits is read in one go. A bigger one is
 * read in parts (note-parts.ts), so no reading holds its whole graph; it gives the same rows.
 */
export function noteRows(note: string, text: string): NoteRows {
  const blocks = gqlBlocks(text);
  const sized = blocks.map((b) => b.text).filter((t) => typeof dataKind(t) === 'string');
  const reading = textTooLarge(sized)
    ? (readInParts(blocks)?.graphs ?? new Map<string, GraphRead>())
    : readWhole(blocks);
  const out: NoteRows = { note, version: sha256(text), things: [], links: [], groups: [], between: [] };
  for (const [graph, { drawing, props, items }] of reading) {
    const grouping = groupsOf(drawing);
    const groupOf = new Map<string, string>();
    grouping.groups.forEach((g) => g.keys.forEach((k) => groupOf.set(k, g.id)));
    const where = spans(items);
    for (const box of drawing.boxes)
      out.things.push({
        note,
        graph,
        key: box.key,
        kind: box.kind,
        text: box.text,
        group: groupOf.get(box.key) ?? '',
        props: json(props.get(box.key) ?? {}),
        span: where.thing(box.key),
      });
    drawing.links.forEach((l, n) => {
      out.links.push({
        note,
        graph,
        n,
        from: l.from,
        type: l.type,
        to: l.to,
        fromGroup: groupOf.get(l.from) ?? '',
        toGroup: groupOf.get(l.to) ?? '',
        span: where.link(l),
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
