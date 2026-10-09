// Names and texts suggested for things (editor spec §4): a name from a text, following the pattern of the names already in
// the graph and never one of them; a text from a name. They only suggest — nothing here writes to a note.

/** How the names of a graph are written: their casing, how many words they usually have, and whether a kind starts them. */
export interface NameStyle {
  /** snake_case, camelCase or PascalCase — the one most names show; snake_case when none does. */
  casing: 'snake' | 'camel' | 'pascal';
  /** Words in a typical name, not counting a prefix made from the kind (3 when no name shows a style). */
  words: number;
  /** A name starts with its kind in full (`option_…`), with the kind's first letter (`o_…`), or with neither. */
  prefix: 'none' | 'kind' | 'initial';
}

/** The names of a graph: just the names, or each with its kind, which lets a prefix made from the kind be followed. */
export type GraphNames = Iterable<string> | ReadonlyMap<string, string>;

const DEFAULT_WORDS = 3,
  LONGEST = 32,
  RESERVED = new Set(
    // the words the graph reader keeps, then others of GQL that a later engine might: none is ever suggested as a name
    'insert match set date datetime true false null where return graph id create delete detach merge remove optional as from order by limit offset skip filter let for yield call select and or not xor in is exists node edge union case when then else end use asc desc distinct group having unknown'.split(
      ' ',
    ),
  ),
  SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'be', 'or', 'and', 'for', 'in', 'on', 'at', 'by', 'with', 'is']);

const CASINGS: [NameStyle['casing'], RegExp][] = [
  ['snake', /^[a-z0-9]+(_[a-z0-9]+)+$/],
  ['camel', /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/],
  ['pascal', /^([A-Z][a-z0-9]+){2,}$/],
];

const entriesOf = (names: GraphNames): [string, string | undefined][] =>
  names instanceof Map
    ? [...(names as ReadonlyMap<string, string>)]
    : [...(names as Iterable<string>)].map((n): [string, string | undefined] => [n, undefined]);

