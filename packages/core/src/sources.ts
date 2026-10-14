// Graph sources (editor spec §20 gql_file_source, gql_file_missing; §7 view_of_another_note): a block whose graph line
// says FROM and a place, `// graph: trip · FROM Graphs/trip.gql` or `// graph: trip · FROM [[Trip plan]]`, draws its graph
// from that .gql file or that note, read where it is written and never copied: the block holds nothing of its own, and
// every view of the graph in the note draws from the same place. The host fetches the text (the core reads no file); this
// reads it with the same partial reader and limits as a note's own blocks (`readNote`), or says, naming the place, why
// nothing can be drawn: missing, moved, unreadable, or holding no such graph. Never a blank drawing.
import { gqlBlocks, graphOf, graphOfBlock, isSourceBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import { S, trim } from './whitespace.ts';

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

/** What the host found at a source's place: the text read there, or why there is none. */
export type Fetched =
  | { found: string; text: string }
  | { found: string; unreadable: string }
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

/** Whether a line holds anything but whitespace or a whole-line comment. */
const holds = (line: string) => !!trim(line) && !trim(line).startsWith('//');

/**
 * The source a block names, a fault saying what to change, or null when the block draws from nowhere else. The place
 * after FROM is a .gql file (its path from the vault's root, or a link to it) or a note (its link, `[[Note]]`, or its
 * path); a block holding lines of its own beside FROM is a fault, so data is never copied into the note.
 */
export function sourceOf(text: string, block = 0): Source | SourceFault | null {
  if (!isSourceBlock(text)) return null;
  const lines = text.split('\n'),
    at = lines.findIndex((l) => trim(l)),
    graph = graphOf(text),
    written = trim(PLACE.exec(lines[at] ?? '')?.[1] ?? ''),
    target = placeOf(written);
  const fault = (f: string): SourceFault => ({ graph, block, fault: f });
  if (!graph || !NAME.test(graph))
    return fault(`the graph name '${graph ?? ''}' is not one word: use letters, digits and underscores only`);
  if (!target) return fault('say where the graph is written after FROM: a .gql file, or a note as [[Note]]');
  const last = target.split('/').at(-1) ?? '';
  const kind = /\.gql$/i.test(last) ? 'file' : /\.md$/i.test(last) || !last.includes('.') ? 'note' : null;
  if (!kind)
    return fault(
      `a graph is drawn from a .gql file or a note, and ${target} is neither: write FROM path/to/file.gql or FROM [[Note]]`,
    );
  if (lines.slice(at + 1).some(holds))
    return fault(
      `a block drawn from ${target} holds nothing of its own, so its data is never copied here: move these lines into ${target}, or take out · FROM`,
    );
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
export const sourceName = (s: Source): string => `The ${s.kind} ${s.target}`;

const and = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

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
 * A source read from what the host fetched (gql_file_source): a .gql file is one block, a note its gql blocks, read as
 * a note's own blocks are, by the same partial reader and limits (`readNote`), so a line that cannot be read is listed
 * and the rest drawn, and a source too large to read is not read (`reading.tooLarge` says why). `shared` are the
 * vault's shared schemas. Or why nothing can be drawn (gql_file_missing), naming the place: not there, moved (a file of
 * the same name found `elsewhere`), unreadable, with no graph line, or holding no graph of that name.
 */
export function readSource(source: Source, fetched: Fetched, shared: string[] = []): SourceRead | SourceRefusal {
  const name = sourceName(source),
    { graph, kind } = source,
    cannot = `so graph ${graph} cannot be drawn from it`;
  if ('missing' in fetched) {
    const elsewhere = fetched.elsewhere ?? [];
    if (!elsewhere.length)
      return refuse(
        source,
        'missing',
        `${name} is not in the vault, ${cannot}: check the place written after FROM, or put the ${kind} back.`,
      );
    const there =
      elsewhere.length === 1
        ? `a ${kind} of that name is at ${elsewhere[0]}`
        : `${kind}s of that name are at ${and(elsewhere)}`;
    return refuse(
      source,
      'moved',
      `${name} is not there any more: ${there}. If it was moved, write FROM ${elsewhere[0]} in this block.`,
    );
  }
  if ('unreadable' in fetched)
    return refuse(source, 'unreadable', `${name} could not be read (${fetched.unreadable}), ${cannot}.`);
  const blocks = kind === 'file' ? [{ text: fileBlock(fetched.text), line: 0 }] : gqlBlocks(fetched.text);
  const texts = blocks.map((b) => b.text);
  if (kind === 'file' && graphOf(texts[0] ?? '') === null)
    return refuse(
      source,
      'no-graph',
      `${name} does not start with a graph line: write // graph: ${graph} as its first line, ${cannot} until then.`,
    );
  const reading = readNote(texts, undefined, shared);
  const own = texts.some((t) => graphOfBlock(t) === graph);
  if (!reading.tooLarge && !own && !reading.graphs.has(graph)) {
    const inner = sourceFor(texts, graph);
    if (inner && 'target' in inner)
      return refuse(
        source,
        'no-graph',
        `${name} draws graph ${graph} from ${inner.target} itself, so it holds none to draw: write FROM ${inner.target} here.`,
      );
    const held = [...new Set(texts.flatMap((t) => graphOfBlock(t) ?? []))];
    return refuse(
      source,
      'no-graph',
      held.length
        ? `${name} holds no graph called ${graph}: it holds ${and(held)}. Write the graph's own name after // graph:, or point FROM at the place that holds ${graph}.`
        : `${name} holds no graph at all, ${cannot}.`,
    );
  }
  return { source, from: fetched.found, texts, lines: blocks.map((b) => b.line), reading };
}

/** The line of the source a problem is on: its line in a .gql file, its line in the note for a note's block. */
export const lineInSource = (read: SourceRead, p: Pick<Problem, 'block' | 'line'>): number =>
  (read.lines[p.block] ?? 0) + p.line;
