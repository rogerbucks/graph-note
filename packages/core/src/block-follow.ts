// Where the block an edit session holds is in a note changed since (spec §9, block_followed_not_its_copy): found by the
// lines that did not change around it, never by its text alone, so a copy pasted elsewhere is never taken for it; and
// when the change could as well have made either of two blocks the one held, it is not told apart, and the session stops.
// Host-free: the session hands in the note as it last saw it and the note as it is now.
import { gqlSpans, graphOfBlock } from './blocks.ts';
import type { Span } from './blocks.ts';

/** Where the block is now: its index among the note's gql blocks; gone; or not to be told apart from a copy of it. */
export type Followed = { at: number } | { gone: true } | { twin: true };

/**
 * The block whose fence opened on `line` in `before`, found in `after`. The lines the two notes share at their start and
 * at their end are unchanged, so a block among them is where they put it, and a block the change runs through opens
 * where it did when its opening fence is unchanged. A change whose lines could sit before the block or after it (a copy
 * pasted beside it) is read both ways: when the two readings give two blocks, either could be the one held (`twin`).
 * When the change runs through the whole block, it is found by its text, only once and only when no new block of its
 * graph could be the one held, edited; else by its line, as reloading has always found it.
 */
export function followBlock(before: string, after: string, line: number): Followed {
  const now = gqlSpans(after),
    old = gqlSpans(before);
  const was = old.find((s) => s.open === line);
  if (!was) return byText(old, now, line, null);
  const placed = byLines(before.split('\n'), after.split('\n'), was, { old, now });
  if (placed === 'twin') return { twin: true };
  return placed ? { at: now.indexOf(placed) } : byText(old, now, line, was);
}

/** The block's place by the lines unchanged around it, read with the common start first and with the common end first. */
function byLines(a: string[], b: string[], was: Span, spans: { old: Span[]; now: Span[] }): Span | 'twin' | null {
  const { old, now } = spans;
  const most = Math.min(a.length, b.length);
  let start = 0;
  while (start < most && a[start] === b[start]) start++;
  let end = 0;
  while (end < most && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const shift = b.length - a.length,
    graph = graphOfBlock(was.text),
    others = new Set(old.filter((s) => s !== was).map((s) => s.text));
  // the block held, edited, is of its graph, and is not another block of the note moved to its place (a fence line is
  // every block's, so a block cut away brings the next one's fence to its line)
  const credible = (s: Span | undefined) =>
    s && (s.text === was.text || (graphOfBlock(s.text) === graph && !others.has(s.text))) ? s : null;
  const at = (head: number, tail: number) => {
    const from = a.length - tail;
    // its opening fence among the lines unchanged at the start: it opens where it did, edited or not
    if (was.open < head) return credible(now.find((s) => s.open === was.open));
    if (was.open >= from) return credible(now.find((s) => s.open === was.open + shift));
    if (was.close >= from && was.close < a.length) return credible(now.find((s) => s.close === was.close + shift));
    return null;
  };
  const early = at(start, Math.min(end, most - start)),
    late = at(Math.min(start, most - end), end);
  if (early && late && early !== late) return 'twin';
  return early ?? late;
}

/**
 * The block found by its text when the change runs through it: the one block holding the text, unless the note gained a
 * block and a new one of the same graph could be the one held, edited, while the other is a copy; none holding it, the
 * block of the same graph on its line, unless that is another block of the note moved there.
 */
function byText(old: Span[], now: Span[], line: number, was: Span | null): Followed {
  const text = was?.text;
  const same = text === undefined ? [] : now.filter((s) => s.text === text);
  if (same.length > 1) return { twin: true };
  const graph = was ? graphOfBlock(was.text) : null;
  if (same[0]) {
    const known = new Set(old.map((s) => s.text));
    const rival =
      now.length > old.length && now.some((s) => s !== same[0] && !known.has(s.text) && graphOfBlock(s.text) === graph);
    return rival ? { twin: true } : { at: now.indexOf(same[0]) };
  }
  const others = new Set(old.filter((s) => s !== was).map((s) => s.text));
  const here = now.findIndex(
    (s) => s.open === line && (!graph || (graphOfBlock(s.text) === graph && !others.has(s.text))),
  );
  return here >= 0 ? { at: here } : { gone: true };
}
