// Graph sources (editor spec §20 gql_file_source, gql_file_missing; §7 view_of_another_note). A block whose graph line
// says FROM and a place draws its graph from that .gql file or that note. Two examples: `// graph: trip · FROM
// Graphs/trip.gql` and `// graph: trip · FROM [[Trip plan]]`. The graph is read where it is written and never copied.
// The block holds nothing of its own, and every view of the graph in the note draws from the same place. The host
// fetches the text (the core reads no file). This reads it with the same partial reader and limits as a note's own
// blocks (`readNote`). Or it says, naming the place, why nothing can be drawn: missing, moved, unreadable, or holding
// no such graph. Never a blank drawing.
import { gqlBlocks, graphOf, graphOfBlock, isSourceBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { READ_LIMITS } from './layout-limits.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import { S, trim } from './whitespace.ts';
import { formatList } from './locale-formats.ts';
import { word } from './words.ts';

/** Where a graph's data is written: a .gql file, or a note, by the place written after FROM; and the block that says so. */
export interface Source {
  graph: string;
  kind: 'file' | 'note';
  /** The place as written, its link brackets, alias and heading taken off: a path to a .gql file, or a note's link. */
  target: string;
  /** The block (0-based, among those given) that says it. */
  block: number;
}

/** A block meant to draw from elsewhere that cannot: what to change, in a sentence. */
export interface SourceFault {
  graph: string | null;
  block: number;
  fault: string;
}

/**
 * What the host found at a source's place: the text read there, or why there is none. It may be unreadable or missing.
 * Or it may be larger than `READ_LIMITS.bytes`, so it was never read; `tooLarge` keeps its size in bytes.
 */
export type Fetched =
  | { found: string; text: string }
  | { found: string; unreadable: string }
  | { found: string; tooLarge: number }
  | { missing: true; elsewhere?: readonly string[] };

/** A source read: the reading of its blocks, as a note's are read, the place it was read from, and its blocks' lines. */
export interface SourceRead {
  source: Source;
  /** Where it was read from, as the host found it. */
  from: string;
  texts: string[];
  /** For each block, the line of the source its graph line follows: 0 for a .gql file, the fence's line in a note. */
  lines: number[];
  reading: NoteReading;
}

/** Why a source cannot be drawn, in a sentence naming it: what happened, and what to do. Nothing is drawn. */
export interface SourceRefusal {
  source: Source;
  why: 'missing' | 'moved' | 'unreadable' | 'no-graph';
  refused: string;
  reading?: undefined;
}

const PLACE = new RegExp(`·${S}*FROM(?:${S}+([^·]*))?`);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The place written after FROM, as a link names it: brackets, alias (`|…`) and heading (`#…`) taken off. */
function placeOf(written: string): string {
  const inner = /^\[\[([^\]]*)\]\]$/.exec(written)?.[1] ?? written;
  return trim(inner.split('|')[0]?.split('#')[0] ?? '');
}

/**
 * Whether a place could reach outside the vault, or into what it hides. That is a leading slash or backslash, a drive
 * letter, or a `..` part. So is any part starting with a dot (the config folder, `.trash`, a hidden folder), split at
 * either slash.
 */
export const outsideVault = (place: string): boolean =>
  /^[/\\]/.test(place) || /^[A-Za-z]:/.test(place) || place.split(/[/\\]/).some((part) => part.startsWith('.'));

/** Whether a line holds anything but whitespace or a whole-line comment. */
const holds = (line: string) => !!trim(line) && !trim(line).startsWith('//');

/**
 * The source a block names, a fault saying what to change, or null when the block draws from nowhere else. The place
 * after FROM is a .gql file or a note. A file is named by its path from the vault's root, or a link to it. A note is
 * named by its link, `[[Note]]`, or its path. A block holding lines of its own beside FROM is a fault, so data is never
 * copied into the note.
 */
export function sourceOf(text: string, block = 0): Source | SourceFault | null {
  if (!isSourceBlock(text)) return null;
  const lines = text.split('\n'),
    at = lines.findIndex((l) => trim(l)),
    graph = graphOf(text),
    written = trim(PLACE.exec(lines[at] ?? '')?.[1] ?? ''),
    target = placeOf(written);
  const fault = (f: string): SourceFault => ({ graph, block, fault: f });
  if (!graph || !NAME.test(graph)) return fault(word('reading.source.name-not-word', { graph: graph ?? '' }));
  if (!target) return fault(word('reading.source.no-place'));
  if (outsideVault(target)) return fault(word('reading.source.outside', { target }));
  const last = target.split('/').at(-1) ?? '';
  const kind = /\.gql$/i.test(last) ? 'file' : /\.md$/i.test(last) || !last.includes('.') ? 'note' : null;
  if (!kind) return fault(word('reading.source.neither', { target }));
  if (lines.slice(at + 1).some(holds)) return fault(word('reading.source.holds-lines', { target }));
  return { graph, kind, target, block };
}

