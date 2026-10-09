// Completing as you type (editor spec §4): what to offer inline after the caret — the closer of a bracket, brace or quote
// just opened, a keyword, a declared kind or relationship type, a property name or a value already used — as the best
// single match, the text to add; and the closer typed where one is already there, stepped over. Nothing here inserts
// anything: a host shows the offer, and writes it only when the person accepts it.
import { completions } from './help.ts';
import { propertyNames } from './inspector.ts';
import type { NoteReading } from './note-reading.ts';
import type { TextChange } from './commas.ts';

/** What an offer is: the closer of something opened, a keyword, a kind, a relationship type, a property name or a value. */
export type InlineKind = 'closer' | 'keyword' | 'kind' | 'type' | 'property' | 'value';

/** One thing to offer after the caret. */
export interface Inline {
  /** The text to add after the caret. */
  add: string;
  kind: InlineKind;
  /** How far into `add` the caret goes once it is accepted: none for a bracket just opened, so what goes inside comes next. */
  caretAfter: number;
}

const STATEMENTS = ['INSERT', 'MATCH', 'SET'];
const VALUES = ['DATE', 'DATETIME', 'TRUE', 'FALSE'];
/** Letters needed before a keyword is offered, so a stray letter never brings one. */
const KEYWORD_FROM = 2;
const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** Where a text ends up: the brackets still open, and whether it ends inside a string (with its quote and place) or a comment. */
interface Scan {
  open: { ch: string; at: number }[];
  state: 'code' | 'string' | 'comment';
  quote: string;
  at: number;
}

/** Reads a text the way the tokenizer does: comments and strings are not code, and a string ends with its line. */
function scan(text: string): Scan {
  const open: Scan['open'] = [];
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i),
      two = text.slice(i, i + 2);
    if (two === '//' || two === '/*') {
      const end = two === '//' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
      if (end < 0) return { open, state: 'comment', quote: '', at: i };
      i = two === '//' ? end : end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < text.length && text.charAt(j) !== '\n'; j++) {
        const d = text.charAt(j);
        if (d === '\\' && c !== '`') j++;
        else if (d === c && text.charAt(j + 1) === c) j++;
        else if (d === c) break;
      }
      if (j >= text.length) return { open, state: 'string', quote: c, at: i };
      i = text.charAt(j) === c ? j + 1 : j;
    } else {
      if (CLOSERS[c]) open.push({ ch: c, at: i });
      else if (Object.values(CLOSERS).includes(c) && open.length && CLOSERS[open[open.length - 1]?.ch ?? ''] === c)
        open.pop();
      i++;
    }
  }
  return { open, state: 'code', quote: '', at: 0 };
}

