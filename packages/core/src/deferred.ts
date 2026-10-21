// Deferred things (spec §5 and §8). Marking a thing for later writes a Deferred saying what is needed and why it waits
// (park_for_later). Reading says which things are parked, and which of those are past their revisit date. They are
// counted apart from problems (parked_not_broken). A parked thing's box is told apart, so the host can draw it dashed
// with a later mark (deferred_drawn). The Deferred is the graph spec's (§25):
// `(d:Deferred {what, why, revisit_by, rule})` with `(d)-[:DEFERS]->(thing)`, and it is counted as completeness.js
// counts it.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { blankText, items } from './block-items.ts';
import { gqlSpans, graphOf, graphOfBlock, namesSharedSchema } from './blocks.ts';
import { kindLines, quoted as q, typeLines } from './lock.ts';
import { formatList } from './locale-formats.ts';
import type { NoteReading } from './note-reading.ts';
import { readBlocks } from './partial-read.ts';
import { replaceBlock } from './store.ts';
import { acceptNameFirst } from './suggested-names.ts';
import type { SuggestedReading } from './suggested-names.ts';
import { S, isSpace, trim, trimEnd } from './whitespace.ts';
import { word } from './words.ts';

/**
 * What marking a thing for later says: what is needed and why it waits. It may also give the day to look again and
 * the completeness rule parked.
 */
export interface Park {
  what: string;
  why: string;
  /** The day to look again, `YYYY-MM-DD`: written as `revisit_by: DATE '…'`, and left out when not given. */
  revisitBy?: string;
  /** The completeness rule this parks (the id of a Cardinality), when it parks one. */
  rule?: string;
}

/** A thing some Deferred defers, as the badge and the drawing need it. */
export interface Parked {
  /** What is needed, as the first Deferred on the thing (by id) says it; '' for a Deferred written without it. */
  what: string;
  /** Why it waits, from the same Deferred; '' for a Deferred written without it. */
  why: string;
  /** The day after which the thing is overdue: the latest `revisit_by` of its Deferreds, or null when any has none. */
  revisitBy: string | null;
  /** True when every Deferred on the thing has a revisit date before today, as completeness counts it. */
  overdue: boolean;
  /** The ids of the Deferreds on the thing, in code order. */
  by: string[];
}

/** How many things are parked, and how many of those are overdue: shown apart from the problems (spec §8). */
export interface ParkedCount {
  parked: number;
  overdue: number;
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A property's day as `YYYY-MM-DD`: a DATE or text read as one, else ''. */
function dayOf(v: unknown): string {
  const s = typeof v === 'object' && v !== null && !Array.isArray(v) && 's' in v ? v.s : v;
  return typeof s === 'string' ? s.slice(0, 10) : '';
}

/** A property that should be text, as text: anything else is ''. */
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Each thing in a graph that some Deferred defers (§25), as of `today` (YYYY-MM-DD). Read from the graph itself, so a
 * Deferred written without its `what` or `why` still parks its thing, as completeness counts it.
 */
export function parkedIn(g: Graph, today: string): Map<string, Parked> {
  const on = new Map<string, string[]>();
  for (const d of g.labelled('Deferred'))
    for (const [, , thing] of g.out(d, 'DEFERS')) {
      const list = on.get(thing) ?? [];
      if (!list.includes(d)) list.push(d);
      on.set(thing, list);
    }
  const out = new Map<string, Parked>();
  for (const thing of [...on.keys()].sort(byCode)) {
    const by = (on.get(thing) ?? []).sort(byCode);
    const days = by.map((d) => dayOf(g.p(d).revisit_by));
    const first = g.p(by[0] ?? '');
    out.set(thing, {
      what: textOf(first.what),
      why: textOf(first.why),
      revisitBy: days.every(Boolean) ? days.reduce((a, b) => (a > b ? a : b), '') : null,
      overdue: days.every((day) => day && day < today),
      by,
    });
  }
  return out;
}

/** Each thing of a graph that some Deferred defers, as of `today` (YYYY-MM-DD); empty when the graph is not in the reading. */
export function parked(reading: NoteReading, graph: string, today: string): Map<string, Parked> {
  const g = reading.world[graph];
  return g ? parkedIn(g, today) : new Map<string, Parked>();
}

/** How many of the parked things there are and how many are overdue, for the badge, counted apart from the problems. */
export function parkedCount(things: Map<string, Parked>): ParkedCount {
  const all = [...things.values()];
  return { parked: all.length, overdue: all.filter((p) => p.overdue).length };
}

/** Where the last character of code is in a block: not whitespace, not in a `//` comment, a closing quote counted. -1 if none. */
function lastCode(text: string): number {
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'" && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = Math.min(j, text.length - 1);
      last = i;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
    } else if (!isSpace(c)) last = i;
  }
  return last;
}

