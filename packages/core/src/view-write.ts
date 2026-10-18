// Writing a view (editor spec §7: views_by_tapping, §2: views_in_the_note). It gives the query for a view built by
// tapping, and the whole block it is stored as in the note. What is written is always a query that `parseView`
// (view-profile.ts) reads back to the same view.
import { gqlSpans, graphOfBlock } from './blocks.ts';
import { isRefusedKind, kindRefusal } from './reserved-words.ts';
import { insertBlockAfter } from './store.ts';
import { acceptNameFirst, unnamedIn } from './suggested-names.ts';
import { VIEW_LIMITS, parseView } from './view-profile.ts';
import { viewsOf } from './views.ts';
import type { ViewArgs, ViewKind, ViewSpec } from './view-profile.ts';

const ESCAPED: Record<string, string> = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/**
 * A string in single quotes as GQL reads it back. The quote and backslash are led by a backslash, and so is anything
 * that breaks a line.
 */
function literal(s: string): string {
  let out = '';
  for (const c of s) {
    const code = c.codePointAt(0) ?? 0;
    out +=
      ESCAPED[c] ??
      (code < 0x20 || code === 0x2028 || code === 0x2029 ? `\\u${code.toString(16).padStart(4, '0')}` : c);
  }
  return `'${out}'`;
}

const WORD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WIDTH = 100;
const within = (n: number, most: number) => Math.min(most, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));

/** The names of a hand-picked set, kept to lines of a sensible width when there are many. */
function picks(ids: string[]): string {
  const items = ids.map(literal),
    one = `MATCH (n) WHERE n.id IN [${items.join(', ')}] RETURN n`;
  if (one.length <= WIDTH) return one;
  const lines: string[] = [];
  for (const item of items) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + item.length + 2 <= WIDTH - 2) lines[lines.length - 1] = `${last}, ${item}`;
    else lines.push(item);
  }
  return `MATCH (n)\nWHERE n.id IN [\n${lines.map((l) => `  ${l}`).join(',\n')}\n]\nRETURN n`;
}

/**
 * The query written for a view built by tapping (views_by_tapping): always one `parseView` reads back to the same view.
 * Steps are held to what the profile allows (near 1 to 3, reaches 1 to 6). Throws a RangeError, saying why, only for
 * what no query can say. That is no kind at all, a kind that is not a GQL name, or one a view may not ask for
 * (reserved-words.ts). The names it gives things (n, m, p, a, b) are none that GQL keeps.
 */
export function viewQuery<K extends ViewKind>(kind: K, args: ViewArgs[K]): string {
  switch (kind) {
    case 'picked':
      return picks((args as ViewArgs['picked']).ids);
    case 'near': {
      const a = args as ViewArgs['near'];
      return `MATCH (n {id: ${literal(a.id)}})-[]-{1,${within(a.depth, VIEW_LIMITS.near)}}(m) RETURN n, m`;
    }
    case 'reaches': {
      const a = args as ViewArgs['reaches'],
        arrow = a.directed === false ? '' : '>';
      return `MATCH p = (a {id: ${literal(a.from)}})-[]-${arrow}{1,${within(a.steps, VIEW_LIMITS.steps)}}(b {id: ${literal(a.to)}}) RETURN p`;
    }
    case 'kinds': {
      const kinds = (args as ViewArgs['kinds']).kinds;
      if (!kinds.length) throw new RangeError('a view of kinds needs at least one kind');
      const bad = kinds.find((k) => !WORD.test(k));
      if (bad !== undefined)
        throw new RangeError(`'${bad}' is not a kind a query can name: use letters, digits and underscores`);
      // a kind Grafeo refuses as a label would be written into a view parseView then refuses: said here instead
      const kept = kinds.find(isRefusedKind);
      if (kept !== undefined) throw new RangeError(kindRefusal(kept));
      return `MATCH (n IS ${kinds.join('|')}) RETURN n`;
    }
    case 'path':
      return `MATCH (p:Path {id: ${literal((args as ViewArgs['path']).path)}})-[:STEP]->(n) RETURN p, n`;
  }
}

/**
 * The whole block for a view (views_in_the_note, view_is_query). It is the graph line that names the graph and the
 * view, then the query. A view's name is one word, letters, digits and underscores, and so is its graph's. A RangeError
 * says so otherwise.
 */
export function viewBlock(graph: string, name: string, query: string): string {
  for (const [what, word] of [
    ['graph', graph],
    ['view', name],
  ] as const)
    if (!/^\w+$/.test(word))
      throw new RangeError(`the ${what} name '${word}' is not one word: use letters, digits and underscores`);
  return `// graph: ${graph} · QUERY view ${name}\n${query}`;
}

/** The things a view names by their ids: what its query would write into the note by name. */
function named(spec: ViewSpec): string[] {
  switch (spec.kind) {
    case 'picked':
      return spec.ids;
    case 'near':
      return [spec.id];
    case 'reaches':
      return [spec.from, spec.to];
    case 'path':
      return [spec.path];
    case 'kinds':
      return [];
  }
}

/**
 * The block for a view of `spec` in `graph`, or why it cannot be made. What no query can say is refused in words
 * ("This view cannot be written: …"). It is written into a note by `addView`, which checks it against that note.
 */
export function makeView(graph: string, name: string, spec: ViewSpec): { block: string } | { refused: string } {
  try {
    const { kind, ...args } = spec;
    return { block: viewBlock(graph, name, viewQuery(kind, args as never)) };
  } catch (e) {
    return { refused: `This view cannot be written: ${(e as Error).message}` };
  }
}

/**
 * The note with a view block of `graph` written after the graph's last block, every other byte kept. It is the one way
 * a host writes a view into a note. It writes against the note as it is when written, so none can leave a check out.
 * It is refused, with the reason and nothing written, for:
 * - a block that is not a view of the graph;
 * - a view named as another of the graph's is;
 * - a graph the note no longer holds;
 * - a view naming a thing the note writes only without a name. Its query would name it without the thing's fix (§4):
 *   accept its name first. That is found in this note, as the reader reads it, never in a drawing, which can be older.
 * A view of kinds names no thing.
 */
export function addView(note: string, graph: string, block: string): { note: string } | { refused: string } {
  const view = viewsOf([block])[0];
  const spec = view && !view.fault && view.graph === graph ? parseView(view.query) : null;
  if (!view || !spec || 'refused' in spec) return { refused: `This view cannot be written: it is no view of ${graph}` };
  const spans = gqlSpans(note),
    texts = spans.map((s) => s.text);
  const first = acceptNameFirst(unnamedIn(texts, graph), graph, named(spec));
  if (first) return { refused: first };
  if (viewsOf(texts).some((v) => v.graph === graph && v.name === view.name))
    return { refused: `graph ${graph} already has a view called ${view.name}: give this one another name` };
  const last = spans.filter((s) => graphOfBlock(s.text) === graph).pop();
  const r = last ? insertBlockAfter(note, { line: last.open, text: last.text }, block) : null;
  return r?.ok ? { note: r.note } : { refused: r?.reason ?? `graph ${graph} is no longer in the note` };
}
