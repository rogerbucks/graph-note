// Walked paths (editor spec §7; graph spec §22): a walk recorded from boxes tapped in order, written as a Path node with
// ordered STEP edges; the paths of a graph as data; playing one step by step; and the problems a path can have — a step
// through something removed, and a path with no steps. A path with no steps is never drawn or played as an empty story.
import gs from '@graph-note/graph-spec';
import type { Graph } from '@graph-note/graph-spec';
import { blankText, items, lineAt, lineIndex } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { quoted } from './lock.ts';
import { nameFromText } from './name-suggestions.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import { stepsAfter } from './path-edits.ts';
import { S, trim } from './whitespace.ts';
import { writtenIn } from './written-things.ts';
import type { Written } from './written-things.ts';

/** What the path functions read of a note: its graphs as drawn, its problems, its graphs as read and the blocks as written. */
export type PathReading = Pick<NoteReading, 'graphs' | 'problems' | 'world' | 'whole' | 'texts'>;

/** One step of a walked path: its number, the thing stepped to, the thing's text, and whether the thing is gone. */
export interface PathStep {
  /** The step's number, as written; steps are listed in this order. */
  seq: number;
  /** The id of the thing stepped to, as written; for a missing step, the id that is not in the graph. */
  key: string;
  /** The text of the thing, as the drawing shows it; for a missing step, the id as written. */
  text: string;
  /** Set when the graph has no such thing: the step is kept, so it is shown and announced, never skipped. */
  missing: boolean;
}

/** A path of a graph, as data: its id, its title, its steps in order, and whether it has none. */
export interface WalkedPath {
  id: string;
  /** The path's text as the drawing shows it: its title, else its id. */
  title: string;
  steps: PathStep[];
  /** Set when the path has no steps at all: it is never drawn or played as an empty story. */
  empty: boolean;
}

/** What writing a path gives: the block's new text and the path's id, or the reason nothing was written. */
export type PathBlock = { text: string; id: string } | { refused: string };

/** A walk being recorded: the things tapped, in order. */
export class PathRecorder {
  private list: string[] = [];

  /** The steps so far, in the order tapped. A copy, never the recording itself. */
  get steps(): readonly string[] {
    return Object.freeze([...this.list]);
  }

  /** A tap on a box: it becomes the next step. Tapping the last step again does nothing; any earlier one is added again. */
  tap(key: string): boolean {
    if (this.list.at(-1) === key) return false;
    this.list.push(key);
    return true;
  }

  /** Takes the last step off, and says which; undefined when there is none. */
  undo(): string | undefined {
    return this.list.pop();
  }

  /** Starts the recording again. */
  clear(): void {
    this.list = [];
  }
}

const HIDDEN = new Set<string>(gs.SCHEMA_LABELS);
// a title is one line: a line break in it, of any kind, is a space
const LINE_BREAKS = new RegExp(`[\\n\\r${String.fromCodePoint(0x2028, 0x2029)}]+`, 'g');
const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const or = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

/** Why a title and steps cannot be written as a path in the graph `g`, else null. */
function refusal(reading: PathReading, graph: string, g: Graph, title: string, steps: string[]): string | null {
  if (!title) return 'a path needs a title: give it one before it is written';
  if (!steps.length) return 'a path with no steps is not written: tap the boxes of the walk in order first';
  for (const key of steps) {
    const labels = g.nodes.get(key)?.[0];
    if (!labels) return `${key} is not in graph ${graph}, so it cannot be a step`;
    const bar = [...labels].find((l) => l === 'Path' || l === 'Concept' || HIDDEN.has(l));
    if (bar)
      return `${key} is a ${bar}, which a step cannot be: a path's steps are facts (graph spec §22 rules 1 and 3)`;
  }
  // a locked graph takes only the kinds and types its schema declares (§5)
  const schema = g.labelled('ElementType').length ? g : gs.schemaFor(reading.whole, graph)[1];
  const types = schema ? schema.labelled('ElementType').map((i) => schema.p(i)) : [];
  if (!types.length) return null;
  const has = (kind: string, name: string) => types.some((t) => t.kind === kind && t.name === name);
  const lacking = [...(has('node', 'Path') ? [] : ['Path']), ...(has('edge', 'STEP') ? [] : ['STEP'])];
  return lacking.length
    ? `graph ${graph} is locked and its schema does not declare ${and(lacking)}: declare ${lacking.length > 1 ? 'them' : 'it'} in the schema first`
    : null;
}

