// The view profile (editor spec §7: view_profile, five_view_kinds). It reads the five shapes of query a view may be
// into a plain description of the view. A view is a query block in the note. A query outside these shapes is refused,
// saying what is allowed and showing the nearest shape. Writing a view from its description is in view-write.ts.
//
// The queries are ISO GQL that Grafeo runs as written (quantified edge patterns, a choice of kinds after IS). So the
// same query can be put to Grafeo as to the editor (views_agree_with_grafeo). A thing is named by its `id` property.
// The reader writes `id: '<name>'` into every node it hands the engine (to_gql.py `_with_ids`). The engine reads nodes
// back by `properties(n).id` (queries.py `read`). The world the core holds keys every node by that same property
// (`Store` `n.props.id`, `Graph.nodes`). So `n.id` is the name on both sides.
import { isRefusedKind, isReservedName, kindRefusal, nameRefusal } from './reserved-words.ts';
import { isSpace, trimStart } from './whitespace.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** The five kinds of view (spec §7): a hand-picked set, everything near a thing, how one thing reaches another, only some kinds, a walked path. */
export const VIEW_KINDS = ['picked', 'near', 'reaches', 'kinds', 'path'] as const;

/** One of the five kinds of view. */
export type ViewKind = (typeof VIEW_KINDS)[number];

/** How far a view reaches: everything near a thing is 1 to 3 steps away, and one thing reaches another in 1 to 6 steps. */
export const VIEW_LIMITS = { near: 3, steps: 6 } as const;

/** A view, read from its query or built by tapping: its kind and what that kind needs. */
export type ViewSpec =
  | { kind: 'picked'; ids: string[] }
  | { kind: 'near'; id: string; depth: number }
  | { kind: 'reaches'; from: string; to: string; steps: number; directed: boolean }
  | { kind: 'kinds'; kinds: string[] }
  | { kind: 'path'; path: string };

/** What each kind needs to be built (the view without its kind), as `viewQuery` takes it. */
export interface ViewArgs {
  picked: { ids: string[] };
  near: { id: string; depth: number };
  reaches: { from: string; to: string; steps: number; directed?: boolean };
  kinds: { kinds: string[] };
  path: { path: string };
}

/** The query refused: the message says what was wrong, the five shapes allowed in words, and the nearest shape's form. */
export interface ViewRefusal {
  refused: string;
}

/** Each kind in words, as a refusal names it, in the reader's language. */
export const viewName = (kind: ViewKind): string => word(`views.kind.${kind}`);

/** Each kind's form, written as an example: what a refusal shows as the nearest, and what `viewQuery` writes. */
export const VIEW_FORMS: Record<ViewKind, string> = {
  picked: "MATCH (n) WHERE n.id IN ['a', 'b'] RETURN n",
  near: "MATCH (n {id: 'a'})-[]-{1,2}(m) RETURN n, m",
  reaches: "MATCH p = (a {id: 'a'})-[]->{1,6}(b {id: 'b'}) RETURN p",
  kinds: 'MATCH (n IS Person|Team) RETURN n',
  path: "MATCH (p:Path {id: 'tour'})-[:STEP]->(n) RETURN p, n",
};

type Tok = { kind: 'str' | 'num' | 'word' | 'sym'; text: string };

/** A query outside the profile, with what was wrong and, when known, the shape it was closest to. */
class Fault extends Error {
  shape: ViewKind | undefined;
  constructor(message: string, shape?: ViewKind) {
    super(message);
    this.shape = shape;
  }
}

const TOKEN = /('(?:[^'\\]|\\[\s\S])*')|(\d+)|([A-Za-z_][A-Za-z0-9_]*)|(->)|([()[\]{}:,.=|;-])/y;
const ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  "'": "'",
  '"': '"',
  '`': '`',
  '\\': '\\',
};

/** The text a quoted string says: its escapes read, or a Fault for one that is not known. */
function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(u[0-9A-Fa-f]{4}|[\s\S])/g, (_, e: string) => {
    const c = e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : ESCAPES[e];
    if (c === undefined) throw new Fault(word('views.profile.escape', { text: raw, escape: e }));
    return c;
  });
}

/** The query as tokens: strings read, whitespace as GQL names it skipped, whole-line // comments dropped. */
function lex(query: string): Tok[] {
  const text = query
      .split('\n')
      .filter((l) => !trimStart(l).startsWith('//'))
      .join('\n'),
    out: Tok[] = [];
  for (let at = 0; at < text.length;) {
    if (isSpace(text[at] ?? '')) {
      at++;
      continue;
    }
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(text);
    if (!m)
      throw new Fault(
        text[at] === "'"
          ? word('views.profile.unclosed', { start: text.slice(at, at + 12).trim() })
          : word('views.profile.symbol', { symbol: text[at] ?? '' }),
      );
    at = TOKEN.lastIndex;
    out.push(
      m[1] !== undefined
        ? { kind: 'str', text: unquote(m[1]) }
        : { kind: m[2] !== undefined ? 'num' : m[3] !== undefined ? 'word' : 'sym', text: m[0] },
    );
  }
  return out;
}

