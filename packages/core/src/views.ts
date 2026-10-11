// Views in a note (editor spec §2 views_in_the_note, §7 view_is_query, views_by_tapping): a view is a named query block,
// its graph line `// graph: <graph> · QUERY view <name>`. This finds them, and says each in plain English. The shapes a
// view may take are in view-profile.ts, and what a view returns is in view-evaluate.ts.
//
// The reader already reads `· QUERY` as a query block, and the core draws no query as data (blocks.ts `dataKind`), so a
// view is never drawn as a graph of its own.
import gs from '@graph-note/graph-spec';
import type { ViewSpec } from './view-profile.ts';
import { N, S, trim } from './whitespace.ts';

/** A view found in a note: its name, the graph it is of, the block it is written in (0-based, among the blocks given), and its query text. */
export interface NamedView {
  name: string;
  graph: string;
  block: number;
  query: string;
  /** Set when the block is meant as a view but cannot be used as one: its name is missing, is not one word, or is another view's. */
  fault?: string;
}

const VIEW = new RegExp(`·${S}*QUERY${S}+view\\b(?:${S}+(${N}+))?`);
const ONE_WORD = /^\w+$/;

/**
 * The views of a note, in the order written: every query block whose graph line says `QUERY view <name>`. The name is one
 * word (letters, digits, underscore); a block that says it is a view but gives no usable name is still listed, with a
 * `fault` saying what to change, so it is never skipped in silence. A query with no `view` in its header is not a view.
 */
export function viewsOf(texts: string[]): NamedView[] {
  const out: NamedView[] = [],
    taken = new Set<string>();
  texts.forEach((text, block) => {
    let graph: string | null, kind: string;
    try {
      [graph, kind] = gs.header(text);
    } catch {
      return;
    }
    if (kind !== 'query' || graph === null) return;
    const lines = text.split('\n'),
      at = lines.findIndex((l) => trim(l)),
      name = VIEW.exec(lines[at] ?? '');
    if (!name) return;
    const written = name[1] ?? '';
    let fault: string | undefined;
    if (!written) fault = 'a view needs a name: write it after view, as QUERY view <name>';
    else if (!ONE_WORD.test(written))
      fault = `the view name '${written}' is not one word: use letters, digits and underscores only`;
    else if (taken.has(`${graph}/${written}`)) fault = `another view of graph ${graph} is already called ${written}`;
    taken.add(`${graph}/${written}`);
    out.push({ name: written, graph, block, query: lines.slice(at + 1).join('\n'), ...(fault ? { fault } : {}) });
  });
  return out;
}

const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const steps = (n: number) => `${n} step${n === 1 ? '' : 's'}`;

/**
 * A view in plain English (views_by_tapping): "Alice, Bob and Carol, picked by hand", "everything within 2 steps of
 * Alice", "how Alice reaches Dan, in up to 6 steps", "only Person and Team", "the walked path Tour, in order". `textOf`
 * gives a thing's text as the drawing shows it; the kinds are named as they are written.
 */
export function readingOf(view: ViewSpec, textOf: (id: string) => string): string {
  switch (view.kind) {
    case 'picked':
      return view.ids.length ? `${and(view.ids.map(textOf))}, picked by hand` : 'no things picked by hand yet';
    case 'near':
      return `everything within ${steps(view.depth)} of ${textOf(view.id)}`;
    case 'reaches': {
      const [from, to] = [textOf(view.from), textOf(view.to)];
      return `how ${from} reaches ${to}${view.directed ? '' : ', in either direction'}, in up to ${steps(view.steps)}`;
    }
    case 'kinds':
      return `only ${and(view.kinds)}`;
    case 'path':
      return `the walked path ${textOf(view.path)}, in order`;
  }
}