/**
 * The block with a walked path written at its end: a Path node with the title, and a STEP edge to each step, numbered 1 to
 * n in the order given (a walk may revisit, so a thing may be stepped to twice), comma-joined as the other patterns are,
 * the block's own text kept as it was. The id is fresh, in the style of the graph's names. A long title goes over two
 * lines, the second indented by `indent` (spec §21). Refused, with the reason, when there is no title, no step, a step
 * that is not a fact in the graph, or a locked graph that does not declare Path and STEP; nothing is then written.
 */
export function pathBlock(
  reading: PathReading,
  graph: string,
  block: string,
  title: string,
  steps: string[],
  indent = '    ',
): PathBlock {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) return { refused: `there is no graph ${graph} to write a path in` };
  const name = trim(title.replace(LINE_BREAKS, ' '));
  const why = refusal(reading, graph, g, name, steps);
  if (why) return { refused: why };
  const all = items(block),
    last = all.at(-1);
  if (last && /^(SET|MATCH|INSERT)\b/i.test(blankText(block.slice(last.from, last.to)))) {
    return { refused: 'the block ends with a SET or MATCH: write the path in a block of its own' };
  }
  const taken = new Map<string, string>();
  for (const w of [reading.world[graph], g])
    for (const [key, [labels]] of w?.nodes ?? []) taken.set(key, [...labels].find((l) => !HIDDEN.has(l)) ?? '');
  const id = nameFromText(name, taken, 'Path');
  const one = `(${id}:Path {title: ${quoted(name)}})`;
  const written = [
    one.length < 70 ? one : `(${id}:Path {\n${indent}title: ${quoted(name)}})`,
    ...steps.map((key, i) => `(${id})-[:STEP {seq: ${i + 1}}]->(${key})`),
  ].join(',\n');
  // after the last pattern, or, when it already ends in a comma, after that comma: whatever follows is kept as it was
  const at = last ? (last.comma !== -1 ? last.comma + 1 : last.to) : block.length;
  const lead = last && last.comma === -1 ? ',\n' : '\n';
  return { text: `${block.slice(0, at)}${lead}${written}${block.slice(at)}`, id };
}

/** A STEP the reader left out because it stepped to something not in the graph. */
interface Gone {
  path: string;
  seq: number | undefined;
  key: string;
  problem: Problem;
}

const HOP = new RegExp(`\\(${S}*([A-Za-z_]\\w*)[^()]*\\)|(<?)-\\[${S}*:${S}*([A-Za-z_]\\w*)([^\\]]*)\\]-(>?)`, 'g');
const SEQ = new RegExp(`\\bseq${S}*:${S}*(\\d+)`);

/** The STEPs of each graph that the reader left out for naming something not in it, found in the problems' dropped text. */
function stepsGone(reading: PathReading): Map<string, Gone[]> {
  const out = new Map<string, Gone[]>();
  for (const problem of reading.problems) {
    const name = problem.graph,
      g = name === null ? undefined : reading.world[name];
    if (!g || name === null || !problem.dropped?.includes('STEP')) continue;
    let last: string | null = null,
      arrow: { type: string; back: boolean; seq: number | undefined } | null = null;
    for (const m of blankText(problem.dropped).matchAll(HOP)) {
      if (m[1] !== undefined) {
        if (last !== null && arrow?.type === 'STEP') {
          const [from, to] = arrow.back ? [m[1], last] : [last, m[1]];
          if (g.has(from, 'Path') && !g.nodes.has(to))
            out.set(name, [...(out.get(name) ?? []), { path: from, seq: arrow.seq, key: to, problem }]);
        }
        last = m[1];
        arrow = null;
      } else {
        const seq = SEQ.exec(m[4] ?? '')?.[1];
        arrow = {
          type: m[3] ?? '',
          back: m[2] === '<' && m[5] !== '>',
          seq: seq === undefined ? undefined : Number(seq),
        };
      }
    }
  }
  return out;
}