/** The text with the inside of every string and comment blanked, so what is left is code, and places hold. */
const blanked = (text: string): string =>
  text
    .replace(/'(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?/g, (m) => m.charAt(0) + ' '.repeat(m.length - 1))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/** The first of `words` that `typed` begins and that is longer than it, finished in the case being typed. */
function wordFor(words: string[], typed: string): string | null {
  const lower = typed !== typed.toUpperCase(),
    found = words.find((w) => w.length > typed.length && w.startsWith(typed.toUpperCase()));
  return found ? (lower ? found.slice(typed.length).toLowerCase() : found.slice(typed.length)) : null;
}

/** What the pattern a brace sits in is: the kind of a thing, or the type of a link, if it says one. */
function owner(reading: NoteReading, graph: string, head: string, round: boolean): { kind: string; type: string } {
  const parts = head.split(':').map((p) => p.trim());
  if (!round) return { kind: '', type: parts.length > 1 ? (parts[parts.length - 1] ?? '') : '' };
  const written = parts.slice(1).find(Boolean);
  const box = reading.graphs.get(graph)?.boxes.find((b) => b.key === parts[0]);
  return { kind: written ?? box?.kind.split(' · ')[0] ?? '', type: '' };
}

/** The first of `names` that `typed` begins, not written already in the braces: its rest, with the colon that follows it. */
function nameFor(names: string[], typed: string, written: string, next: string): Inline | null {
  const used = new Set([...blanked(written).matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
  const name = names.find((n) => n.startsWith(typed) && !used.has(n));
  if (!name) return null;
  const add = name.slice(typed.length) + (next.startsWith(':') ? '' : ': ');
  return add ? { add, kind: 'property', caretAfter: add.length } : null;
}

/** The property names used on links of a type, most used first. */
function linkNames(reading: NoteReading, graph: string, type: string): string[] {
  const count = new Map<string, number>();
  for (const e of reading.world[graph]?.edges ?? [])
    if (!type || e[1] === type) for (const k of Object.keys(e[3])) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).map(([k]) => k);
}

/** The values (as text, quotes escaped as the profile writes them) a property has on things of a kind or links of a type. */
function valuesOf(reading: NoteReading, graph: string, o: { kind: string; type: string }, key: string): string[] {
  const g = reading.world[graph];
  if (!g) return [];
  const props = o.type
    ? g.edges.filter((e) => e[1] === o.type).map((e) => e[3])
    : (o.kind ? g.labelled(o.kind) : [...g.nodes.keys()]).map((id) => g.p(id));
  const count = new Map<string, number>();
  for (const p of props) {
    const v = p[key];
    if (typeof v === 'string') {
      const text = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      count.set(text, (count.get(text) ?? 0) + 1);
    }
  }
  return [...count].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).map(([v]) => v);
}

/** What is offered inside a string just begun after `key:` in a map: a value already used for that property. */
function valueFor(reading: NoteReading, graph: string, text: string, s: Scan): Inline | null {
  const brace = s.open[s.open.length - 1],
    key = /(\w+)\s*:\s*$/.exec(text.slice(0, s.at))?.[1],
    typed = text.slice(s.at + 1);
  if (s.quote !== "'" || brace?.ch !== '{' || !key || !typed) return null;
  const before = s.open[s.open.length - 2],
    o = before ? owner(reading, graph, text.slice(before.at + 1, brace.at), before.ch === '(') : { kind: '', type: '' };
  const value = valuesOf(reading, graph, o, key).find((v) => v.startsWith(typed) && v.length > typed.length);
  return value
    ? { add: value.slice(typed.length) + "'", kind: 'value', caretAfter: value.length - typed.length + 1 }
    : null;
}

/** What the open bracket in `s` could be finished with, if it was just opened or something has been written in it. */
function closerFor(text: string, caret: number, s: Scan): Inline | null {
  const top = s.open[s.open.length - 1];
  if (!top) return null;
  const closer = CLOSERS[top.ch] ?? '';
  if (top.at === caret - 1) return { add: closer, kind: 'closer', caretAfter: 0 };
  const written = /[\w'")\]}]$/.test(text.slice(0, caret)) && !text.slice(top.at, caret).includes('\n');
  return written ? { add: closer, kind: 'closer', caretAfter: 1 } : null;
}

/**
 * What to offer inline with the caret at `caret` of a graph block's text: the best single match, as the text to add after
 * the caret, or null when there is none. A bracket, brace or quote just opened offers its closer; a word being typed
 * offers a keyword, a kind after `(name:`, a type after `-[:`, a property name after `{` or `,` inside braces, or a value
 * already used for that property after `name: '`; and when none of those fit, whatever is open is closed. Nothing is
 * offered inside a comment, or when text follows the caret on its line.
 */
export function inlineCompletion(reading: NoteReading, graph: string, text: string, caret: number): Inline | null {
  const before = text.slice(0, caret),
    rest = text.slice(caret).split('\n')[0] ?? '';
  if (!before || rest.trim()) return null;
  const s = scan(before);
  if (s.state === 'comment') return null;
  if (s.state === 'string') {
    const value = valueFor(reading, graph, before, s);
    if (value) return value;
    return s.at === caret - 1 ? { add: s.quote, kind: 'closer', caretAfter: 0 } : null;
  }
  const word = /[A-Za-z_]\w*$/.exec(before)?.[0] ?? '',
    top = s.open[s.open.length - 1],
    previous = before
      .slice(0, before.length - word.length)
      .trimEnd()
      .slice(-1);
  if (word) {
    const named = (re: RegExp, kind: 'kind' | 'type'): Inline | null => {
      const item = re.test(before)
        ? completions(reading, graph, text, caret).items.find(
            (i) => i.label.length > word.length && i.label.startsWith(word),
          )
        : null;
      return item ? { add: item.label.slice(word.length), kind, caretAfter: item.label.length - word.length } : null;
    };
    let found: Inline | null = null;
    if (top?.ch === '(') found = named(/\(\s*\w+\s*:\s*(?:\w+\s*:\s*)*\w+$/, 'kind');
    else if (top?.ch === '[') found = named(/-\[\s*:\s*\w+$/, 'type');
    else if (top?.ch === '{' && (previous === '{' || previous === ',')) {
      const parent = s.open[s.open.length - 2],
        o = parent ? owner(reading, graph, before.slice(parent.at + 1, top.at), parent.ch === '(') : null,
        names = o?.type ? linkNames(reading, graph, o.type) : propertyNames(reading, graph, o?.kind ?? '');
      found = nameFor(names, word, before.slice(top.at + 1, before.length - word.length), rest);
    }
    const words =
      (top?.ch === '{' && previous === ':') || (!top && previous === '=')
        ? VALUES
        : !top && previous !== ':' && previous !== '.' // after a dot it is a property of something, never a keyword
          ? STATEMENTS
          : [];
    const add = word.length >= KEYWORD_FROM && !found ? wordFor(words, word) : null;
    if (add) found = { add, kind: 'keyword', caretAfter: add.length };
    if (found) return found;
  }
  return closerFor(text, caret, s);
}

/**
 * The change that steps over a closer: `text` is `before` with one character typed at `caret - 1`, and that character is a
 * closer — ) ] } or a quote — typed where the same one already follows and closes what is still open. Removing the one
 * that follows leaves the text as if the caret had stepped over it; null when the keystroke is to be left as it is.
 */
export function stepOver(before: string, text: string, caret: number): TextChange | null {
  const typed = text.charAt(caret - 1);
  if (text.length !== before.length + 1 || text.slice(0, caret - 1) + text.slice(caret) !== before) return null;
  if (!typed || text.charAt(caret) !== typed) return null;
  const s = scan(text.slice(0, caret - 1)),
    top = s.open[s.open.length - 1];
  const closes = typed === s.quote ? s.state === 'string' : s.state === 'code' && !!top && CLOSERS[top.ch] === typed;
  return closes ? { from: caret, to: caret + 1, text: '' } : null;
}
