// A block's header line and its tokens, as the document profile (§3) reads them.
'use strict';

const { ProfileError } = require('./profile-error.js');
const { S, N, isSpace, trim } = require('./whitespace.js');

const KEYWORDS = new Set(['INSERT', 'MATCH', 'SET', 'DATE', 'DATETIME', 'TRUE', 'FALSE']);
// [^\n] where Python's reader has `.`: JavaScript's `.` also stops at CR, U+2028 and U+2029
const TOKEN = new RegExp(
  `${S}*(?:('(?:[^'\\\\]|\\\\[^\\n])*')|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(->)|([()[\\]{}:,.=-]))`,
  'y',
);
const EXCERPT = new RegExp(`^${S}*//${S}*excerpt\\b`, 'i'),
  GRAPH = new RegExp(`^${S}*//${S}*graph:${S}*(${N}+)([^\\n]*)$`),
  SCHEMA = new RegExp(`·${S}*SCHEMA${S}+${N}+`),
  EXCERPT_OF = new RegExp(`·${S}*excerpt\\b`, 'i'),
  QUERY = new RegExp(`·${S}*QUERY\\b`),
  CHANGE_SET = new RegExp(`·${S}*CHANGE SET\\b`);
function header(block) {
  const first = block.split('\n').find((line) => trim(line)) || '';
  if (EXCERPT.test(first)) return [null, 'excerpt']; // an illustration, said to be one (§3)
  const m = GRAPH.exec(first);
  if (!m)
    throw new ProfileError(1, 'the block names no graph', "start it with '// graph: <name>' (§3)", undefined, 'GN101');
  const kind = SCHEMA.test(m[2])
    ? 'schema'
    : EXCERPT_OF.test(m[2])
      ? 'excerpt'
      : QUERY.test(m[2])
        ? 'query'
        : CHANGE_SET.test(m[2])
          ? 'changeset'
          : 'data';
  if (kind !== 'excerpt' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1]))
    // a GQL engine names a graph by an identifier — 'reader-choice' cannot be loaded
    throw new ProfileError(
      1,
      `the graph name '${m[1]}' is not one word`,
      'use letters, digits and underscores only — reader_choice, not reader-choice (§3)',
      undefined,
      'GN102',
    );
  return [m[1], kind];
}
// §3: comments are whole lines; one after code on its line cannot be told from // inside an identifier
const COMMENT_RULE =
  'a comment must be on a line of its own: // also occurs inside identifiers, such as ni:/// hashes (§3)';