/** The paths of one graph, from the graph as read and the steps the reader left out. */
function pathsIn(reading: PathReading, graph: string, gone: Gone[]): WalkedPath[] {
  const g = reading.world[graph];
  if (!g) return [];
  const text = new Map((reading.graphs.get(graph)?.boxes ?? []).map((b) => [b.key, b.text]));
  return g.labelled('Path').map((id): WalkedPath => {
    const listed = [
      ...g.out(id, 'STEP').map((e) => ({ seq: e[3].seq, key: e[2], missing: false })),
      ...gone.filter((x) => x.path === id).map((x) => ({ seq: x.seq, key: x.key, missing: true })),
    ].map((s, order) => ({ ...s, order, at: typeof s.seq === 'number' ? s.seq : Infinity }));
    listed.sort((a, b) => a.at - b.at || a.order - b.order);
    const steps = listed.map((s, i): PathStep => ({
      seq: typeof s.seq === 'number' ? s.seq : i + 1,
      key: s.key,
      text: s.missing ? s.key : (text.get(s.key) ?? s.key),
      missing: s.missing,
    }));
    return { id, title: text.get(id) ?? id, steps, empty: !steps.length };
  });
}

/**
 * The paths of a graph, as data: each with its title and its steps in seq order. A step through something that is not in
 * the graph is kept, marked `missing`, so a host shows and announces it; a path with no step at all is marked `empty`.
 * None for a graph that is not there.
 */
export function pathsOf(reading: PathReading, graph: string): WalkedPath[] {
  return pathsIn(reading, graph, stepsGone(reading).get(graph) ?? []);
}

/** Playing a path: one step at a time, in order, each with a sentence for a screen reader. Nothing is skipped silently. */
export class PathPlayer {
  private at = 0;
  readonly path: WalkedPath;

  /** Starts at the first step. Throws, saying why, for a path with no steps — ask `PathPlayer.refusal` first. */
  constructor(path: WalkedPath) {
    const why = PathPlayer.refusal(path);
    if (why) throw new Error(why);
    this.path = path;
  }

  /** Why a path cannot be played — it has no steps, so there is no story — or null when it can. */
  static refusal(path: WalkedPath): string | null {
    return path.steps.length ? null : `the path ${path.title} has no steps`;
  }

  /** The step now on. A missing step is stopped on like any other. */
  get current(): PathStep {
    return this.path.steps[this.at] as PathStep;
  }

  /** Whether the first step is on. */
  get atStart(): boolean {
    return this.at === 0;
  }

  /** Whether the last step is on. */
  get atEnd(): boolean {
    return this.at === this.path.steps.length - 1;
  }

  /** On to the next step; false, and no move, at the end. */
  next(): boolean {
    if (this.atEnd) return false;
    this.at++;
    return true;
  }

  /** Back to the step before; false, and no move, at the start. */
  previous(): boolean {
    if (this.atStart) return false;
    this.at--;
    return true;
  }

  /** The sentence for the step now on: "Step 2 of 5: <text of the thing>", or, for a missing step, that it is missing. */
  get sentence(): string {
    return this.sentenceAt(this.at);
  }

  /** The sentence for every step, in order. */
  get sentences(): string[] {
    return this.path.steps.map((_, i) => this.sentenceAt(i));
  }

  private sentenceAt(i: number): string {
    const step = this.path.steps[i] as PathStep;
    return `Step ${i + 1} of ${this.path.steps.length}: ${step.missing ? `missing. ${step.key} is not in the graph.` : step.text}`;
  }
}

/** The edit that takes a step out of its block, when the step sits on one line of it; nothing otherwise. */
function removal(text: string, line: number, dropped: string): Pick<Problem, 'replace' | 'span' | 'fixTitle' | 'also'> {
  const want = blankText(dropped),
    lineOf = lineIndex(text);
  const it = items(text).find(
    (x) => lineOf(x.from) <= line && line <= lineOf(x.to - 1) && blankText(text.slice(x.from, x.to)) === want,
  );
  if (!it || lineOf(it.from) !== lineOf(it.to - 1)) return {};
  // its own comma goes with it when that is on the same line; a comma left before it is read as a comma with nothing after
  const end = it.comma !== -1 && lineOf(it.comma) === lineOf(it.from) ? it.comma + 1 : it.to;
  const start = text.lastIndexOf('\n', it.from - 1) + 1;
  return {
    replace: { written: text.slice(it.from, end), with: [''] },
    span: { line: lineOf(it.from) - 1, character: it.from - start, end: end - start },
    fixTitle: 'Remove the step',
    also: stepsAfter(text, dropped), // the later steps numbered again: §22's steps 1 to n
  };
}

