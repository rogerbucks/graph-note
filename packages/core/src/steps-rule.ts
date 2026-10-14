// A graph step's rule (editor spec §20, run_declared_only): a GQL query over graph data, never code or a named action, so
// the editor only ever works out information. The one shape read is a declared rule: MATCH one pattern — things, each
// with an optional name, kind and properties, joined by up to six links of a type, either way or both — then INSERT
// the links it implies between things the pattern named. Anything else is refused, saying why and showing the form: a
// procedure or function called, a write (SET, DELETE…), a RETURN, or anything that reads as code.
import { N, S } from './whitespace.ts';

/** One thing in a step's pattern: the name it is given there, its kind, and the properties it must have. */
export interface ThingPattern {
  name?: string;
  kind?: string;
  props: [string, string | number | boolean][];
}

/** One link in a step's pattern: its type, if given, and which way it runs from the thing before it. */
export interface LinkPattern {
  type?: string;
  way: 'out' | 'in' | 'either';
}

/** A link a step's rule gives: from the thing named `from` in the pattern, of `type`, to the one named `to`. */
export interface InsertLink {
  from: string;
  type: string;
  to: string;
}

/** A step's rule, read: the pattern (things joined by links, one fewer link than things) and the links it gives. */
export interface StepRule {
  things: ThingPattern[];
  links: LinkPattern[];
  insert: InsertLink[];
}

/** The most links a step's pattern may hold, as a view's routes are held to six steps. */
export const MOST_PATTERN_LINKS = 6;

/** The form of a step's rule, written as an example: what every refusal shows. */
export const RULE_FORM =
  'MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person) INSERT (a)-[:WORKS_WITH]->(b)';

const FORM = `a step is MATCH a pattern, then INSERT the links it implies, as in ${RULE_FORM}`;
const NAMED = 'a step never calls a procedure or a named action, so the editor only ever works out information';
const WRITES = 'a step never changes or removes anything itself: what it gives is offered as a proposal';
const RETURNS = 'a step gives a graph: write INSERT and the links it gives in place of RETURN';
const CODE = 'a step is a query, never code';
const ADDS = 'INSERT adds links between things the MATCH found, never a thing of its own';
const WRITE_WORDS = new Set(['SET', 'DELETE', 'DETACH', 'REMOVE', 'MERGE', 'CREATE', 'DROP', 'LOAD', 'FINISH']);
const CODE_WORDS = new Set(['const', 'let', 'var', 'function', 'import', 'await', 'async', 'new', 'class', 'def']);

type Tok = { kind: 'str' | 'num' | 'word' | 'sym' | 'bad'; text: string };

const TOKEN = new RegExp(
  `${S}*(?:('(?:[^'\\\\]|\\\\[^\\n])*')|(-?\\d+(?:\\.\\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(->|<-|=>|[()[\\]{}:,.=;|-])|(${N}))`,
  'y',
);

/** The rule's tokens, every one kept, an unknown character among them, so nothing is passed over in silence. */
function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m && m[0]; m = TOKEN.exec(text)) {
    const [, str, num, word, sym, bad] = m;
    if (str !== undefined) out.push({ kind: 'str', text: str });
    else if (num !== undefined) out.push({ kind: 'num', text: num });
    else if (word !== undefined) out.push({ kind: 'word', text: word });
    else if (sym !== undefined) out.push({ kind: 'sym', text: sym });
    else out.push({ kind: 'bad', text: bad ?? '' });
  }
  return out;
}

const fault = (detail: string) => ({ fault: `${detail}: ${FORM}` });

/** Why the rule is not one a step may be before it is parsed, by the words and marks it uses; null when none. */
function notAQuery(toks: Tok[]): string | null {
  // a word that is a kind, a type or a property's key (beside a colon) is a name, never a keyword
  const keyword = (i: number) =>
    toks[i]?.kind === 'word' && toks[i - 1]?.text !== ':' && toks[i + 1]?.text !== ':'
      ? (toks[i]?.text ?? '').toUpperCase()
      : '';
  const words = toks.map((_, i) => keyword(i));
  if (words.includes('CALL')) return NAMED;
  if (words.some((w) => WRITE_WORDS.has(w))) return WRITES;
  if (words.includes('RETURN')) return RETURNS;
  const first = toks[0]?.kind === 'word' ? (toks[0]?.text ?? '') : '';
  if (CODE_WORDS.has(first) || toks.some((t) => t.kind === 'bad' || ['=', '=>', ';', '.'].includes(t.text)))
    return CODE;
  // a word straight before a bracket, other than MATCH and INSERT, is a function or a named action called
  const called = words.some((w, i) => !!w && w !== 'MATCH' && w !== 'INSERT' && toks[i + 1]?.text === '(');
  return called ? NAMED : null;
}

