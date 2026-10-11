// Writing a view (editor spec §7: views_by_tapping, §2: views_in_the_note): the query for a view built by tapping, and the
// whole block it is stored as in the note. What is written is always a query that `parseView` (view-profile.ts) reads back
// to the same view.
import { isRefusedKind, kindRefusal } from './reserved-words.ts';
import { VIEW_LIMITS } from './view-profile.ts';
import type { ViewArgs, ViewKind } from './view-profile.ts';

const ESCAPED: Record<string, string> = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/** A string in single quotes as GQL reads it back: the quote and backslash led by a backslash, and so is anything that breaks a line. */
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
 * what no query can say: no kind at all, a kind that is not a GQL name, or one a view may not ask for (reserved-words.ts).
 * The names it gives things (n, m, p, a, b) are none that GQL keeps.
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
 * The whole block for a view (views_in_the_note, view_is_query): the graph line that names the graph and the view, then
 * the query. A view's name is one word, letters, digits and underscores, and so is its graph's; a RangeError says so
 * otherwise.
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
