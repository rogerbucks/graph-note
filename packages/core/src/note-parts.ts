// A note too big to read at once, cut into parts that each can be (editor spec §53, scale_in_parts; way E, step 7).
// The local store (mesh-index.ts) reads a huge note one part at a time, so no reading ever holds the whole graph.
//
// - Every part carries the blocks that are not data, such as a schema or a style graph, so each part reads as the note.
// - Data blocks are packed into parts in written order. A block too big for a part is cut between its items.
// - Each piece keeps the block's first lines, which name its graph, and says which note line each item came from.
// - One item too big for a part is left out, and counted, so the rest is still read.
import { blockItems, items as itemSpans } from './block-items.ts';
import { dataKind, graphOf } from './blocks.ts';
import { readNote } from './drawing.ts';
import { bytesOf, READ_LIMITS, textTooLarge } from './layout-limits.ts';
import type { ReadLimits } from './layout-limits.ts';
import type { Box, GraphDrawing, NoteReading } from './note-reading.ts';

/** How much of the read limits a part's data may fill. The rest is room for the context and the things it names. */
const SHARE = 4;

/** One item of a piece: its text and the note lines, 1-based and inclusive, it was written on. */
export interface PartItem {
  text: string;
  line: number;
  end: number;
}

/** A data block, or a run of its items: the block's own text to read, and its items with their note lines. */
export interface Piece {
  text: string;
  /** The block's lines before its first item, which name its graph. */
  head: string;
  items: PartItem[];
}

/** A note in parts: the blocks every part carries, the parts' pieces, and the items too big for any part. */
export interface NoteParts {
  context: string[];
  parts: Piece[][];
  skipped: number;
}

const linesOf = (s: string): number => s.split('\n').length;

/** A clause, which names its keys without brackets. */
const CLAUSE = /^\s*(SET|MATCH|INSERT)\b/i;

/** The lines of a block before its first item: those that name its graph. */
function head(text: string, first: number): string {
  return text.split('\n').slice(0, Math.max(0, first)).join('\n');
}

/** Cuts a block into pieces, none over `room`, each a run of its items under the block's own first lines. */
function cut(text: string, line: number, room: ReadLimits): { pieces: Piece[]; skipped: number } {
  const found = blockItems(text),
    commas = itemSpans(text).map((it) => it.comma >= 0);
  const items = found.map((it) => ({ text: it.text, line: line + 1 + it.line, end: line + 1 + it.end }));
  // the items written out again with the comma, or none, each had after it
  const joined = (run: number[]) =>
    run.map((i, k) => (k === 0 ? '' : commas[run[k - 1] ?? 0] ? ',\n' : '\n') + (items[i]?.text ?? '')).join('');
  // a block that fits is read as written, so its comments and layout stay as they are
  const top = head(text, found[0]?.line ?? 0);
  if (!textTooLarge([text], room)) return { pieces: [{ text, head: top, items }], skipped: 0 };
  const pieces: Piece[] = [];
  let skipped = 0,
    tail = false,
    run: number[] = [],
    bytes = bytesOf(top),
    lines = linesOf(top);
  const close = () => {
    if (run.length)
      pieces.push({ text: `${top}\n${joined(run)}`, head: top, items: run.map((i) => items[i] as PartItem) });
    run = [];
    bytes = bytesOf(top);
    lines = linesOf(top);
  };
  for (const [i, it] of items.entries()) {
    const b = bytesOf(it.text) + 2,
      l = linesOf(it.text);
    if (bytesOf(top) + b > room.bytes || linesOf(top) + l > room.lines) {
      skipped++;
      continue;
    }
    // a block's SET, MATCH or INSERT, and all after it, stay with the items before it, as they read together
    tail ||= CLAUSE.test(it.text);
    if (!tail && (bytes + b > room.bytes || lines + l > room.lines)) close();
    run.push(i);
    bytes += b;
    lines += l;
  }
  close();
  return { pieces, skipped };
}

/**
 * A note's gql blocks in parts, each part's data within a share of `limits`. Null when what every part must carry is
 * itself over that share, so no part could be read.
 */
export function noteParts(
  blocks: { text: string; line: number }[],
  limits: ReadLimits = READ_LIMITS,
): NoteParts | null {
  const room = { bytes: Math.floor(limits.bytes / SHARE), lines: Math.floor(limits.lines / SHARE) };
  const isData = (t: string) => dataKind(t) === 'data';
  const context = blocks.filter((b) => !isData(b.text)).map((b) => b.text);
  if (textTooLarge(context, room)) return null;
  const parts: Piece[][] = [];
  let part: Piece[] = [],
    bytes = 0,
    lines = 0,
    skipped = 0;
  const add = (p: Piece) => {
    const b = bytesOf(p.text),
      l = linesOf(p.text);
    if (part.length && (bytes + b > room.bytes || lines + l > room.lines)) {
      parts.push(part);
      part = [];
      bytes = 0;
      lines = 0;
    }
    part.push(p);
    bytes += b;
    lines += l;
  };
  for (const b of blocks) {
    if (!isData(b.text)) continue;
    const cuts = cut(b.text, b.line, room);
    skipped += cuts.skipped;
    for (const p of cuts.pieces) add(p);
  }
  if (part.length) parts.push(part);
  return { context, parts, skipped };
}