/** What was found where the query should have more: a text, a word or a symbol, or the end. */
const found = (t: Tok | undefined) =>
  t
    ? t.kind === 'str'
      ? word('views.found.text', { text: t.text })
      : word('views.found.symbol', { symbol: t.text })
    : word('views.found.end');

/** A place in the tokens, taking each token the shape expects or failing in its words. */
class Cursor {
  private at = 0;
  private readonly toks: Tok[];
  private readonly shape: ViewKind;
  constructor(toks: Tok[], shape: ViewKind) {
    this.toks = toks;
    this.shape = shape;
  }
  fail(message: string): never {
    throw new Fault(message, this.shape);
  }
  private next(want: string): Tok {
    const t = this.toks[this.at];
    if (!t) this.fail(word('views.profile.ends-early', { want }));
    this.at++;
    return t;
  }
  sym(s: string, why = word('views.found.symbol', { symbol: s })): void {
    const t = this.next(why);
    if (t.kind !== 'sym' || t.text !== s) this.fail(word('views.profile.expected', { want: why, found: found(t) }));
  }
  word(w: string): void {
    const t = this.next(w);
    if (t.kind !== 'word' || t.text.toUpperCase() !== w.toUpperCase())
      this.fail(word('views.profile.expected', { want: w, found: found(t) }));
  }
  /** The word `w` exactly as written, or a refusal: `why` says what belongs there, and what was found instead. */
  exact(w: string, why: WordKey): void {
    const t = this.next(w);
    if (t.kind !== 'word' || t.text !== w) this.fail(word(why, { found: found(t) }));
  }
  ident(what: string): string {
    const t = this.next(what);
    if (t.kind !== 'word') this.fail(word('views.profile.expected', { want: what, found: found(t) }));
    return t.text;
  }
  text(what: string): string {
    const t = this.next(what);
    if (t.kind !== 'str') this.fail(word('views.profile.expected-text', { want: what, found: found(t) }));
    return t.text;
  }
  int(what: string): number {
    const t = this.next(what);
    if (t.kind !== 'num') this.fail(word('views.profile.expected', { want: what, found: found(t) }));
    return Number(t.text);
  }
  is(s: string): boolean {
    const t = this.toks[this.at];
    return t?.kind === 'sym' && t.text === s;
  }
  take(s: string): boolean {
    const yes = this.is(s);
    if (yes) this.at++;
    return yes;
  }
  /** A name the query gives a thing or a route: never a word GQL keeps, or Grafeo refuses, as a name (reserved-words.ts). */
  name(what: string): string {
    const n = this.ident(what);
    if (isReservedName(n)) this.fail(nameRefusal(n));
    return n;
  }
  /** A kind the query asks for: a label, so never one Grafeo refuses as a label (reserved-words.ts). */
  kind(): string {
    const k = this.ident(word('views.want.kind'));
    if (isRefusedKind(k)) this.fail(kindRefusal(k));
    return k;
  }
  /** The name the query already gave a thing, written again. */
  again(name: string): void {
    const t = this.ident(name);
    if (t !== name) this.fail(word('views.profile.called', { name, written: t }));
  }
  /** A new name, not one already used. */
  fresh(what: string, used: string[]): string {
    const n = this.name(what);
    if (used.includes(n)) this.fail(word('views.profile.twice', { name: n }));
    return n;
  }
  finish(): void {
    this.take(';');
    const t = this.toks[this.at];
    if (t) this.fail(word('views.profile.after-return', { found: found(t) }));
  }
}

/** The part of a thing's pattern that names it: `{id: 'a'}`. */
function named(c: Cursor): string {
  c.sym('{');
  c.exact('id', 'views.profile.thing-id');
  c.sym(':');
  const id = c.text(word('views.want.thing-name'));
  c.sym('}');
  return id;
}

/** `-[]-{1,k}` or `-[]->{1,k}`, with the most steps allowed: the arrow is read as `directed`. */
function hops(c: Cursor, most: number, arrow: boolean): { steps: number; directed: boolean } {
  c.sym('-');
  c.sym('[');
  c.sym(']');
  const directed = c.take('->');
  if (!directed) c.sym('-', word(arrow ? 'views.want.arrow-or-dash' : 'views.want.dash'));
  if (directed && !arrow) c.fail(word('views.profile.no-arrow'));
  c.sym('{');
  if (c.int('1') !== 1) c.fail(word('views.profile.from-one', { most: String(most) }));
  c.sym(',');
  const steps = c.int(word('views.want.most-steps'));
  if (steps < 1 || steps > most) c.fail(word('views.profile.too-many', { count: most, steps: String(steps) }));
  c.sym('}');
  return { steps, directed };
}

