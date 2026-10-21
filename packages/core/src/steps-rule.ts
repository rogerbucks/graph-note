// A graph step's rule (editor spec §20, run_declared_only). It is a GQL query over graph data, never code or a named
// action. So the editor only ever works out information. The one shape read is a declared rule. It is MATCH one
// pattern, then INSERT the links it implies between things the pattern named. The pattern is things joined by up to six
// links of a type, either way or both. Each thing has an optional name, kind and properties. Anything else is refused,
// saying why and showing the form. That means a procedure or function called, a write (SET, DELETE…), a RETURN, or
// anything that reads as code.
import { N, S } from './whitespace.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

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

const WRITE_WORDS = new Set(['SET', 'DELETE', 'DETACH', 'REMOVE', 'MERGE', 'CREATE', 'DROP', 'LOAD', 'FINISH']);
const CODE_WORDS = new Set(['const', 'let', 'var', 'function', 'import', 'await', 'async', 'new', 'class', 'def']);

/** One token of a rule: a text, a number, a word, a mark, or a character that cannot be read; and as it is written. */
export type RuleToken = { kind: 'str' | 'num' | 'word' | 'sym' | 'bad'; text: string };
type Tok = RuleToken;

// a text ends at its line, so a quote left open is never read on through the rest of the rule
const TOKEN = new RegExp(
  `${S}*(?:('(?:[^'\\\\\\n]|\\\\[^\\n])*')|(-?\\d+(?:\\.\\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(->|<-|=>|[()[\\]{}:,.=;|-])|(${N}))`,
  'y',
);

/**
 * The rule's tokens up to and including the first mark that cannot be read. That mark is kept, so nothing is passed
 * over in silence. Nothing after it is read (spec §9). However a rule is written, it is read once, never again from
 * each open quote.
 */
export function ruleTokens(text: string): Tok[] {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m && m[0]; m = TOKEN.exec(text)) {
    const [, str, num, word, sym, bad] = m;
    if (str !== undefined) out.push({ kind: 'str', text: str });
    else if (num !== undefined) out.push({ kind: 'num', text: num });
    else if (word !== undefined) out.push({ kind: 'word', text: word });
    else if (sym !== undefined) out.push({ kind: 'sym', text: sym });
    else {
      out.push({ kind: 'bad', text: bad ?? '' });
      break;
    }
  }
  return out;
}

/** A refusal of the rule: the detail, in the reader's language, then the form every refusal shows. */
const fault = (detail: string) => ({ fault: word('steps.rule.refused', { reason: detail, form: RULE_FORM }) });