/** What a locked graph lacks to hold a Deferred: Deferred and DEFERS, each unless its schema declares it. None when not locked. */
function undeclared(graphs: Graph[]): string[] {
  const types = graphs.flatMap((g) => g.labelled('ElementType').map((i) => g.p(i)));
  if (!types.length) return [];
  const has = (kind: string, name: string) => types.some((t) => t.kind === kind && t.name === name);
  return [...(has('node', 'Deferred') ? [] : ['Deferred']), ...(has('edge', 'DEFERS') ? [] : ['DEFERS'])];
}

/**
 * The refusal to park a thing in a locked graph whose schema does not declare Deferred and DEFERS. The graph library's
 * §5 checks them like any type. It is told apart from the other refusals so a host can offer the fix,
 * `declareDeferred`. Its words are the same as ever.
 */
export class DeferredNotDeclared extends Error {
  /** What a host tests for, rather than the words. */
  readonly code = 'deferred-not-declared';
  /** The locked graph. */
  readonly graph: string;
  /** What its schema lacks: `Deferred`, `DEFERS`, or both, in that order. */
  readonly lacking: string[];

  constructor(graph: string, lacking: string[]) {
    super(word('editing.deferred.not-declared', { graph, lacking: formatList(lacking) }));
    this.name = 'DeferredNotDeclared';
    this.graph = graph;
    this.lacking = lacking;
  }
}

/** Whether a block ends with a SET, MATCH or INSERT, after which nothing can be added as another item. */
function endsWithSet(block: string): boolean {
  const last = items(block).at(-1);
  return !!last && /^(SET|MATCH|INSERT)\b/i.test(blankText(block.slice(last.from, last.to)));
}

/**
 * The block with a comma after its last item unless it ends in one (never two). A comment after the item is kept and
 * trailing blank lines are dropped.
 */
function commaAfterLast(block: string): string {
  const text = trimEnd(block),
    at = lastCode(text);
  return at >= 0 && text[at] !== ',' ? `${text.slice(0, at + 1)},${text.slice(at + 1)}` : text;
}

/** Words as one line of text: each run of whitespace, line breaks included, becomes one space. */
const oneLine = (s: string): string => trim(s.replace(new RegExp(`${S}+`, 'g'), ' '));

/** Whether a text is a real day, `YYYY-MM-DD`. */
function isDay(s: string): boolean {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  return !!date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
}

/**
 * The block's text with a Deferred for `thing` written as its last items (park_for_later):
 * `(later_<thing>:Deferred {…})` and `(later_<thing>)-[:DEFERS]->(thing)`. The id is the first of `later_<thing>`,
 * `later_<thing>_2`… not taken in the block's graph. A comma is added after the block's last item unless it already
 * ends in one (never two). Any comment after it is kept. The words are quoted as locking quotes them. Each run of
 * whitespace is made one space, so a string never spans lines. A long Deferred is split over lines, indented by
 * `indent` (the settings' choice). Throws an Error saying why when:
 * - `what` or `why` is empty, or `revisitBy` is not a `YYYY-MM-DD` day;
 * - the block names no graph, `thing` is not in the graph, or the block ends with a SET or MATCH;
 * - the graph is locked and its schema does not declare Deferred and DEFERS (the graph library's §5 checks them like
 *   any type).
 * `whole` is the graph as the whole note reads it. Given, a thing written in another block of the graph is found, and
 * an id taken there is not used again. A thing drawn under a suggested name is not parked, which would write that name
 * without its fix (§4). It throws "accept its name first". It is found in `reading`, which is required. The reader
 * suggests names across every block of a graph, so the block alone cannot say which they are. And no caller can leave
 * the check out. A host gives the reading of the note as it is now, with `block` as typed in its place, never an
 * older drawing.
 */
export function parkForLater(
  block: string,
  thing: string,
  park: Park,
  reading: SuggestedReading,
  indent = '    ',
  whole?: Graph,
): string {
  const what = oneLine(park.what),
    why = oneLine(park.why),
    rule = oneLine(park.rule ?? ''),
    day = park.revisitBy ?? '';
  if (!what) throw new Error(word('editing.deferred.what'));
  if (!why) throw new Error(word('editing.deferred.why'));
  if (day && !isDay(day)) throw new Error(word('editing.deferred.day', { day }));
  const graph = graphOf(block);
  if (!graph) throw new Error(word('editing.deferred.no-graph-line'));
  const first = acceptNameFirst(reading, graph, [thing]);
  if (first) throw new Error(first);
  const own = gs.worldFromStore(readBlocks([block], []).store)[graph];
  const graphs = [own, whole].filter((x): x is Graph => !!x);
  if (!graphs.some((x) => x.nodes.has(thing))) throw new Error(word('editing.deferred.no-thing', { thing, graph }));
  if (endsWithSet(block)) throw new Error(word('editing.deferred.ends-with-set'));
  const lacking = undeclared(graphs);
  if (lacking.length) throw new DeferredNotDeclared(graph, lacking);
  let id = `later_${thing}`;
  for (let n = 2; graphs.some((x) => x.nodes.has(id)); n++) id = `later_${thing}_${n}`;
  const props = [
    `what: ${q(what)}`,
    `why: ${q(why)}`,
    ...(day ? [`revisit_by: DATE '${day}'`] : []),
    ...(rule ? [`rule: ${q(rule)}`] : []),
  ];
  const oneLined = `(${id}:Deferred {${props.join(', ')}}),`;
  const written =
    oneLined.length < 70
      ? [oneLined]
      : [`(${id}:Deferred {`, ...props.map((p, i) => `${indent}${p}${i < props.length - 1 ? ',' : '}),'}`)];
  return [commaAfterLast(block), ...written, `(${id})-[:DEFERS]->(${thing})`].join('\n');
}

