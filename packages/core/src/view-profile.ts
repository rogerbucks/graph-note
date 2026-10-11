// The view profile (editor spec §7: view_profile, five_view_kinds): the five shapes of query a view may be, read into a
// plain description of the view. A view is a query block in the note; a query outside these five shapes is refused with a
// message saying what is allowed and showing the nearest shape. Writing a view from its description is in view-write.ts.
//
// The queries are ISO GQL that Grafeo runs as written (quantified edge patterns, a choice of kinds after IS), so the same
// query can be put to Grafeo as to the editor (views_agree_with_grafeo). A thing is named by its `id` property: the reader
// writes `id: '<name>'` into every node it hands the engine (to_gql.py `_with_ids`; the engine reads nodes back by
// `properties(n).id`, queries.py `read`), and the world the core holds keys every node by that same property
// (`Store` `n.props.id`, `Graph.nodes`), so `n.id` is the name on both sides.
import { isReservedName } from './reserved-words.ts';
import { isSpace, trimStart } from './whitespace.ts';

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

/** Each kind in words, as a refusal names it. */
export const VIEW_NAMES: Record<ViewKind, string> = {
  picked: 'a hand-picked set of things',
  near: 'everything near a thing',
  reaches: 'how one thing reaches another',
  kinds: 'only some kinds',
  path: 'a walked path',
};

/** Each kind's form, written as an example: what a refusal shows as the nearest, and what `viewQuery` writes. */
export const VIEW_FORMS: Record<ViewKind, string> = {
  picked: "MATCH (n) WHERE n.id IN ['a', 'b'] RETURN n",
  near: "MATCH (n {id: 'a'})-[]-{1,2}(m) RETURN n, m",
  reaches: "MATCH p = (a {id: 'a'})-[]->{1,6}(b {id: 'b'}) RETURN p",
  kinds: 'MATCH (n IS Person|Team) RETURN n',
  path: "MATCH (p:Path {id: 'tour'})-[:STEP]->(n) RETURN p, n",
};

const ALLOWED = `A view query has one of five shapes: ${Object.values(VIEW_NAMES).join(', ')}`;

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
    if (c === undefined) throw new Fault(`The text ${raw} has an escape, \\${e}, that is not known`);
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
          ? `The text that starts at ${text.slice(at, at + 12).trim()} is never closed: end it with a single quote`
          : `"${text[at]}" is not allowed in a view: text goes in single quotes, and the only symbols are ()[]{}:,.=|-`,
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

const found = (t: Tok | undefined) => (t ? (t.kind === 'str' ? `the text '${t.text}'` : `"${t.text}"`) : 'the end');

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
    if (!t) this.fail(`The query ends where ${want} should be`);
    this.at++;
    return t;
  }
  sym(s: string, why = `"${s}"`): void {
    const t = this.next(why);
    if (t.kind !== 'sym' || t.text !== s) this.fail(`Expected ${why}, found ${found(t)}`);
  }
  word(w: string): void {
    const t = this.next(w);
    if (t.kind !== 'word' || t.text.toUpperCase() !== w.toUpperCase()) this.fail(`Expected ${w}, found ${found(t)}`);
  }
  /** The word `w` exactly as written, or a refusal: `why` ends with "found", and what was found follows it. */
  exact(w: string, why: string): void {
    const t = this.next(w);
    if (t.kind !== 'word' || t.text !== w) this.fail(`${why} ${found(t)}`);
  }
  ident(what: string): string {
    const t = this.next(what);
    if (t.kind !== 'word') this.fail(`Expected ${what}, found ${found(t)}`);
    return t.text;
  }
  text(what: string): string {
    const t = this.next(what);
    if (t.kind !== 'str') this.fail(`Expected ${what} in single quotes, found ${found(t)}`);
    return t.text;
  }
  int(what: string): number {
    const t = this.next(what);
    if (t.kind !== 'num') this.fail(`Expected ${what}, found ${found(t)}`);
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
    if (isReservedName(n))
      this.fail(
        `${n} is a word GQL or Grafeo keeps for itself, so it cannot be a name in a view: write another, such as ${n}_1`,
      );
    return n;
  }
  /** The name the query already gave a thing, written again. */
  again(name: string): void {
    const t = this.ident(name);
    if (t !== name) this.fail(`The thing is called ${name} here, so write ${name}, not ${t}`);
  }
  /** A new name, not one already used. */
  fresh(what: string, used: string[]): string {
    const n = this.name(what);
    if (used.includes(n)) this.fail(`${n} names two things: give each its own name`);
    return n;
  }
  finish(): void {
    this.take(';');
    const t = this.toks[this.at];
    if (t) this.fail(`Nothing may follow the view's RETURN, found ${found(t)}`);
  }
}

