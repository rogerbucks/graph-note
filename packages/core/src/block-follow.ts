// Where the block an edit session holds is in a note changed since (spec §9, block_followed_not_its_copy): found by the
// lines that did not change around it, never by its text alone, so a copy pasted elsewhere is never taken for it; and
// when the change could as well have made either of two blocks the one held, it is not told apart, and the session stops.
// Linear in the blocks: each is looked at a few times at most, never against every other (the re-review of #465).
// Host-free: the session hands in the note as it last saw it and the note as it is now.
import { gqlSpans, graphOfBlock } from './blocks.ts';
import type { Span } from './blocks.ts';
import { trim } from './whitespace.ts';

/** Where the block is now: its index among the note's gql blocks; gone; or not to be told apart from a copy of it. */
export type Followed = { at: number; wary?: true } | { gone: true } | { twin: true };

/** The blocks looked at while following one, counted so a test can hold the work linear, never timed (spec §12). */
export interface FollowWork {
  looked: number;
}

/** What following one block works from: both notes' lines and blocks, the block as last seen, and the texts before. */
interface Context {
  a: string[];
  b: string[];
  old: Span[];
  now: Span[];
  was: Span;
  graph: string | null;
  known: Set<string>;
  work: FollowWork;
}

/**
 * The block whose fence opened on `line` in `before`, found in `after`, read two ways: with the lines the notes share at
 * their start taken first, and with those at their end. A reading that leaves the block whole among the unchanged lines
 * puts it where they do; one whose change runs through it puts it where its unchanged opening (or closing) fence is.
 * - Two readings leaving it whole in two places: a copy pasted beside it, the two not told apart (`twin`).
 * - One leaving it whole, the other finding a new block in its place: a block pasted beside it, unless that block
 *   reads as the held one edited (`readsAsEdited`), when either could be it (`twin`).
 * - Only a new block of its graph in its place: the held block edited, unless a copy of its old text is elsewhere and
 *   the new text keeps too little of it to know it by (`twin`): never the copy (the re-review of #465).
 * - Neither reading placing it, the change running through the whole block: by its text, and a twin when two blocks
 *   hold it, or when a new block of its graph sits on its line and could be it rewritten; else by its line.
 * Whatever found it, a block followed with a new block of its graph directly beside it, on either side, is followed
 * `wary` (`newBeside`): the session clears its history, so Undo never reverts what may be a copy.
 */
export function followBlock(before: string, after: string, line: number, work: FollowWork = { looked: 0 }): Followed {
  const now = gqlSpans(after),
    old = gqlSpans(before);
  work.looked += old.length;
  const was = old.find((s) => s.open === line);
  if (!was) return byLine(now, line, null, work);
  const c: Context = {
    a: before.split('\n'),
    b: after.split('\n'),
    old,
    now,
    was,
    graph: graphOfBlock(was.text),
    known: textsOf(old, work),
    work,
  };
  const placed = byLines(c);
  if (placed === 'twin') return { twin: true };
  const f = placed ? { at: now.indexOf(placed) } : byText(c, line);
  return 'at' in f && newBeside(c, f.at) ? { at: f.at, wary: true } : f;
}

/**
 * Whether a new block of the held block's graph sits directly beside the block followed, on either side, only blank
 * lines between: no reading tells that from the original rewritten beside a copy of it ([Q][MINE] is a block pasted
 * above, or a copy pasted below; [MINE][Q] a block pasted below, or a copy pasted above), so the block is followed
 * `wary` (the coordinator and the third review of #465, 15 Oct 2026).
 */
function newBeside(c: Context, at: number): boolean {
  const s = c.now[at];
  if (!s) return false;
  return [c.now[at - 1], c.now[at + 1]].some((n) => !!n && isNewOfGraph(c, n) && besideEachOther(c.b, n, s));
}

/** One reading's place for the block: the block there, and whether the reading leaves it whole. */
type Reading = { span: Span; whole: boolean } | null;