/** Where Deferred and DEFERS are declared: the index of the block in the note's blocks, and its text as it becomes. */
export interface DeferredDeclared {
  block: number;
  text: string;
}

const PLAIN_ID = /^[A-Za-z_]\w*$/;

/**
 * The fix for `DeferredNotDeclared`, on the texts of a note's blocks. It returns the block that holds the graph's
 * GraphMeta, with Deferred and DEFERS declared at its end as Lock writes a declaration. That is a `Meta:ElementType`
 * and `(<GraphMeta>)-[:DECLARES]->(…)`. For DEFERS it also writes the readings `defers` and `is deferred by`, here
 * because the library's guess misspells the second. It declares only what the schema lacks, with ids fresh across the
 * graph's blocks and a comma where GQL needs one. The text is unchanged when nothing is lacking.
 * `indent` is the settings' choice. Throws an Error saying why when the graph is not in the note, or is a draft (no
 * schema block). It also throws when the graph is typed by a shared schema (declare them there) or has no GraphMeta
 * to declare from. It throws too when the block ends with a SET or MATCH.
 */
export function declareDeferredBlock(blocks: string[], graph: string, indent = '    '): DeferredDeclared {
  const own = blocks.flatMap((b, i) => (graphOfBlock(b) === graph ? [i] : []));
  if (!own.length) throw new Error(word('editing.deferred.no-graph', { graph }));
  const worlds = own.map((i) => gs.worldFromStore(readBlocks([blocks[i] ?? ''], []).store)[graph]);
  const graphs = worlds.filter((g): g is Graph => !!g);
  if (!graphs.some((g) => g.labelled('ElementType').length))
    throw new Error(
      own.some((i) => namesSharedSchema(blocks[i] ?? ''))
        ? word('editing.deferred.shared-schema', { graph })
        : word('editing.deferred.no-schema', { graph }),
    );
  const metaIn = worlds.findIndex((g) => g?.labelled('GraphMeta').some((m) => PLAIN_ID.test(m)));
  const at = own[Math.max(metaIn, 0)] ?? 0;
  const lacking = undeclared(graphs);
  const block = blocks[at] ?? '';
  if (!lacking.length) return { block: at, text: block };
  const meta = worlds[metaIn]?.labelled('GraphMeta').find((m) => PLAIN_ID.test(m));
  if (!meta) {
    // a GraphMeta whose id is not a plain name (set by an `id` property) cannot be named in a link. Say so, and what
    // to use
    const odd = graphs.flatMap((g) => g.labelled('GraphMeta'))[0];
    if (odd === undefined) throw new Error(word('editing.deferred.no-meta', { graph }));
    const plain = odd.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    throw new Error(word('editing.deferred.meta-id', { graph, id: odd, plain }));
  }
  if (endsWithSet(block)) throw new Error(word('editing.deferred.schema-ends-with-set'));
  const taken = new Set(graphs.flatMap((g) => [...g.nodes.keys()]));
  const fresh = (want: string) => {
    let id = want;
    for (let n = 2; taken.has(id); n++) id = `${want}_${n}`;
    taken.add(id);
    return id;
  };
  const kind = lacking.includes('Deferred') ? fresh('kind_deferred') : '';
  const link = lacking.includes('DEFERS') ? fresh('link_defers') : '';
  const written = [
    '// ── Deferred things, declared so one can be parked for later ──',
    ...(kind ? kindLines(kind, 'Deferred', indent) : []),
    ...(link ? typeLines(link, 'DEFERS', 'defers', 'is deferred by', indent) : []),
    ...[kind, link].filter(Boolean).map((id) => `(${meta})-[:DECLARES]->(${id}),`),
  ];
  return { block: at, text: [commaAfterLast(block), ...written].join('\n').replace(/,$/, '') };
}

/**
 * The note with Deferred and DEFERS declared in the schema of a locked graph (the fix for `DeferredNotDeclared`). It
 * is `declareDeferredBlock` written into the block that holds the graph's GraphMeta, with every other byte of the note
 * kept, line endings included. The note itself when nothing is lacking. Throws what `declareDeferredBlock` throws.
 */
export function declareDeferred(note: string, graph: string, indent = '    '): string {
  const spans = gqlSpans(note);
  const { block, text } = declareDeferredBlock(
    spans.map((s) => s.text),
    graph,
    indent,
  );
  const span = spans[block];
  if (!span || text === span.text) return note;
  const r = replaceBlock(note, { line: span.open, text: span.text }, text);
  if (!r.ok) throw new Error(r.reason);
  return r.note;
}