/** The problem for a step through something removed: the reader's own report, said in the path's words, with its fix. */
function missingStep(reading: PathReading, graph: string, path: WalkedPath, x: Gone): Problem {
  const p = x.problem;
  // a near miss drawn as an estimate keeps its change; a report made here before has its own edit, which is no estimate
  const near = p.replace?.written === x.key ? p.replace.with : [];
  const said =
    near.length === 1
      ? `; it is drawn as an estimate of ${near[0]}`
      : near.length > 1
        ? `; ${and(near)} are equally close, so it is not drawn`
        : '';
  const edit = near.length ? { replace: p.replace } : removal(reading.texts[p.block] ?? '', p.line, p.dropped ?? '');
  return {
    graph,
    block: p.block,
    line: p.line,
    severity: p.severity,
    message: `the path ${path.title} steps through ${x.key}, which is not in graph ${graph}${said}`,
    fix: near.length
      ? `change ${x.key} to ${or(near)}, remove the step, or restore ${x.key}`
      : `remove the step, or restore ${x.key}`,
    ...(p.dropped === undefined ? {} : { dropped: p.dropped }),
    ...edit,
  };
}

/**
 * The problems of the paths of a note, for one graph or, with none named, every graph. path_missing_step: a STEP through
 * something not in the graph, on the STEP's own line, with the fix — remove the step, or restore the thing — and, where the
 * step sits on one line, the edit that removes it. path_no_steps: a Path with no STEP, on the line that writes it, with
 * its fix. Asking of a reading that already holds these gives the same again.
 */
export function pathProblems(reading: PathReading, graph?: string): Problem[] {
  const out: Problem[] = [],
    gone = stepsGone(reading),
    written = new Map<number, Written[]>();
  const writing = (path: WalkedPath, graphName: string): { block: number; thing?: Written } => {
    for (const [block, text] of reading.texts.entries()) {
      if (graphOfBlock(text) !== graphName) continue;
      if (!written.has(block)) written.set(block, writtenIn(text));
      const thing = written
        .get(block)
        ?.find((w) => w.writes && w.variable?.name === path.id && w.labels.includes('Path'));
      if (thing) return { block, thing };
    }
    return {
      block: Math.max(
        0,
        reading.texts.findIndex((t) => graphOfBlock(t) === graphName),
      ),
    };
  };
  for (const name of graph === undefined ? Object.keys(reading.world) : [graph]) {
    const mine = gone.get(name) ?? [];
    for (const path of pathsIn(reading, name, mine)) {
      for (const x of mine.filter((m) => m.path === path.id)) out.push(missingStep(reading, name, path, x));
      if (!path.empty) continue;
      const { block, thing } = writing(path, name);
      out.push({
        graph: name,
        block,
        line: thing ? lineAt(reading.texts[block] ?? '', thing.open) : 1,
        severity: 'warning',
        message: `the path ${path.title} has no steps`,
        fix: 'record its steps by tapping boxes in order, or remove the path',
      });
    }
  }
  return out.sort((a, b) => a.block - b.block || a.line - b.line);
}

/**
 * The note's problems with the path problems in them: each report of the reader's own that a path problem says better — a
 * STEP through something not in the graph — is replaced by it, and the problems of paths with no steps are added. It is
 * what `readNote` gives, so the badge counts a path's problems once.
 */
export function mergePathProblems(reading: PathReading): Problem[] {
  const found = pathProblems(reading);
  const key = (p: Problem) => `${p.block}:${p.line}:${p.dropped ?? p.message}`;
  const replaced = new Set(found.map(key));
  return reading.problems.filter((p) => !replaced.has(key(p))).concat(found);
}
