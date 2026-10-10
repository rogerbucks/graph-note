// Whitespace as GQL names it (graph spec §3), the one set every reader uses, never the language's own idea of it. The
// set's source is openGQL's grammar, https://raw.githubusercontent.com/opengql/grammar/main/GQL.g4, rule WHITESPACE and
// its fragments (the published grammar, not the paywalled text of ISO/IEC 39075): 29 code points, neither U+0085 nor
// U+FEFF. JavaScript's \s and trim() take in U+FEFF, Python's isspace() takes in U+0085, and each leaves out what GQL
// counts. A line ends at LF only. The same code points are in packages/core/src/whitespace.ts and
// python/graph_spec/src/graphspec/reader/whitespace.py, and test/whitespace.test.js holds the three copies to them
// (decided 10 Oct 2026).
'use strict';

const CODES = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0xa0, 0x1680, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];
const SPACE = String.fromCodePoint(...CODES);
/** One whitespace character, and one that is not, for building a pattern: `${S}*`, `(${N}+)`. */
const S = `[${SPACE}]`,
  N = `[^${SPACE}]`;

const isSpace = (c) => c !== '' && SPACE.includes(c);
function trimStart(s) {
  let i = 0;
  while (i < s.length && SPACE.includes(s[i])) i++;
  return s.slice(i);
}
function trimEnd(s) {
  let i = s.length;
  while (i > 0 && SPACE.includes(s[i - 1])) i--;
  return s.slice(0, i);
}
const trim = (s) => trimEnd(trimStart(s));

module.exports = { S, N, isSpace, trim, trimStart, trimEnd };