/** The words of a name written in any casing, lowercased, without a trailing uniqueness number. */
function wordsOfName(name: string): string[] {
  return name
    .replace(/_\d+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** Whether a name starts with its kind (in full, or its first letter), then a separator or a capital. */
function startsWithKind(name: string, kind: string): 'kind' | 'initial' | null {
  const k = kind.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return null;
  const boundary = (at: number) => name[at] === '_' || /[A-Z]/.test(name[at] ?? '');
  if (name.length > k.length && name.slice(0, k.length).toLowerCase() === k && boundary(k.length)) return 'kind';
  if (name.length > 1 && name[0]?.toLowerCase() === k[0] && boundary(1)) return 'initial';
  return null;
}

/**
 * The style the names of a graph are written in: the casing most of them show (a name of one word shows none, so does
 * not vote), the words they usually have, and a prefix from the kind where most names with a kind show one.
 */
export function nameStyleOf(names: GraphNames): NameStyle {
  const tally = emptyTally();
  for (const [name, kind] of entriesOf(names)) tallyName(tally, name, kind, 1);
  return styleOfTally(tally);
}

/** Of the names in one casing: how many, their words in all, and how many of those with a kind start with it, or its initial. */
interface CasingTally {
  names: number;
  words: number;
  kind: number;
  initial: number;
}

/**
 * What a style is found from, counted name by name, so it can be kept as names are added (name-book.ts) rather than
 * counted again for each: the names in each casing, and those with a kind, and of them those that start with it.
 */
export interface NameTally {
  casings: Record<NameStyle['casing'], CasingTally>;
  kinded: number;
  kind: number;
  initial: number;
}

/** A tally of no names. */
export function emptyTally(): NameTally {
  const none = (): CasingTally => ({ names: 0, words: 0, kind: 0, initial: 0 });
  return { casings: { snake: none(), camel: none(), pascal: none() }, kinded: 0, kind: 0, initial: 0 };
}

/** Counts a name, with its kind, into a tally (`sign` 1), or takes it out (-1). */
export function tallyName(tally: NameTally, name: string, kind: string | undefined, sign: 1 | -1): void {
  const found = kind ? startsWithKind(name, kind) : null;
  if (kind) tally.kinded += sign;
  if (found) tally[found] += sign;
  // a name of one word shows no casing, so does not vote
  const casing = CASINGS.find(([, re]) => re.test(name.replace(/_?\d+$/, '')))?.[0];
  if (!casing) return;
  const c = tally.casings[casing];
  c.names += sign;
  c.words += sign * wordsOfName(name).length;
  if (found) c[found] += sign;
}

/**
 * The style a tally shows: the casing most names show (a name of one word shows none, so does not vote), the words they
 * usually have, and a prefix from the kind where most names with a kind show one.
 */
export function styleOfTally(tally: NameTally): NameStyle {
  const casing = CASINGS.map(([c]) => c).reduce((best, c) =>
    tally.casings[c].names > tally.casings[best].names ? c : best,
  );
  const { kinded, kind, initial } = tally;
  const prefix =
    kinded >= 2 && kind >= 2 && kind >= kinded * 0.6
      ? 'kind'
      : kinded >= 2 && initial >= 2 && initial >= kinded * 0.6
        ? 'initial'
        : 'none';
  // the words of each name in that casing, less one for a prefix from its kind when names have one
  const c = tally.casings[casing];
  const own = prefix === 'kind' ? c.kind : prefix === 'initial' ? c.initial : 0;
  const words = c.names ? Math.min(4, Math.max(1, Math.ceil((c.words - own) / c.names - 0.5))) : DEFAULT_WORDS;
  return { casing, words, prefix };
}

/**
 * The words of a text, lowercased and plain ASCII: accents taken off their letters, apostrophes and hyphens closed up,
 * other marks parting words. The graph reader takes only A–Z, a–z, digits and _ in a name (reader/tokens.js, and
 * lexer.py in the Python library), so a word in another script is left out, whole; small words are kept.
 */
export function nameWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .flatMap((chunk) => chunk.replace(/['’-]/g, '').split(/[^a-z0-9]+/))
    .filter(Boolean);
}

/** A kind as one lowercase ASCII word, or '' when it has none. */
const kindWord = (kind?: string) => (kind ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * A text as a name made of its words joined by _ (snake_case), cut at a word to 32 characters: the step a name takes
 * before the graph's style and the names taken are applied. A text with no ASCII letter or digit left — such as one in
 * another script — gives the kind, else `thing`; a first word that is a number gets `item` before it. Always a name the
 * graph can read.
 */
export function nameSlug(text: string, kind?: string): string {
  let words = nameWords(text);
  if (!words.length) words = [kindWord(kind) || 'thing'];
  if (/^\d/.test(words[0] ?? '')) words = ['item', ...words];
  while (words.length > 1 && words.join('_').length > LONGEST) words.pop();
  return words.join('_').slice(0, LONGEST);
}

const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Words written as one name in a casing. */
function joined(words: string[], casing: NameStyle['casing']): string {
  if (casing === 'snake') return words.join('_');
  return words.map((w, i) => (i === 0 && casing === 'camel' ? w : capital(w))).join('');
}

/**
 * A name for a thing given text but no name, from the first few words of the text, following the style of the names
 * already in the graph (its casing, its length, a prefix from the kind when `kind` is given and the names have one), and
 * never a name the graph already has — compared without regard to case; a number is added, in the same style, until it is
 * not. Never a word the language keeps for itself (match, set, true, id …), which is numbered in the same way. Always a
 * name the graph can read. With `given`, that style is followed in place of the one `names` show (the names still keep a
 * new name unique): for naming several things in one style, whatever is named among them.
 */
export function nameFromText(text: string, names: GraphNames, kind?: string, given?: NameStyle): string {
  const style = given ?? nameStyleOf(names),
    taken = new Set(entriesOf(names).map(([n]) => n.toLowerCase()));
  return composeName(text, style, kind, (lower) => taken.has(lower)).name;
}

/**
 * The name nameFromText gives, in a style already found, against names taken as `taken` says (lowercased): the name, the
 * base it was made from, and its place among the base's numbered names (1 for the base itself). `from` is the first place
 * worth trying, when every place before it is known to be taken (name-book.ts keeps it, so as not to count up again).
 */
export function composeName(
  text: string,
  style: NameStyle,
  kind: string | undefined,
  taken: (lower: string) => boolean,
  from: (base: string) => number = () => 1,
): { name: string; base: string; place: number } {
  let words = nameWords(text);
  const significant = words.filter((w) => !SMALL_WORDS.has(w));
  if (significant.length) words = significant;
  const k = kindWord(kind);
  if (!words.length) words = [k || 'thing'];
  const lead = style.prefix === 'kind' && k ? k : style.prefix === 'initial' && k ? k.charAt(0) : '';
  if (!lead && /^\d/.test(words[0] ?? '')) words = ['item', ...words];
  words = words.slice(0, style.words);
  const compose = (ws: string[]) => joined(lead ? [lead, ...ws] : ws, style.casing);
  while (words.length > 1 && compose(words).length > LONGEST) words.pop();
  const base = compose(words).slice(0, LONGEST);
  const numbered = (n: number) => (n === 1 ? base : style.casing === 'snake' ? `${base}_${n}` : `${base}${n}`);
  let place = from(base),
    name = numbered(place);
  while (taken(name.toLowerCase()) || RESERVED.has(name.toLowerCase())) name = numbered(++place);
  return { name, base, place };
}

/**
 * A text for a thing given a name but no text: the words of the name, in sentence case. A name in capitals is read as
 * words; otherwise a word in capitals, such as ISBN, stays so. Nothing for a name with no words.
 */
export function textFromName(name: string): string {
  const shouting = !/[a-z]/.test(name);
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => (!shouting && w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w : w.toLowerCase()));
  return capital(words.join(' '));
}
