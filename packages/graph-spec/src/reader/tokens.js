// A block's header line and its tokens, as the document profile (§3) reads them.
'use strict';

const { ProfileError } = require('./profile-error.js');

const KEYWORDS = new Set(['INSERT', 'MATCH', 'SET', 'DATE', 'DATETIME', 'TRUE', 'FALSE']);
const TOKEN =
  /\s*(?:('(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(->)|([()[\]{}:,.=-]))/y;
function header(block) {
  const first = block.split('\n').find((line) => line.trim()) || '';
  if (/^\s*\/\/\s*excerpt\b/i.test(first)) return [null, 'excerpt']; // an illustration, said to be one (§3)
  const m = /^\s*\/\/\s*graph:\s*(\S+)(.*)$/.exec(first);
  if (!m) throw new ProfileError(1, 'the block names no graph', "start it with '// graph: <name>' (§3)");
  const kind = /·\s*SCHEMA\s+\S+/.test(m[2])
    ? 'schema'
    : /·\s*excerpt\b/i.test(m[2])
      ? 'excerpt'
      : /·\s*QUERY\b/.test(m[2])
        ? 'query'
        : /·\s*CHANGE SET\b/.test(m[2])
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
function tokens(block) {
  const out = [];
  block.split('\n').forEach((raw, i) => {
    const n = i + 1;
    if (raw.trim().startsWith('//')) return;
    let pos = 0;
    while (pos < raw.length) {
      if (!raw.slice(pos).trim()) break;
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(raw);
      if (!m && raw.slice(pos).trim().startsWith('//')) throw new ProfileError(n, COMMENT_RULE, COMMENT_FIX); // a comment after code on its line (§3)
      if (!m)
        throw new ProfileError(
          n,
          `cannot read '${excerpt(raw.slice(pos).trim())}'`,
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
      out.push([kind, text, n, rawText]);
      pos = TOKEN.lastIndex;
    }
  });
  return out;
}
const unquote = (s) => s.slice(1, -1).replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
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
