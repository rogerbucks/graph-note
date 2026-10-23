// How a fault in a style graph is said (editor spec §2, style_graph_checked; §42): the problem on the style thing's
// line, and its fix. The fix is the nearest word allowed when one is close, else the words to choose from.
import { distance } from './estimates.ts';
import { formatList } from './locale-formats.ts';
import type { Problem } from './note-reading.ts';
import type { StyleAt } from './style-graph.ts';
import { word } from './words.ts';

/**
 * A problem with the style of `graph`, on the line of the style thing at `at`, with its stable code (editor spec §42).
 * An error: what it names is left out of the style, and the graph is drawn without it. Listed with the graph it styles.
 */
export function styleProblem(
  graph: string,
  at: StyleAt,
  code: string,
  message: string,
  fix: string,
  edit: Pick<Problem, 'replace' | 'span'> = {},
): Problem {
  return { graph, block: at.block, line: at.line, severity: 'error', code, message, fix, ...edit };
}

/** Words joined as a choice in the reader's locale: "a, b or c" in UK English. */
export const orList = (xs: readonly string[]): string => formatList([...xs], 'disjunction');

/**
 * The fix for a word that is not one of `among`. It is the nearest by edit distance, always when `always` is set (a
 * nudge's word, §6). Otherwise it is the nearest only when close: within two letters, or half the word. Else it is the
 * list to choose from. Case is ignored on both sides, so 'tb' is fixed to TB, the direction it means.
 */
export function wordFix(written: string, among: readonly string[], always = false): { fix: string; nearest?: string } {
  let best = Infinity,
    nearest: string | undefined;
  for (const w of among) {
    const d = distance(written.toLowerCase(), w.toLowerCase());
    if (d < best) [best, nearest] = [d, w];
  }
  if (nearest !== undefined && (always || best <= Math.max(2, Math.floor(written.length / 2))))
    return { fix: word('styling.change-to', { written, to: nearest }), nearest };
  const list = orList(among);
  return {
    fix:
      among.length > 2
        ? word('styling.change-to-one-of', { written, among: list })
        : word('styling.change-to', { written, to: list }),
  };
}
