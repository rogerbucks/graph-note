// The graph spec reader's problems, said in the person's language (editor spec §42, words_catalogue and problem_codes).
// The reader gives each problem in UK English, with a stable code. Each code's message and fix are templates in one
// table, packages/graph-spec/src/reader/problem-codes.json. Both libraries are held to that table, word for word.
// So the core does not change the reader. It finds the values that filled the template, by matching the problem's
// words against its own code's template. Then it says the catalogue's words for that code, with the same values.
// Matching a code's own template is safe: the template never changes, unlike other English text. A code it does not
// know, or words that do not fit their template, are said as the reader gave them, so nothing is lost.
import TABLE from '../../graph-spec/src/reader/problem-codes.json' with { type: 'json' };
import { READER_KEYS } from './reader-source-words.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** A problem as the graph spec's reader gives it: what is wrong, how to fix it, and its code. A ProfileError is one. */
export interface ReaderProblem {
  msg: string;
  fix: string;
  code?: string;
}

/** The values a reader problem's template was filled with, by placeholder. */
export type ReaderValues = Record<string, string | number>;

const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/g;
const SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** `template` as a pattern of a whole text. Each placeholder is a group, lazy or greedy; a repeat must be the same. */
function patternOf(template: string, lazy: boolean): RegExp {
  const seen = new Set<string>();
  let source = '',
    at = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const name = m[1] ?? '';
    source += template.slice(at, m.index).replace(SPECIAL, '\\$&');
    source += seen.has(name) ? `\\k<${name}>` : `(?<${name}>[\\s\\S]*${lazy ? '?' : ''})`;
    seen.add(name);
    at = (m.index ?? 0) + m[0].length;
  }
  return new RegExp(`^${source}${template.slice(at).replace(SPECIAL, '\\$&')}$`);
}

/** Each code's message and fix, as a lazy and a greedy pattern of each. */
const PATTERNS = new Map(
  TABLE.codes.map((c) => [c.code, [c.message, c.fix].map((t) => [patternOf(t, true), patternOf(t, false)] as const)]),
);

/**
 * The values `text` fills its template with, or null. Null means it does not fit, or it fits more than one way. That
 * happens when a value holds the words that follow it: the lazy and the greedy match then split it differently.
 */
function valuesIn(text: string, [lazy, greedy]: readonly [RegExp, RegExp]): Record<string, string> | null {
  const a = lazy.exec(text),
    b = greedy.exec(text);
  if (!a || !b) return null;
  const values = { ...a.groups };
  for (const [name, value] of Object.entries(values)) if (b.groups?.[name] !== value) return null;
  return values;
}

/**
 * The values a reader problem's message and fix were filled with, or null. Null is for a code with no template, or
 * words that do not fit it in only one way. A value the message and the fix both hold must be the same in each.
 * `count` is a number, as the catalogue's words need it.
 */
export function readerValues(problem: ReaderProblem): ReaderValues | null {
  const patterns = problem.code ? PATTERNS.get(problem.code) : undefined;
  if (!patterns) return null;
  const [message, fix] = patterns as [readonly [RegExp, RegExp], readonly [RegExp, RegExp]];
  const said = valuesIn(problem.msg, message),
    fixed = valuesIn(problem.fix, fix);
  if (!said || !fixed) return null;
  for (const [name, value] of Object.entries(fixed)) if (Object.hasOwn(said, name) && said[name] !== value) return null;
  const values: ReaderValues = { ...said, ...fixed };
  if (Object.hasOwn(values, 'count')) {
    if (!/^\d+$/.test(String(values.count))) return null;
    values.count = Number(values.count);
  }
  return values;
}

/** The catalogue's keys for a code's message and fix, or null for a code it has no words for. */
export function readerKeys(code: string | undefined): { message: WordKey; fix: WordKey } | null {
  if (!code || !Object.hasOwn(READER_KEYS, code)) return null;
  const message = READER_KEYS[code as keyof typeof READER_KEYS];
  return { message, fix: `${message}.fix` as WordKey };
}

/**
 * A reader problem's message and fix, in the person's language: its code's words, filled with its own values. When
 * the code is not known, or its words do not fit their template, they are the reader's own words.
 */
export function readerWords(problem: ReaderProblem): { message: string; fix: string } {
  const keys = readerKeys(problem.code);
  const values = keys ? readerValues(problem) : null;
  if (!keys || !values) return { message: problem.msg, fix: problem.fix };
  return { message: word(keys.message, values), fix: word(keys.fix, values) };
}

const KEPT = new WeakMap<object, ReaderValues>();

/**
 * Keeps the values of reader problem `from` beside `problem`, the core's own record of it. So a later step can use
 * them without reading the problem's words, which are in the person's language.
 */
export function keepValues(problem: object, from: ReaderProblem): void {
  const values = readerValues(from);
  if (values) KEPT.set(problem, values);
}

/** The values kept beside `problem` by `keepValues`, if any. */
export const keptValues = (problem: object): ReaderValues | undefined => KEPT.get(problem);
