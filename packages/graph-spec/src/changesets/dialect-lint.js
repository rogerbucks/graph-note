// §24 H1 the dialect linter: the traps in GQL written by a model, found as graph_spec.lint finds them.
'use strict';

const { byKey } = require('../values/order.js');
const { checkSyntax } = require('../reader/syntax.js');

// ── §24 H1 the dialect linter, and change sets ──────────────────────────────────────────────────
const blank = (text) =>
  text
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:[^'\\]|\\.)*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'");
// Each [ that opens a list rather than a relationship or an index — not straight after a word, -, ], >, ) or ' — with the
// whitespace before it, as graph_spec.lint finds them; written without a regex lookbehind, which iOS before 16.4 cannot run.
function listStarts(src) {
  const out = [],
    after = new Set(['-', ']', '>', ')', "'"]),
    word = (c) => /\w/.test(c),
    space = (c) => /\s/.test(c);
  let from = 0;
  for (let i = src.indexOf('[', from); i !== -1; i = src.indexOf('[', from)) {
    let p = i;
    while (p > from && space(src[p - 1])) p--;
    const ok = (q) => q === 0 || !(word(src[q - 1]) || after.has(src[q - 1]));
    const start = ok(p) ? p : p < i ? p + 1 : -1;
    if (start !== -1) {
      out.push({ index: start, 0: src.slice(start, i + 1) });
      from = i + 1;
    } else from = i + 1;
  }
  return out;
}
function closeAt(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    depth += src[j] === '(' ? 1 : src[j] === ')' ? -1 : 0;
    if (depth === 0) return j;
  }
  return src.length - 1;
}
function lint(text) {
  const src = blank(text),
    out = [],
    add = (trap, pos) => out.push({ trap, line: src.slice(0, pos).split('\n').length });
  for (const m of src.matchAll(/[:.({,]\s*([A-Za-z_]\w*)\b/g)) {
    // a word after : . ( { or , — the punctuation is matched, not looked behind at, for iOS before 16.4
    const w = m[1],
      end = m.index + m[0].length;
    if (['for', 'groups', 'group'].includes(w.toLowerCase()) && !/^\s*BY\b/i.test(src.slice(end)))
      add('reserved word', m.index + m[0].indexOf(w));
  }
  for (const m of src.matchAll(/\(\s*(on)\s*[:)]/g)) add('reserved word', m.index);
  for (const m of src.matchAll(/\bZONED\s+DATETIME\b/gi)) add('zoned datetime', m.index);
  for (const m of src.matchAll(/\b(sum|count|avg|min|max|collect)\s*\(/gi)) {
    const end = closeAt(src, m.index + m[0].length - 1),
      after = src.slice(end + 1, end + 60),
      before = src.slice(Math.max(0, m.index - 60), m.index);
    const right = /^\s*(<>|<=|>=|[<>=+\-*/%])\s*([\w.]+)/.exec(after),
      left = /([\w.]+)\s*(<>|<=|>=|[<>=+\-*/%])\s*$/.exec(before);
    if ((right && right[2].includes('.')) || (left && left[1].includes('.')))
      add('aggregate mixed with a value', m.index);
  }
  for (const m of src.matchAll(
    /\bMATCH\b([\s\S]*?)(?=\b(?:WHERE|RETURN|WITH|INSERT|SET|MATCH|OPTIONAL|ORDER|DELETE|CALL|LIMIT)\b|$)/gi,
  )) {
    for (const chain of m[1].split(/,(?![^()[\]{}]*[)\]}])/)) {
      const names = [...chain.matchAll(/\(\s*([A-Za-z_]\w*)/g)].map((x) => x[1]);
      if (names.length !== new Set(names).size) add('pattern returns to a bound variable', m.index + 5);
    }
  }
  for (const m of src.matchAll(/\bSET\b/gi))
    if (/\bINSERT\b/i.test(src.slice(m.index + m[0].length))) add('SET before INSERT', m.index);
  for (const m of listStarts(src)) {
    const end = src.indexOf(']', m.index + m[0].length),
      body = src.slice(m.index + m[0].length, end).replace(/\{[^{}]*\}/g, '');
    if (/[A-Za-z_]\w*\.(?!id\b)[A-Za-z_]/.test(body) && !body.trimStart().startsWith(':'))
      add('list literal with values that may be null', m.index);
  }
  for (const m of src.matchAll(/[Xx]'/g)) if (!m.index || !/\w/.test(src[m.index - 1])) add('byte literal', m.index); // not straight after a word
  if (/^\s*\/\/\s*graph:/.test(text)) {
    const e = checkSyntax(text);
    if (e) out.push({ trap: 'outside the document profile', line: e.line });
  }
  return out.sort(byKey((f) => f.line));
}

module.exports = { lint };
