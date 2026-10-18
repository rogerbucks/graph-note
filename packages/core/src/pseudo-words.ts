// The test languages (editor spec §42, pseudo_locales_checked). They are two made-up translations of the source words.
// So every view can be tried in them before any real translation exists. `en-XA` is each word accented, bracketed and
// 40 per cent longer. It shows a word the code says itself (it stays plain), and a box too small for a longer language.
// `ar-XB` is the same read right to left, which shows a part that does not mirror. Each keeps the source's placeholders
// and plural forms, so it passes the check every translation passes. Their regions are ones ISO 3166 leaves for users
// (XA, XB), so no real language is taken.
import type { Catalogue, Words } from './words.ts';

/** The test languages, each with the direction it is read in. */
export const PSEUDO_LANGUAGES = { 'en-XA': 'ltr', 'ar-XB': 'rtl' } as const;

const PLAIN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ACCENTED = Array.from('ȧƀƈḓḗƒɠħīĵķŀḿƞǿƥɋřşŧŭṽẇẋẏẑȦƁƇḒḖƑƓĦĪĴĶĿḾȠǾƤɊŘŞŦŬṼẆẊẎẐ');
const PLACEHOLDER = /(\{[a-z][a-zA-Z0-9]*\})/;
const OPEN = '⟦';
const CLOSE = '⟧';
/** The mark that keeps a right-to-left word's brackets on its own sides, as a right-to-left language's letters would. */
const RLM = '‏';

/** `text` in the test language read in `direction`: accented, bracketed and 40 per cent longer, its placeholders kept. */
function pseudo(text: string, direction: 'ltr' | 'rtl'): string {
  const parts = text.split(PLACEHOLDER);
  const letters = parts.filter((_, i) => i % 2 === 0).join('').length;
  const said = parts
    .map((p, i) => (i % 2 ? p : Array.from(p, (c) => ACCENTED[PLAIN.indexOf(c)] ?? c).join('')))
    .join('');
  const word = `${OPEN}${said} ${'·'.repeat(Math.ceil(letters * 0.4))}${CLOSE}`;
  return direction === 'rtl' ? `${RLM}${word}${RLM}` : word;
}

/** The catalogue `source` said in test language `tag`: every word, and every plural form of one, made over. */
export function pseudoWords(source: Catalogue, tag: keyof typeof PSEUDO_LANGUAGES): Catalogue {
  const direction = PSEUDO_LANGUAGES[tag];
  const made = (entry: Words): Words =>
    typeof entry === 'string'
      ? pseudo(entry, direction)
      : (Object.fromEntries(Object.entries(entry).map(([c, t]) => [c, pseudo(t, direction)])) as Words);
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, made(entry)]));
}

/** Whether `text` holds a word of a test language: one the catalogue said, not the code. */
export const isPseudoWord = (text: string): boolean => text.includes(OPEN) && text.includes(CLOSE);
