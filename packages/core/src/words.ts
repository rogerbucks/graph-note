// The words the person reads, kept by key in one catalogue (editor spec §42, words_catalogue, language_follows_host and
// translations_as_files). UK English is the source (source-words.ts). A translation is a plain file of the same keys
// for one language. It is checked to hold the source's placeholders and plural forms before it is used. The host says
// the language once (`setLanguage`, from `DisplayHost.language`). A word a translation leaves out is said in UK
// English, never as its key. A placeholder is written `{name}`. A word that changes with a count is written once for
// each plural form the language has (`Intl.PluralRules`), with `{count}` shown in the reader's locale.
import { formatCount } from './locale-formats.ts';
import { PSEUDO_LANGUAGES, pseudoWords } from './pseudo-words.ts';
import { SOURCE_WORDS } from './source-words.ts';
import { TRANSLATION_FILES } from './translation-files.ts';

/** The language of the source words, which every translation falls back to. */
export const SOURCE_LANGUAGE = 'en-GB';

/** The forms of a word that changes with a count, by the plural category of `Intl.PluralRules`; `other` is always given. */
export type PluralWords = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** One entry of a catalogue: a word, or its forms for a count. */
export type Words = string | PluralWords;

/** A catalogue of words by key: the source, or a translation of it. */
export type Catalogue = Record<string, Words>;

/** The key of a word of the source catalogue. */
export type WordKey = keyof typeof SOURCE_WORDS;

/** The values a word's placeholders are filled with; `count` also picks a word's plural form. */
export type WordValues = Record<string, string | number> & { count?: number };

const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/g;
const CATEGORIES: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** The canonical form of a language tag, or null when it is not one. */
function canonical(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

/** The placeholders of an entry, each once, sorted: those of every form, for a word with plural forms. */
export function placeholdersOf(entry: Words): string[] {
  const texts = typeof entry === 'string' ? [entry] : Object.values(entry);
  const names = texts.flatMap((t) =>
    typeof t === 'string' ? [...t.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '') : [],
  );
  return [...new Set(names)].sort();
}

/**
 * What is wrong with `translation` of the source `source`, for language `tag`, one line each, or none. It may be a key
 * the source lacks, or an entry that is not a word or plural forms. Or it may be one whose placeholders or kind differ
 * from the source's. A key the translation leaves out is no problem: that word is said in the source language.
 */
export function translationProblems(source: Catalogue, translation: Catalogue, tag: string): string[] {
  const problems: string[] = [];
  if (!canonical(tag)) problems.push(`"${tag}" is not a language tag`);
  for (const [key, entry] of Object.entries(translation)) {
    const from = source[key];
    if (from === undefined) {
      problems.push(`${key}: the source has no such word`);
      continue;
    }
    if (typeof entry !== 'string' && (typeof entry !== 'object' || entry === null || typeof entry.other !== 'string')) {
      problems.push(`${key}: is neither a word nor plural forms with "other"`);
      continue;
    }
    if (typeof entry === 'object') {
      const bad = Object.entries(entry).filter(([c, t]) => !CATEGORIES.includes(c) || typeof t !== 'string');
      if (bad.length) problems.push(`${key}: ${bad.map(([c]) => `"${c}"`).join(', ')} is not a plural form`);
    }
    if ((typeof from === 'string') !== (typeof entry === 'string'))
      problems.push(`${key}: the source ${typeof from === 'string' ? 'has one word' : 'changes with a count'}`);
    const want = placeholdersOf(from).join(', ');
    const got = placeholdersOf(entry).join(', ');
    if (want !== got) problems.push(`${key}: has the placeholders [${got}], the source [${want}]`);
  }
  return problems;
}

/** `entry` said with `values`, in `language`: its plural form for the count, and each placeholder filled. */
export function sayWords(entry: Words, values: WordValues = {}, language = SOURCE_LANGUAGE): string {
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    const category = new Intl.PluralRules(language).select(values.count ?? 0);
    text = entry[category] ?? entry.other;
  }
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? formatCount(value) : value;
  });
}

const translations = new Map<string, Catalogue>();
let language = SOURCE_LANGUAGE;
let words: Catalogue = SOURCE_WORDS;

