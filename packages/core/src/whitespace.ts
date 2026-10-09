// Whitespace as GQL names it (§3), the one set every reader uses, never the language's own idea of it: JavaScript's \s
// and trim() take in U+FEFF, and leave out U+001C–U+001F and U+180E. A line ends at LF only. The same code points are
// in packages/graph-spec/src/reader/whitespace.js and the Python library's reader (decided 10 Oct 2026).

const CODES = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0xa0, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];
/** Every whitespace character, for a class that also holds others: `[^,}${SPACE}]`. */
export const SPACE = String.fromCodePoint(...CODES);
/** One whitespace character, and one that is not, for building a pattern: `${S}*`, `(${N}+)`. */
export const S = `[${SPACE}]`,
  N = `[^${SPACE}]`;

/** Whether one character is whitespace. */
export const isSpace = (c: string): boolean => c !== '' && SPACE.includes(c);

/** The text without the whitespace it starts with. */
export function trimStart(s: string): string {
  let i = 0;
  while (i < s.length && SPACE.includes(s[i] ?? '')) i++;
  return s.slice(i);
}

/** The text without the whitespace it ends with. */
export function trimEnd(s: string): string {
  let i = s.length;
  while (i > 0 && SPACE.includes(s[i - 1] ?? '')) i--;
  return s.slice(0, i);
}

/** The text without the whitespace it starts and ends with. */
export const trim = (s: string): string => trimEnd(trimStart(s));
