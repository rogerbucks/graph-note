// The graph spec's change-set check, said in the person's language (editor spec §42, words_catalogue). The check says
// each thing it checked as a line of UK English. Each line it can say is a word of check-source-words.ts, word for
// word. So the core finds a line's word by matching it whole, and says that word in the person's language. Two lines
// hold a value, the graph's name or the author's. Those are matched against their own word's template, so the value
// is kept. A rule run on the graph after the set is said after `check.after`. A line the core does not know is said
// as the check gave it, so nothing is lost.
import { CHECK_SOURCE_WORDS } from './check-source-words.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** A line of the check in the person's language, with the key of its word: null for a line the core does not know. */
export interface CheckWords {
  id: WordKey | null;
  said: string;
}

type CheckKey = keyof typeof CHECK_SOURCE_WORDS;

const AFTER: CheckKey = 'check.after';
const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/g;
const SPECIAL = /[.*+?^${}()|[\]\\]/g;
const ENTRIES = (Object.entries(CHECK_SOURCE_WORDS) as [CheckKey, string][]).filter(([key]) => key !== AFTER);

/** Each line with no value, by its words: the key of its word. */
const PLAIN = new Map(ENTRIES.filter(([, text]) => !text.includes('{')).map(([key, text]) => [text, key]));

/** `template` as a pattern of a whole line, each placeholder a named group. */
const patternOf = (template: string): RegExp => {
  const parts = template.split(PLACEHOLDER);
  const source = parts.map((p, i) => (i % 2 ? `(?<${p}>[\\s\\S]+)` : p.replace(SPECIAL, '\\$&'))).join('');
  return new RegExp(`^${source}$`);
};

/** Each line that holds a value, as a pattern of its template, with the key of its word. */
const VALUED = ENTRIES.filter(([, text]) => text.includes('{')).map(([key, text]) => [key, patternOf(text)] as const);

/** The pattern of a rule's line after the set: `check.after`, with the rule's own words as its value. */
const AFTER_PATTERN = patternOf(CHECK_SOURCE_WORDS[AFTER]);

/** A line's word and the values it holds, or null when the core does not know the line. */
function lineOf(label: string): { key: CheckKey; values: Record<string, string> } | null {
  const plain = PLAIN.get(label);
  if (plain) return { key: plain, values: {} };
  for (const [key, pattern] of VALUED) {
    const m = pattern.exec(label);
    if (m) return { key, values: { ...m.groups } };
  }
  return null;
}

/**
 * A line of the change-set check in the person's language, with the key of its word. A rule run on the graph after
 * the set has its rule's key, and is said after `check.after`. A line the core does not know has no key, and is said
 * as the check gave it.
 */
export function checkWords(label: string): CheckWords {
  const rule = AFTER_PATTERN.exec(label)?.groups?.rule;
  const after = rule === undefined ? null : lineOf(rule);
  if (after) return { id: after.key, said: word(AFTER, { rule: word(after.key, after.values) }) };
  const line = lineOf(label);
  return line ? { id: line.key, said: word(line.key, line.values) } : { id: null, said: label };
}