/** A value in a pattern's properties: a text, a number, or true or false. */
function valueOf(t: Tok | undefined): string | number | boolean | undefined {
  if (!t) return undefined;
  if (t.kind === 'str') return t.text.slice(1, -1).replace(/\\(.)/g, '$1');
  if (t.kind === 'num') return Number(t.text);
  if (t.kind === 'word' && /^(true|false)$/i.test(t.text)) return t.text.toLowerCase() === 'true';
  return undefined;
}

/**
 * A step's rule read from its text (comment lines already taken out), or why it is not one a step may be: the detail,
 * then the form. Only MATCH one pattern, then INSERT links between the things it names, is read.
 */
export function readRule(text: string): StepRule | { fault: string } {
  const toks = tokens(text);
  if (!toks.length) return fault('a step needs its rule');
  const not = notAQuery(toks);
  if (not) return fault(not);
  let i = 0;
  const peek = () => toks[i]?.text ?? '',
    take = (want: string) => (peek().toUpperCase() === want.toUpperCase() ? (i++, true) : false),
    word = () => (toks[i]?.kind === 'word' ? (toks[i++]?.text ?? '') : '');
  if (!take('MATCH')) return fault(`a step starts with MATCH, not '${peek()}'`);
  const things: ThingPattern[] = [],
    links: LinkPattern[] = [];
  const thing = (): ThingPattern | string => {
    if (!take('(')) return `cannot read '${peek()}' where a thing in brackets is wanted`;
    const t: ThingPattern = { props: [] };
    if (toks[i]?.kind === 'word') t.name = word();
    if (take(':')) t.kind = word() || undefined;
    if (take('{'))
      do {
        const key = word(),
          value = take(':') ? valueOf(toks[i++]) : undefined;
        if (!key || value === undefined)
          return 'a property in the pattern is a key, a colon and a text, a number or true or false';
        t.props.push([key, value]);
      } while (take(','));
    if (t.props.length && !take('}')) return `cannot read '${peek()}' in a thing's properties`;
    return take(')') ? t : `cannot read '${peek()}' in a thing of the pattern`;
  };
  const link = (): LinkPattern | string => {
    const back = take('<-');
    if ((!back && !take('-')) || !take('[')) return 'a link is written -[:TYPE]->, <-[:TYPE]- or -[:TYPE]-';
    if (toks[i]?.kind === 'word') word();
    const type = take(':') ? word() || undefined : undefined;
    if (!take(']')) return `cannot read '${peek()}' in a link of the pattern, matched by its type only`;
    if (back) return take('-') ? { type, way: 'in' } : 'a link written <-[:TYPE] ends with -';
    if (take('->')) return { type, way: 'out' };
    return take('-') ? { type, way: 'either' } : 'a link written -[:TYPE] ends with -> or -';
  };
  for (;;) {
    const t = thing();
    if (typeof t === 'string') return fault(t);
    things.push(t);
    if (peek() !== '-' && peek() !== '<-') break;
    if (links.length === MOST_PATTERN_LINKS) return fault(`a step's pattern holds at most ${MOST_PATTERN_LINKS} links`);
    const l = link();
    if (typeof l === 'string') return fault(l);
    links.push(l);
  }
  if (!take('INSERT')) return fault(`the pattern is followed by INSERT and the links it implies, not '${peek()}'`);
  const named = new Set(things.flatMap((t) => (t.name ? [t.name] : [])));
  const insert: InsertLink[] = [];
  const end = (): string | null => {
    if (!take('(')) return ADDS;
    const name = word();
    if (!name || peek() === ':' || peek() === '{') return ADDS;
    if (!named.has(name)) return `INSERT names ${name}, which the MATCH does not`;
    return take(')') ? null : ADDS;
  };
  do {
    const fromAt = i;
    const bad = end();
    if (bad) return fault(bad);
    const from = toks[fromAt + 1]?.text ?? '';
    const back = take('<-');
    if (!back && !take('-')) return fault(ADDS);
    if (!take('[') || !take(':')) return fault('a link INSERT gives is written -[:TYPE]->, with its type');
    const type = word();
    if (!type || !take(']')) return fault('a link INSERT gives is written -[:TYPE]->, with its type');
    if (back ? !take('-') : !take('->')) return fault('a link INSERT gives runs one way: -[:TYPE]-> or <-[:TYPE]-');
    const toAt = i;
    const badTo = end();
    if (badTo) return fault(badTo);
    const to = toks[toAt + 1]?.text ?? '';
    insert.push(back ? { from: to, type, to: from } : { from, type, to });
  } while (take(','));
  if (i < toks.length) return fault(`cannot read '${peek()}' after the links INSERT gives`);
  return { things, links, insert };
}

/** The kinds and the types a rule's pattern matches, each once, in the order written. */
export function ruleWords(rule: StepRule): { kinds: string[]; types: string[] } {
  return {
    kinds: [...new Set(rule.things.flatMap((t) => (t.kind ? [t.kind] : [])))],
    types: [...new Set(rule.links.flatMap((l) => (l.type ? [l.type] : [])))],
  };
}