const shapes: Record<ViewKind, (c: Cursor) => ViewSpec> = {
  picked(c) {
    c.sym('(');
    const n = c.name(word('views.want.name-things'));
    c.sym(')');
    c.word('WHERE');
    c.again(n);
    c.sym('.');
    c.exact('id', 'views.profile.things-id');
    c.word('IN');
    c.sym('[');
    const ids: string[] = [];
    if (!c.is(']')) {
      do ids.push(c.text(word('views.want.picked-name')));
      while (c.take(','));
    }
    c.sym(']');
    c.word('RETURN');
    c.again(n);
    c.finish();
    return { kind: 'picked', ids };
  },
  near(c) {
    c.sym('(');
    const n = c.name(word('views.want.name-thing'));
    const id = named(c);
    c.sym(')');
    const { steps } = hops(c, VIEW_LIMITS.near, false);
    c.sym('(');
    const m = c.fresh(word('views.want.name-near'), [n]);
    c.sym(')');
    c.word('RETURN');
    c.again(n);
    c.sym(',');
    c.again(m);
    c.finish();
    return { kind: 'near', id, depth: steps };
  },
  reaches(c) {
    const p = c.name(word('views.want.name-path'));
    c.sym('=');
    c.sym('(');
    const a = c.name(word('views.want.name-start'));
    const from = named(c);
    c.sym(')');
    const { steps, directed } = hops(c, VIEW_LIMITS.steps, true);
    c.sym('(');
    c.fresh(word('views.want.name-end'), [a, p]);
    const to = named(c);
    c.sym(')');
    c.word('RETURN');
    c.again(p);
    c.finish();
    return { kind: 'reaches', from, to, steps, directed };
  },
  kinds(c) {
    c.sym('(');
    const n = c.name(word('views.want.name-things'));
    const kinds: string[] = [];
    if (c.take(':')) {
      kinds.push(c.kind());
      // Grafeo reads a choice of kinds after IS only, so a query with a colon and a bar would not run there
      if (c.is('|')) c.fail(word('views.profile.several-kinds'));
    } else {
      c.word('IS');
      do kinds.push(c.kind());
      while (c.take('|'));
    }
    c.sym(')');
    c.word('RETURN');
    c.again(n);
    c.finish();
    return { kind: 'kinds', kinds };
  },
  path(c) {
    c.sym('(');
    const p = c.name(word('views.want.name-path'));
    c.sym(':');
    c.exact('Path', 'views.profile.path-kind');
    const path = named(c);
    c.sym(')');
    c.sym('-');
    c.sym('[');
    c.sym(':');
    c.exact('STEP', 'views.profile.path-steps');
    c.sym(']');
    c.sym('->');
    c.sym('(');
    const n = c.fresh(word('views.want.name-steps'), [p]);
    c.sym(')');
    c.word('RETURN');
    c.again(p);
    c.sym(',');
    c.again(n);
    c.finish();
    return { kind: 'path', path };
  },
};

/** The shape a query is nearest to, from how it starts, else from what it holds. */
function nearest(toks: Tok[], text: string): ViewKind {
  const [match, a, b, c] = toks;
  if (match?.text.toUpperCase() === 'MATCH') {
    if (a?.kind === 'word' && b?.text === '=') return 'reaches';
    if (a?.text === '(' && b?.kind === 'word' && c) {
      if (c.text === ')') return 'picked';
      if (c.text === '{') return 'near';
      if (c.text === ':') return toks.some((t) => t.text === '{') ? 'path' : 'kinds';
      if (c.text.toUpperCase() === 'IS') return 'kinds';
    }
  }
  if (/\bIN\b/i.test(text)) return 'picked';
  if (/\bSTEP\b|:\s*Path\b/.test(text)) return 'path';
  if (/\bMATCH\s+\w+\s*=/i.test(text)) return 'reaches';
  if (/-\s*\[\s*\]\s*-/.test(text)) return 'near';
  if (/\(\s*\w+\s*(:|\bIS\b)/i.test(text)) return 'kinds';
  return 'picked';
}

function refusal(reason: string, shape: ViewKind): ViewRefusal {
  const shapes = VIEW_KINDS.map(viewName).join(', ');
  return { refused: word('views.refused', { reason, shapes, nearest: viewName(shape), form: VIEW_FORMS[shape] }) };
}

/**
 * A view query read into the view it describes: one of the five shapes (spec §7). It is written as GQL with whitespace
 * and line breaks free and keywords in any case. Text is in single quotes, and whole-line // comments are ignored. The
 * names of the things in the pattern are as the author likes, with limits (reserved-words.ts). A name is never a word
 * GQL keeps or Grafeo refuses, nor a kind Grafeo refuses as a label. Anything else is refused (view_profile) with a
 * message that says what was wrong. It names the five shapes in words and shows the form of the nearest.
 */
export function parseView(query: string): ViewSpec | ViewRefusal {
  let toks: Tok[] = [];
  try {
    toks = lex(query);
    const shape = nearest(toks, query);
    const first = toks[0];
    if (!first) throw new Fault(word('views.profile.no-query'), shape);
    if (first.text.toUpperCase() !== 'MATCH')
      throw new Fault(word('views.profile.match-first', { found: found(first) }), shape);
    return shapes[shape](new Cursor(toks.slice(1), shape));
  } catch (e) {
    if (!(e instanceof Fault)) throw e;
    return refusal(e.message, e.shape ?? nearest(toks, query));
  }
}
