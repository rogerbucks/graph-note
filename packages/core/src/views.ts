// Views in a note (editor spec §2 views_in_the_note, §7 view_is_query, views_by_tapping). A view is a named query
// block, its graph line `// graph: <graph> · QUERY view <name>`. This finds them, and says each in plain language. The
// shapes a view may take are in view-profile.ts, and what a view returns is in view-evaluate.ts.
//
// The reader already reads `· QUERY` as a query block. The core draws no query as data (blocks.ts `dataKind`), so a
// view is never drawn as a graph of its own.
import gs from '@thoughtknot/graph-spec';
import { formatList } from './locale-formats.ts';
import type { ViewSpec } from './view-profile.ts';
import { N, S, trim } from './whitespace.ts';
import { SOURCE_LANGUAGE, sourceWord, word } from './words.ts';
import type { WordKey, WordValues } from './words.ts';

/**
 * A view found in a note: its name, the graph it is of, the block it is written in and its query text. The block is
 * counted from 0, among the blocks given.
 */
export interface NamedView {
  name: string;
  graph: string;
  block: number;
  query: string;
  /**
   * Set when the block is meant as a view but cannot be used as one. Its name is missing, is not one word, or is
   * another view's.
   */
  fault?: string;
}

const VIEW = new RegExp(`·${S}*QUERY${S}+view\\b(?:${S}+(${N}+))?`);
const ONE_WORD = /^\w+$/;

/**
 * The views of a note, in the order written: every query block whose graph line says `QUERY view <name>`. The name is
 * one word (letters, digits, underscore). A block that says it is a view but gives no usable name is still listed,
 * with a `fault` saying what to change. So it is never skipped in silence. A query with no `view` in its header is not
 * a view.
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
    if (!written) fault = word('views.fault.no-name');
    else if (!ONE_WORD.test(written)) fault = word('views.fault.not-one-word', { name: written });
    else if (taken.has(`${graph}/${written}`)) fault = word('views.fault.taken', { graph, view: written });
    taken.add(`${graph}/${written}`);
    out.push({ name: written, graph, block, query: lines.slice(at + 1).join('\n'), ...(fault ? { fault } : {}) });
  });
  return out;
}

/** How a reading says its words and joins a list: in the reader's language, or in UK English for bytes. */
interface Saying {
  say: (key: WordKey, values?: WordValues) => string;
  and: (xs: string[]) => string;
}

const READER: Saying = { say: word, and: (xs) => formatList(xs) };
const SOURCE: Saying = {
  say: sourceWord,
  and: (xs) => new Intl.ListFormat(SOURCE_LANGUAGE, { style: 'long', type: 'conjunction' }).format(xs),
};

/** A view in plain language, said as `saying` says its words. */
function reading(view: ViewSpec, textOf: (id: string) => string, { say, and }: Saying): string {
  switch (view.kind) {
    case 'picked':
      return view.ids.length
        ? say('views.reading.picked', { things: and(view.ids.map(textOf)) })
        : say('views.reading.none-picked');
    case 'near':
      return say('views.reading.near', { count: view.depth, thing: textOf(view.id) });
    case 'reaches': {
      const ends = { from: textOf(view.from), to: textOf(view.to), count: view.steps };
      return say(view.directed ? 'views.reading.reaches' : 'views.reading.reaches-either', ends);
    }
    case 'kinds':
      return say('views.reading.kinds', { kinds: and(view.kinds) });
    case 'path':
      return say('views.reading.path', { path: textOf(view.path) });
  }
}

/**
 * A view in plain language, in the reader's language (views_by_tapping). Examples: "Alice, Bob and Carol, picked by
 * hand"; "everything within 2 steps of Alice"; "how Alice reaches Dan, in up to 6 steps"; "only Person and Team". Or
 * "the walked path Tour, in order". `textOf` gives a thing's text as the drawing shows it. The kinds are named as written.
 */
export const readingOf = (view: ViewSpec, textOf: (id: string) => string): string => reading(view, textOf, READER);

/**
 * The same reading in UK English, whatever the reader's language. It is for what is sent to a model, written into a
 * change set or written into an export. Those bytes never change with the reader (locale_never_changes_bytes).
 */
export const sourceReadingOf = (view: ViewSpec, textOf: (id: string) => string): string =>
  reading(view, textOf, SOURCE);