/** A graph as the store needs it: a drawing to group, each thing's properties, and its items with their note lines. */
export interface GraphRead {
  drawing: GraphDrawing;
  props: Map<string, Record<string, unknown>>;
  items: PartItem[];
}

/** The keys an item names in its brackets, such as `a` in `(a)-[:R]->(b:B)`, in written order. */
export function namedKeys(item: string): string[] {
  return [...item.matchAll(/\(\s*([^\s:){(]+)/g)].map((m) => m[1] ?? '');
}

/** The keys an item may need written before it: those it names in brackets, and those a SET gives a value to. */
function usedKeys(item: string): string[] {
  const set = [...item.matchAll(/([A-Za-z_]\w*)\.\w+\s*=/g)].map((m) => m[1] ?? '');
  return [...namedKeys(item), ...set];
}

/** The property a thing with no kind is written with when it stands in for itself in a later part. */
const STAND_IN = 'name';

/** A line that stands for a thing read in an earlier part, so a later part's links to it are read. */
function standIn(box: Box): string {
  const kind = box.kind ? `:${box.kind.split(' · ').join(':')}` : '';
  return kind ? `(${box.key}${kind})` : `(${box.key} {${STAND_IN}: ''})`;
}

/** What one reading of some blocks gives, graph by graph, added to `into`. */
function gather(into: Map<string, GraphRead>, reading: NoteReading, pieces: Piece[], standing: Set<string>): void {
  for (const [graph, d] of reading.graphs) {
    let g = into.get(graph);
    if (!g) {
      g = { drawing: { ...d, boxes: [], links: [], estimates: [] }, props: new Map(), items: [] };
      into.set(graph, g);
    }
    const known = new Set(g.drawing.boxes.map((b) => b.key));
    for (const b of d.boxes) if (!known.has(b.key)) g.drawing.boxes.push(b);
    g.drawing.links.push(...d.links);
    const world = reading.world[graph];
    if (world)
      for (const id of world.nodes.keys()) {
        const own = { ...world.p(id) };
        if (standing.has(`${graph}\0${id}`)) delete own[STAND_IN];
        g.props.set(id, { ...(g.props.get(id) ?? {}), ...own });
      }
  }
  for (const p of pieces) {
    const graph = graphOf(p.text);
    if (graph !== null) into.get(graph)?.items.push(...p.items);
  }
}

/** A note's graphs read in one go, when it is within the read limits. */
export function readWhole(blocks: { text: string; line: number }[]): Map<string, GraphRead> {
  const out = new Map<string, GraphRead>();
  const pieces = blocks
    .filter((b) => dataKind(b.text) === 'data')
    .map((b) => ({
      text: b.text,
      head: '',
      items: blockItems(b.text).map((it) => ({ text: it.text, line: b.line + 1 + it.line, end: b.line + 1 + it.end })),
    }));
  gather(out, readNote(blocks.map((b) => b.text)), pieces, new Set());
  return out;
}

/**
 * A note's graphs read one part at a time, so no reading holds the whole graph. A thing must be written before it is
 * linked (GN309). So a part is given a stand-in for each thing it names from an earlier part. Null when the note
 * cannot be put in parts.
 */
export function readInParts(
  blocks: { text: string; line: number }[],
  limits: ReadLimits = READ_LIMITS,
): { graphs: Map<string, GraphRead>; skipped: number } | null {
  const cutUp = noteParts(blocks, limits);
  if (!cutUp) return null;
  const out = new Map<string, GraphRead>();
  for (const pieces of cutUp.parts) {
    const standing = new Set<string>();
    // each stand-in is written in the piece that first names it, so the reader finds it in the same block
    const texts = pieces.map((p) => {
      const graph = graphOf(p.text);
      const before = graph === null ? undefined : out.get(graph);
      if (graph === null || !before || !p.head) return p.text;
      const boxes = new Map(before.drawing.boxes.map((b) => [b.key, b]));
      const lines: string[] = [];
      for (const it of p.items)
        for (const key of usedKeys(it.text)) {
          const box = boxes.get(key);
          if (!box || standing.has(`${graph}\0${key}`)) continue;
          standing.add(`${graph}\0${key}`);
          lines.push(standIn(box));
        }
      if (!lines.length) return p.text;
      const body = p.text.slice(p.head.length + 1);
      return `${p.head}\n${lines.join(',\n')}${CLAUSE.test(p.items[0]?.text ?? '') ? '\n' : ',\n'}${body}`;
    });
    gather(out, readNote([...cutUp.context, ...texts]), pieces, standing);
  }
  return { graphs: out, skipped: cutUp.skipped };
}