/** Every block of a note that draws its graph from elsewhere, in order: each its source, or its fault. */
export function sourcesOf(texts: readonly string[]): (Source | SourceFault)[] {
  return texts.flatMap((t, i) => {
    const s = sourceOf(t, i);
    return s ? [s] : [];
  });
}

/** Where a note says `graph` is drawn from: its first FROM block for that graph, or null when it says nowhere. */
export function sourceFor(texts: readonly string[], graph: string): Source | SourceFault | null {
  return sourcesOf(texts).find((s) => s.graph === graph) ?? null;
}

/** A source in words, as a sentence begins with it: "The file Graphs/trip.gql", "The note Trip plan". */
export const sourceName = (s: Source): string =>
  word(s.kind === 'file' ? 'reading.source.file' : 'reading.source.note', { target: s.target });

const and = (xs: readonly string[]) => formatList([...xs]);

/** Why a source cannot be drawn: the reason, with the sentence. */
function refuse(source: Source, why: SourceRefusal['why'], refused: string): SourceRefusal {
  return { source, why, refused };
}

/** A .gql file's text as one block: its lines ended at LF, a CR before it taken off, as a note's blocks are. */
const fileBlock = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .join('\n');

/**
 * A source read from what the host fetched (gql_file_source). A .gql file is one block, a note its gql blocks. They are
 * read as a note's own blocks are, by the same partial reader and limits (`readNote`). So a line that cannot be read is
 * listed and the rest drawn. A source too large to read is not read (`reading.tooLarge` says why). `shared` are the
 * vault's shared schemas. Or why nothing can be drawn (gql_file_missing), naming the place. It may be not there, or
 * moved (a file of the same name found `elsewhere`). It may be unreadable, with no graph line, or holding no graph of
 * that name.
 */
export function readSource(source: Source, fetched: Fetched, shared: string[] = []): SourceRead | SourceRefusal {
  const name = sourceName(source),
    { graph, kind } = source;
  if ('missing' in fetched) {
    const elsewhere = fetched.elsewhere ?? [];
    if (!elsewhere.length)
      return refuse(
        source,
        'missing',
        word(kind === 'file' ? 'reading.source.missing-file' : 'reading.source.missing-note', { name, graph }),
      );
    const one = elsewhere.length === 1,
      places = and(elsewhere);
    const there =
      kind === 'file'
        ? word(one ? 'reading.source.file-elsewhere' : 'reading.source.files-elsewhere', { places })
        : word(one ? 'reading.source.note-elsewhere' : 'reading.source.notes-elsewhere', { places });
    return refuse(source, 'moved', word('reading.source.moved', { name, there, place: `${elsewhere[0]}` }));
  }
  if ('unreadable' in fetched)
    return refuse(source, 'unreadable', word('reading.source.unreadable', { name, why: fetched.unreadable, graph }));
  if ('tooLarge' in fetched) {
    // never read: over the bytes a note's graph blocks may hold, said as they are (spec §9, layout_contained)
    const most = READ_LIMITS.bytes;
    const tooLarge = { reason: 'too-large', limit: 'text-bytes', count: fetched.tooLarge, most } as const;
    const reading: NoteReading = { graphs: new Map(), problems: [], world: {}, whole: {}, texts: [], tooLarge };
    return { source, from: fetched.found, texts: [], lines: [], reading };
  }
  const blocks = kind === 'file' ? [{ text: fileBlock(fetched.text), line: 0 }] : gqlBlocks(fetched.text);
  const texts = blocks.map((b) => b.text);
  if (kind === 'file' && graphOf(texts[0] ?? '') === null)
    return refuse(source, 'no-graph', word('reading.source.no-graph-line', { name, graph }));
  const reading = readNote(texts, undefined, shared);
  const own = texts.some((t) => graphOfBlock(t) === graph);
  if (!reading.tooLarge && !own && !reading.graphs.has(graph)) {
    const inner = sourceFor(texts, graph);
    if (inner && 'target' in inner)
      return refuse(source, 'no-graph', word('reading.source.drawn-elsewhere', { name, graph, target: inner.target }));
    const held = [...new Set(texts.flatMap((t) => graphOfBlock(t) ?? []))];
    return refuse(
      source,
      'no-graph',
      held.length
        ? word('reading.source.other-graphs', { name, graph, held: and(held) })
        : word('reading.source.no-graph', { name, graph }),
    );
  }
  return { source, from: fetched.found, texts, lines: blocks.map((b) => b.line), reading };
}

/** The line of the source a problem is on: its line in a .gql file, its line in the note for a note's block. */
export const lineInSource = (read: SourceRead, p: Pick<Problem, 'block' | 'line'>): number =>
  (read.lines[p.block] ?? 0) + p.line;