/**
 * Adds the translation for language `tag`, so `setLanguage` can choose it. When it does not hold to the source, it
 * throws, saying every problem, and then adds nothing.
 */
export function addTranslation(tag: string, translation: Catalogue): void {
  const problems = translationProblems(SOURCE_WORDS, translation, tag);
  if (problems.length) throw new Error(`The translation ${tag} was not added:\n${problems.join('\n')}`);
  translations.set(canonical(tag) as string, { ...translation });
}

// each translation file that holds to the source; CI fails on one that does not (test/words-files.test.js)
for (const [tag, file] of Object.entries(TRANSLATION_FILES))
  if (file && typeof file === 'object' && !translationProblems(SOURCE_WORDS, file as Catalogue, tag).length)
    translations.set(canonical(tag) as string, file as Catalogue);

/** The language tag of each translation file, sorted: the languages the settings offer besides UK English. */
export const translatedLanguages = (): string[] => Object.keys(TRANSLATION_FILES).sort();

/**
 * Sets the language the words are said in: its translation, else that of its base language (`fr` for `fr-CA`), else UK
 * English. The language used. A test language (pseudo-words.ts) is made from the source words when first set.
 */
export function setLanguage(tag: string): string {
  const exact = canonical(tag);
  if (exact && Object.hasOwn(PSEUDO_LANGUAGES, exact) && !translations.has(exact))
    translations.set(exact, pseudoWords(SOURCE_WORDS, exact as keyof typeof PSEUDO_LANGUAGES));
  const base = exact?.split('-')[0];
  const found = [exact, base].find((t): t is string => !!t && translations.has(t));
  language = found ?? SOURCE_LANGUAGE;
  words = found ? (translations.get(found) as Catalogue) : SOURCE_WORDS;
  return language;
}

/** The language the words are said in now. */
export const currentLanguage = (): string => language;

/** The word kept as `key`, in the current language, with `values` filled in; in UK English when the translation lacks it. */
export const word = (key: WordKey, values?: WordValues): string =>
  sayWords(words[key] ?? SOURCE_WORDS[key], values, words[key] === undefined ? SOURCE_LANGUAGE : language);

/**
 * The word kept as `key` in UK English, whatever the language and locale, its numbers in plain digits. It is for what
 * is written into a note, a file or a change set. Those bytes never change with the reader (locale_never_changes_bytes).
 */
export function sourceWord(key: WordKey, values: WordValues = {}): string {
  const entry: Words = SOURCE_WORDS[key];
  const form =
    typeof entry === 'string'
      ? entry
      : (entry[new Intl.PluralRules(SOURCE_LANGUAGE).select(values.count ?? 0)] ?? entry.other);
  return sayWords(form, Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
}

/** The languages written right to left, for a runtime that cannot say a language's direction itself. */
const RIGHT_TO_LEFT = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ks',
  'ku-Arab',
  'pa-Arab',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

/**
 * The direction language `tag` is read in (editor spec §42, rtl_mirrors). It uses the runtime's own text information
 * where it has it, else the language and its script. A tag that is no language is read left to right.
 */
export function directionOf(tag: string): 'ltr' | 'rtl' {
  const exact = canonical(tag);
  if (!exact) return 'ltr';
  const locale = new Intl.Locale(exact) as Intl.Locale & {
    getTextInfo?: () => { direction?: string };
    textInfo?: { direction?: string };
  };
  const said = locale.getTextInfo?.().direction ?? locale.textInfo?.direction;
  if (said === 'rtl' || said === 'ltr') return said;
  const script = locale.maximize().script;
  if (script && ['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg'].includes(script)) return 'rtl';
  return RIGHT_TO_LEFT.has(locale.language) || RIGHT_TO_LEFT.has(`${locale.language}-${script}`) ? 'rtl' : 'ltr';
}

let direction: 'ltr' | 'rtl' = 'ltr';

/** Sets the direction the interface is read in, as the host says it or as its language is read. */
export function setDirection(to: 'ltr' | 'rtl'): void {
  direction = to;
}

/** The direction the interface is read in now: the `dir` each of its views is drawn with. */
export const currentDirection = (): 'ltr' | 'rtl' => direction;