/** Why the rule is not one a step may be before it is parsed, by the words and marks it uses; null when none. */
function notAQuery(toks: Tok[]): WordKey | null {
  // a word that is a kind, a type or a property's key (beside a colon) is a name, never a keyword
  const keyword = (i: number) =>
    toks[i]?.kind === 'word' && toks[i - 1]?.text !== ':' && toks[i + 1]?.text !== ':'
      ? (toks[i]?.text ?? '').toUpperCase()
      : '';
  const words = toks.map((_, i) => keyword(i));
  if (words.includes('CALL')) return 'steps.rule.named';
  if (words.some((w) => WRITE_WORDS.has(w))) return 'steps.rule.writes';
  if (words.includes('RETURN')) return 'steps.rule.returns';
  const first = toks[0]?.kind === 'word' ? (toks[0]?.text ?? '') : '';
  if (CODE_WORDS.has(first) || toks.some((t) => t.kind === 'bad' || ['=', '=>', ';', '.'].includes(t.text)))
    return 'steps.rule.code';
  // a word straight before a bracket, other than MATCH and INSERT, is a function or a named action called
  const called = words.some((w, i) => !!w && w !== 'MATCH' && w !== 'INSERT' && toks[i + 1]?.text === '(');
  return called ? 'steps.rule.named' : null;
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
 * A step's rule read from its text (comment lines already taken out). Or why it is not one a step may be: the detail,
 * then the form. Only MATCH one pattern, then INSERT links between the things it names, is read.
 */
export function readRule(text: string): StepRule | { fault: string } {
  const toks = ruleTokens(text);
  if (!toks.length) return fault(word('steps.rule.empty'));
  const not = notAQuery(toks);
  if (not) return fault(word(not));
  let i = 0;
  const peek = () => toks[i]?.text ?? '',
    take = (want: string) => (peek().toUpperCase() === want.toUpperCase() ? (i++, true) : false),
    name = () => (toks[i]?.kind === 'word' ? (toks[i++]?.text ?? '') : '');
  if (!take('MATCH')) return fault(word('steps.rule.no-match', { found: peek() }));
  const things: ThingPattern[] = [],
    links: LinkPattern[] = [];
  const thing = (): ThingPattern | string => {
    if (!take('(')) return word('steps.rule.thing-bracket', { found: peek() });
    const t: ThingPattern = { props: [] };
    if (toks[i]?.kind === 'word') t.name = name();
    if (take(':')) t.kind = name() || undefined;
    if (take('{'))
      do {
        const key = name(),
          value = take(':') ? valueOf(toks[i++]) : undefined;
        if (!key || value === undefined) return word('steps.rule.property');
        t.props.push([key, value]);
      } while (take(','));
    if (t.props.length && !take('}')) return word('steps.rule.properties', { found: peek() });
    return take(')') ? t : word('steps.rule.thing', { found: peek() });
  };
  const link = (): LinkPattern | string => {
    const back = take('<-');
    if ((!back && !take('-')) || !take('[')) return word('steps.rule.link');
    if (toks[i]?.kind === 'word') name();
    const type = take(':') ? name() || undefined : undefined;
    if (!take(']')) return word('steps.rule.link-type', { found: peek() });
    if (back) return take('-') ? { type, way: 'in' } : word('steps.rule.link-in');
    if (take('->')) return { type, way: 'out' };
    return take('-') ? { type, way: 'either' } : word('steps.rule.link-out');
  };
  for (;;) {
    const t = thing();
    if (typeof t === 'string') return fault(t);
    things.push(t);
    if (peek() !== '-' && peek() !== '<-') break;
    if (links.length === MOST_PATTERN_LINKS) return fault(word('steps.rule.most-links', { count: MOST_PATTERN_LINKS }));
    const l = link();
    if (typeof l === 'string') return fault(l);
    links.push(l);
  }
  if (!take('INSERT')) return fault(word('steps.rule.no-insert', { found: peek() }));
  const named = new Set(things.flatMap((t) => (t.name ? [t.name] : [])));
  const insert: InsertLink[] = [];
  const end = (): string | null => {
    if (!take('(')) return word('steps.rule.adds');
    const at = name();
    if (!at || peek() === ':' || peek() === '{') return word('steps.rule.adds');
    if (!named.has(at)) return word('steps.rule.unnamed', { name: at });
    return take(')') ? null : word('steps.rule.adds');
  };
  do {
    const fromAt = i;
    const bad = end();
    if (bad) return fault(bad);
    const from = toks[fromAt + 1]?.text ?? '';
    const back = take('<-');
    if (!back && !take('-')) return fault(word('steps.rule.adds'));
    if (!take('[') || !take(':')) return fault(word('steps.rule.insert-type'));
    const type = name();
    if (!type || !take(']')) return fault(word('steps.rule.insert-type'));
    if (back ? !take('-') : !take('->')) return fault(word('steps.rule.insert-way'));
    const toAt = i;
    const badTo = end();
    if (badTo) return fault(badTo);
    const to = toks[toAt + 1]?.text ?? '';
    insert.push(back ? { from: to, type, to: from } : { from, type, to });
  } while (take(','));
  if (i < toks.length) return fault(word('steps.rule.after-insert', { found: peek() }));
  return { things, links, insert };
}

/** The kinds and the types a rule's pattern matches, each once, in the order written. */
export function ruleWords(rule: StepRule): { kinds: string[]; types: string[] } {
  return {
    kinds: [...new Set(rule.things.flatMap((t) => (t.kind ? [t.kind] : [])))],
    types: [...new Set(rule.links.flatMap((l) => (l.type ? [l.type] : [])))],
  };
}