/** The part of a thing's pattern that names it: `{id: 'a'}`. */
function named(c: Cursor): string {
  c.sym('{');
  c.exact('id', "A view finds a thing by its id: write {id: 'name'}; found");
  c.sym(':');
  const id = c.text("the thing's name");
  c.sym('}');
  return id;
}

/** `-[]-{1,k}` or `-[]->{1,k}`, with the most steps allowed: the arrow is read as `directed`. */
function hops(c: Cursor, most: number, arrow: boolean): { steps: number; directed: boolean } {
  c.sym('-');
  c.sym('[');
  c.sym(']');
  const directed = c.take('->');
  if (!directed) c.sym('-', arrow ? '"->" or "-" after []' : '"-" after []');
  if (directed && !arrow) c.fail('Everything near a thing ignores direction: write -[]- with no arrow');
  c.sym('{');
  if (c.int('1') !== 1) c.fail(`Steps are counted from 1: write {1,${most}}`);
  c.sym(',');
  const steps = c.int('the most steps');
  if (steps < 1 || steps > most) c.fail(`At most ${most} steps are allowed here, not ${steps}`);
  c.sym('}');
  return { steps, directed };
}

const shapes: Record<ViewKind, (c: Cursor) => ViewSpec> = {
  picked(c) {
    c.sym('(');
    const n = c.name('a name for the things, such as n');
    c.sym(')');
    c.word('WHERE');
    c.again(n);
    c.sym('.');
    c.exact('id', 'A view finds things by their id: write n.id; found');
    c.word('IN');
    c.sym('[');
    const ids: string[] = [];
    if (!c.is(']')) {
      do ids.push(c.text('a thing name'));
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
    const n = c.name('a name for the thing, such as n');
    const id = named(c);
    c.sym(')');
    const { steps } = hops(c, VIEW_LIMITS.near, false);
    c.sym('(');
    const m = c.fresh('a name for the things near it, such as m', [n]);
    c.sym(')');
    c.word('RETURN');
    c.again(n);
    c.sym(',');
    c.again(m);
    c.finish();
    return { kind: 'near', id, depth: steps };
  },
  reaches(c) {
    const p = c.name('a name for the path, such as p');
    c.sym('=');
    c.sym('(');
    const a = c.name('a name for where it starts, such as a');
    const from = named(c);
    c.sym(')');
    const { steps, directed } = hops(c, VIEW_LIMITS.steps, true);
    c.sym('(');
    c.fresh('a name for where it ends, such as b', [a, p]);
    const to = named(c);
    c.sym(')');
    c.word('RETURN');
    c.again(p);
    c.finish();
    return { kind: 'reaches', from, to, steps, directed };
  },
  kinds(c) {
    c.sym('(');
    const n = c.name('a name for the things, such as n');
    const kinds: string[] = [];
    if (c.take(':')) {
      kinds.push(c.ident('a kind'));
      // Grafeo reads a choice of kinds after IS only, so a query with a colon and a bar would not run there
      if (c.is('|')) c.fail('Grafeo reads several kinds only after IS, not after a colon: write (n IS Person|Team)');
    } else {
      c.word('IS');
      do kinds.push(c.ident('a kind'));
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
    const p = c.name('a name for the path, such as p');
    c.sym(':');
    c.exact('Path', 'A walked path is a Path; found');
    const path = named(c);
    c.sym(')');
    c.sym('-');
    c.sym('[');
    c.sym(':');
    c.exact('STEP', "A walked path's steps are STEPs; found");
    c.sym(']');
    c.sym('->');
    c.sym('(');
    const n = c.fresh('a name for the steps, such as n', [p]);
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
  return { refused: `${reason}. ${ALLOWED}. The nearest is ${VIEW_NAMES[shape]}: ${VIEW_FORMS[shape]}` };
}

/**
 * A view query read into the view it describes: one of the five shapes (spec §7), written as GQL with whitespace and line
 * breaks free, keywords in any case, the names of the things in the pattern as the author likes (but never a word GQL
 * keeps, or Grafeo refuses, as a name: reserved-words.ts), whole-line // comments ignored, text in single quotes. Anything else is refused (view_profile) with a message that says what was wrong, names
 * the five shapes in words and shows the form of the nearest.
 */
export function parseView(query: string): ViewSpec | ViewRefusal {
  let toks: Tok[] = [];
  try {
    toks = lex(query);
    const shape = nearest(toks, query);
    const first = toks[0];
    if (!first) throw new Fault('The view has no query', shape);
    if (first.text.toUpperCase() !== 'MATCH') throw new Fault(`A view starts with MATCH, not ${found(first)}`, shape);
    return shapes[shape](new Cursor(toks.slice(1), shape));
  } catch (e) {
    if (!(e instanceof Fault)) throw e;
    return refusal(e.message, e.shape ?? nearest(toks, query));
  }
}