const COMMENT_FIX = 'put the comment on its own line';
// the start of a text, cut at n UTF-16 units and never inside an emoji, as Python's reader cuts it too
function excerpt(s, n = 20) {
  return s.slice(0, s.length > n && /[\uD800-\uDBFF]/.test(s[n - 1]) ? n - 1 : n);
}
// [kind, text, line, raw, end] for every token, whole-line comments removed: raw is the token as written, end is where
// it ends in the block
function tokens(block) {
  const out = [];
  // offsets count UTF-16 units, as JavaScript strings index; the Python reader counts code points. Each is used only on
  // the text it was counted in (Store.corrected), so both write the same corrected text
  let begins = 0; // where the line begins in the block
  block.split('\n').forEach((raw, i) => {
    const n = i + 1;
    const lineBegins = begins;
    begins += raw.length + 1;
    if (trim(raw).startsWith('//')) return;
    let pos = 0;
    while (pos < raw.length) {
      // whether only whitespace is left, told without cutting the rest of the line out and trimming it before every
      // token: that cost a 137 kB line 20% of its reading time (10 Oct 2026)
      let at = pos;
      while (at < raw.length && isSpace(raw[at])) at++;
      if (at === raw.length) break;
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(raw);
      if (!m && trim(raw.slice(pos)).startsWith('//'))
        throw new ProfileError(n, COMMENT_RULE, COMMENT_FIX, undefined, 'GN103'); // a comment after code on its line (§3)
      if (!m)
        throw new ProfileError(
          n,
          `cannot read '${excerpt(trim(raw.slice(pos)))}'`,
          'a data block holds only nodes, relationships and simple values',
          undefined,
          'GN104',
        );
      let kind =
        m[1] !== undefined
          ? 'str'
          : m[2] !== undefined
            ? 'num'
            : m[3] !== undefined
              ? 'id'
              : m[4] !== undefined
                ? 'arrow'
                : 'p';
      const rawText = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
      const bad = kind === 'str' ? badEscape(rawText.slice(1, -1)) : null;
      if (bad)
        // req:3.gql-escapes: refused at its backslash, whose fix doubles it
        throw new ProfileError(
          n,
          `'${bad[1]}' is not an escape GQL names`,
          `double the backslash to write a backslash: \\${bad[1]}`,
          TOKEN.lastIndex - rawText.length + 1 + bad[0],
          'GN105',
        );
      let text = rawText;
      if (kind === 'id' && KEYWORDS.has(text.toUpperCase())) {
        kind = 'kw';
        text = text.toUpperCase();
      }
      out.push([kind, text, n, rawText, lineBegins + TOKEN.lastIndex]);
      pos = TOKEN.lastIndex;
    }
  });
  return out;
}
// req:3.gql-escapes: the escapes ISO GQL names — each character after a backslash, and \uXXXX and \UXXXXXX for a
// character by its code point
const ESCAPES = { '\\': '\\', "'": "'", '"': '"', '`': '`', t: '\t', b: '\b', n: '\n', r: '\r', f: '\f' };
const HEX = { u: 4, U: 6 };
/** The character a \u or \U escape at s[i] names, or null when it names none. */
function codePoint(s, i) {
  const n = HEX[s[i + 1]],
    digits = s.slice(i + 2, i + 2 + n);
  if (digits.length !== n || !/^[0-9A-Fa-f]+$/.test(digits)) return null;
  const cp = parseInt(digits, 16);
  return cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? null : cp;
}
/**
 * The first escape GQL does not name in a quoted text (quotes off): where its backslash is, and the escape as written —
 * for \u and \U, with the digits that follow. null when every escape is one GQL names.
 */
function badEscape(s) {
  let i = s.indexOf('\\');
  while (i !== -1) {
    const c = s.slice(i + 1, i + 2);
    if (c in HEX) {
      if (codePoint(s, i) === null) return [i, s.slice(i, i + 2 + HEX[c])];
      i = s.indexOf('\\', i + 2 + HEX[c]);
    } else if (Object.hasOwn(ESCAPES, c)) i = s.indexOf('\\', i + 2);
    else return [i, s.slice(i, i + 2)];
  }
  return null;
}
const WRITTEN = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\t': '\\t', '\r': '\\r', '\b': '\\b', '\f': '\\f' };
// a text quoted as the profile writes it: a backslash, a quote and each control character GQL has an escape for written
// as that escape, so the text reads back on one line, as itself
const quote = (s) => "'" + [...s].map((c) => WRITTEN[c] ?? c).join('') + "'";
// a quoted text's text, its escapes read as GQL reads them (tokens has refused any GQL does not name)
const unquote = (s) =>
  s
    .slice(1, -1)
    .replace(/\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{6}|[^])/g, (_, e) =>
      e[0] in HEX && e.length > 1 ? String.fromCodePoint(parseInt(e.slice(1), 16)) : ESCAPES[e],
    );
function utcNaive(s, line) {
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,6}))?)?(Z|[+-]\d\d:?\d\d)?$/.exec(s);
  if (!m)
    throw new ProfileError(
      line,
      `'${s}' is not an instant`,
      "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM'",
      undefined,
      'GN204',
    );
  if (!m[8])
    throw new ProfileError(
      line,
      `'${s}' has no offset`,
      'an instant carries its offset (§9, principle 11)',
      undefined,
      'GN205',
    );
  let off = 0;
  if (m[8] !== 'Z') {
    const sg = m[8][0] === '-' ? -1 : 1,
      d = m[8].slice(1).replace(':', '');
    off = sg * (Number(d.slice(0, 2)) * 60 + Number(d.slice(2)));
  }
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - off * 60000);
  const p = (x) => String(x).padStart(2, '0');
  const micro = m[7] ? m[7].padEnd(6, '0') : '';
  return (
    `${t.getUTCFullYear().toString().padStart(4, '0')}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}` +
    (micro && Number(micro) ? '.' + micro : '')
  );
}

module.exports = { header, COMMENT_RULE, COMMENT_FIX, tokens, quote, unquote, utcNaive };