/** The block's place by the lines unchanged around it, read with the common start first and with the common end first. */
function byLines(c: Context): Span | 'twin' | null {
  const { a, b, was } = c;
  const most = Math.min(a.length, b.length);
  let start = 0;
  while (start < most && a[start] === b[start]) start++;
  let end = 0;
  while (end < most && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const shift = b.length - a.length;
  const reading = (head: number, tail: number): Reading => {
    const from = a.length - tail;
    const opening = (at: number) => find(c, (s) => s.open === at),
      closing = (at: number) => find(c, (s) => s.close === at);
    const read = (s: Span | undefined, whole: boolean): Reading => (s ? { span: s, whole } : null);
    if (was.close < head) return read(opening(was.open), true);
    if (was.open >= from) return read(opening(was.open + shift), true);
    // the change runs through it: it opens where its unchanged opening fence is, or ends where its closing one is
    if (was.open < head) return read(opening(was.open), false);
    if (was.close >= from && was.close < a.length) return read(closing(was.close + shift), false);
    return null;
  };
  return decide(c, [reading(start, Math.min(end, most - start)), reading(Math.min(start, most - end), end)]);
}

/** The block, from the two readings: see `followBlock`. */
function decide(c: Context, readings: Reading[]): Span | 'twin' | null {
  const whole = readings.flatMap((r) => (r?.whole && r.span.text === c.was.text ? [r.span] : []));
  const cut = readings.flatMap((r) => (r && !(r.whole && r.span.text === c.was.text) ? [r.span] : []));
  const [w, w2] = whole;
  if (w && w2) return w === w2 ? w : 'twin';
  if (w) return cut.some((p) => p !== w && readsAsEdited(c, p)) ? 'twin' : w;
  // another block moved to its line, or one of another graph, is never the block
  const places = [...new Set(cut.filter((p) => p.text === c.was.text || isNewOfGraph(c, p)))];
  const [p, p2] = places;
  if (!p) return null;
  if (p2) return 'twin';
  if (p.text === c.was.text) return p;
  return copyElsewhere(c, p) && !readsAsEdited(c, p) ? 'twin' : p;
}

/**
 * The block by its text when the change runs through the whole of it: two holding it are a twin; one holding it is the
 * block, unless a new block of its graph sits on its line, before or after the lines the change added, and could be it
 * rewritten while the other is a copy: a twin then, unless that block was only pasted beside it, the note gaining it.
 */
function byText(c: Context, line: number): Followed {
  const { now, old, was } = c;
  c.work.looked += now.length;
  const same = now.filter((s) => s.text === was.text);
  if (same.length > 1) return { twin: true };
  const held = same[0];
  if (!held) return byLine(now, line, c, c.work);
  const shift = c.b.length - c.a.length;
  const rival = find(c, (s) => (s.open === line || s.open === line + shift) && s !== held && isNewOfGraph(c, s));
  if (!rival) return { at: now.indexOf(held) };
  const pasted = now.length > old.length && besideEachOther(c.b, rival, held) && !readsAsEdited(c, rival);
  return pasted ? { at: now.indexOf(held) } : { twin: true };
}

/** None holding its text: the block of its graph on its line, unless that is another block of the note moved there. */
function byLine(now: Span[], line: number, c: Context | null, work: FollowWork): Followed {
  work.looked += now.length;
  const here = now.findIndex(
    (s) => s.open === line && (!c || (graphOfBlock(s.text) === c.graph && !c.known.has(s.text))),
  );
  return here >= 0 ? { at: here } : { gone: true };
}

/**
 * Whether `s` reads as the held block edited: a new block of its graph whose text after the graph line keeps, at its
 * start and end, at least half of the held block's text after its graph line. A block sharing less, such as a small
 * new block, is another block.
 */
function readsAsEdited(c: Context, s: Span): boolean {
  if (!isNewOfGraph(c, s)) return false;
  const mine = body(c.was.text);
  const kept = closeness(mine, body(s.text));
  return kept > 0 && kept * 2 >= mine.length;
}

/** Whether `s` is of the held block's graph, with a text no block of the note held before. */
function isNewOfGraph(c: Context, s: Span): boolean {
  return !c.known.has(s.text) && graphOfBlock(s.text) === c.graph;
}

/** Whether a block other than `p` holds the held block's text as it was: a copy of it. */
function copyElsewhere(c: Context, p: Span): boolean {
  return !!find(c, (s) => s !== p && s.text === c.was.text);
}

/** Whether two blocks sit next to each other in `lines`, only blank lines between them. */
function besideEachOther(lines: string[], x: Span, y: Span): boolean {
  const [first, second] = x.open < y.open ? [x, y] : [y, x];
  for (let i = first.close + 1; i < second.open; i++) if (trim(lines[i] ?? '') !== '') return false;
  return true;
}

/** The first block of the note now that `f` holds of, counted as every block looked at. */
function find(c: Context, f: (s: Span) => boolean): Span | undefined {
  c.work.looked += c.now.length;
  return c.now.find(f);
}

/** The texts of a note's blocks, as a set, so a text is asked after once, never against every block. */
function textsOf(spans: Span[], work: FollowWork): Set<string> {
  work.looked += spans.length;
  return new Set(spans.map((s) => s.text));
}

/** A block's text after its graph line, which every block of the graph shares; nothing when it is only that line. */
function body(text: string): string {
  const i = text.indexOf('\n');
  return i < 0 ? '' : text.slice(i + 1);
}

/** How much two texts share at their start and their end, in UTF-16 units, never counting one unit twice. */
function closeness(x: string, y: string): number {
  const most = Math.min(x.length, y.length);
  let start = 0;
  while (start < most && x[start] === y[start]) start++;
  let end = 0;
  while (end < most - start && x[x.length - 1 - end] === y[y.length - 1 - end]) end++;
  return start + end;
}
