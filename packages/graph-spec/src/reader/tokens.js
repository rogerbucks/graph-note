// A block's header line and its tokens, as the document profile (§3) reads them.
'use strict';

const { ProfileError } = require('./profile-error.js');
const { S, N, trim } = require('./whitespace.js');

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
  if (!m) throw new ProfileError(1, 'the block names no graph', "start it with '// graph: <name>' (§3)");
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
  let begins = 0; // where the line begins in the block
  block.split('\n').forEach((raw, i) => {
    const n = i + 1;
    const lineBegins = begins;
    begins += raw.length + 1;
    if (trim(raw).startsWith('//')) return;
    let pos = 0;
    while (pos < raw.length) {
      if (!trim(raw.slice(pos))) break;
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(raw);
      if (!m && trim(raw.slice(pos)).startsWith('//')) throw new ProfileError(n, COMMENT_RULE, COMMENT_FIX); // a comment after code on its line (§3)
      if (!m)
        throw new ProfileError(
          n,
          `cannot read '${excerpt(trim(raw.slice(pos)))}'`,
          'a data block holds only nodes, relationships and simple values',
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
const unquote = (s) => s.slice(1, -1).replace(/\\([^\n])/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
function utcNaive(s, line) {
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,6}))?)?(Z|[+-]\d\d:?\d\d)?$/.exec(s);
  if (!m) throw new ProfileError(line, `'${s}' is not an instant`, "write DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM'");
  if (!m[8]) throw new ProfileError(line, `'${s}' has no offset`, 'an instant carries its offset (§9, principle 11)');
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

module.exports = { header, COMMENT_RULE, COMMENT_FIX, tokens, unquote, utcNaive };
