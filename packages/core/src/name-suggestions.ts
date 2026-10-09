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
  const entries = entriesOf(names);
  const votes = new Map<string, number>();
  for (const [name] of entries) {
    const casing = CASINGS.find(([, re]) => re.test(name.replace(/_?\d+$/, '')))?.[0];
    if (casing) votes.set(casing, (votes.get(casing) ?? 0) + 1);
  }
  const casing = CASINGS.map(([c]) => c).reduce((best, c) => ((votes.get(c) ?? 0) > (votes.get(best) ?? 0) ? c : best));
  const kinded = entries.filter(([, kind]) => kind);
  const found = kinded.map(([name, kind]) => startsWithKind(name, kind ?? ''));
  const count = (p: 'kind' | 'initial') => found.filter((f) => f === p).length;
  const prefix =
    kinded.length >= 2 && count('kind') >= 2 && count('kind') >= kinded.length * 0.6
      ? 'kind'
      : kinded.length >= 2 && count('initial') >= 2 && count('initial') >= kinded.length * 0.6
        ? 'initial'
        : 'none';
  const counts = entries.flatMap(([name], i) => {
    if (!CASINGS.find(([c, re]) => c === casing && re.test(name.replace(/_?\d+$/, '')))) return [];
    const own = prefix !== 'none' && found[kinded.indexOf(entries[i] as [string, string])] === prefix ? 1 : 0;
    return [wordsOfName(name).length - own];
  });
  const words = counts.length
    ? Math.min(4, Math.max(1, Math.ceil(counts.reduce((a, b) => a + b, 0) / counts.length - 0.5)))
    : DEFAULT_WORDS;
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
 * name the graph can read.
 */
export function nameFromText(text: string, names: GraphNames, kind?: string): string {
  const style = nameStyleOf(names),
    taken = new Set(entriesOf(names).map(([n]) => n.toLowerCase()));
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
  const numbered = (n: number) => (style.casing === 'snake' ? `${base}_${n}` : `${base}${n}`);
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()) || RESERVED.has(name.toLowerCase()); n++) name = numbered(n);
  return name;
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
