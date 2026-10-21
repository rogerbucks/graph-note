// The secrets a reader refuses to serve, each found by its shape (editor spec §51, spec_secrets_and_fences). The editor
// finds credentials with the same shapes (packages/core/src/ai-ceiling.ts), and so does the Python library
// (graphspec/reader/secrets.py). test/secret-cases.json holds them all to the same answers.
'use strict';

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

// A secret's name, ending the name a value is given under. In snake_case (user_password, db_secret) it is bounded by
// what is not a letter or digit. It is never bounded by \b, for which an underscore is part of the word. In camelCase
// (smtpPassword, apiKey) it starts with a capital after a lower-case letter or digit. A bare `key` is an ordinary word
// (key: 'primary'), so only a name ending in _key or Key is a secret's. A real key under a bare name is still found by
// its value's shape.
const SECRET_NAMES = [
  // the character before is matched, not looked behind at: a lookbehind is a syntax error on iOS before 16.4
  /(?:^|[^A-Za-z0-9])(?:pass(?:word|wd|phrase|code)?|pwd|pin|secret|token|credentials?)(?![A-Za-z0-9])/i,
  /_key(?![A-Za-z0-9])/i,
  /[a-z0-9](?:Pass(?:word|wd|phrase|code)?|Pwd|Pin|Secret|Token|Key|Credentials?)(?![A-Za-z0-9])/,
];
// then a text of four characters or more, given to it with a colon or an equals sign
const SECRET_VALUE = String.raw`["']?\s*[:=]\s*["'][^"'\s]{4,}`;

// The kinds of secret looked for, each by its shape: general patterns, never anyone's own.
const SHAPES = [
  { what: 'a private key', test: (l) => /-----BEGIN [A-Z ]*PRIVATE KEY/.test(l) },
  { what: 'an access key', test: (l) => /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(l) },
  {
    what: 'an API key',
    test: (l) =>
      /\bsk-[A-Za-z0-9_-]{16,}/.test(l) ||
      /\bAIza[0-9A-Za-z_-]{30,}/.test(l) ||
      /\bgh[pousr]_[A-Za-z0-9]{30,}/.test(l) ||
      /\bgithub_pat_\w{20,}/.test(l) ||
      /\bxox[abeprs]-[A-Za-z0-9-]{10,}/.test(l),
  },
  { what: 'a token', test: (l) => /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/.test(l) },
  {
    what: 'a password or secret',
    test: (l) => SECRET_NAMES.some((name) => new RegExp(`${name.source}${SECRET_VALUE}`, name.flags).test(l)),
  },
  {
    what: 'a card number',
    test: (l) =>
      [...l.matchAll(/(?:^|[^\w.-])([2-6](?:[ -]?\d){12,18})(?![\w.-])/g)].some(([, m]) =>
        luhn((m || '').replace(/[ -]/g, '')),
      ),
  },
];

// The kinds of secret a text holds, each once and in words, never the text that matched.
function secretsIn(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) for (const s of SHAPES) if (s.test(line)) found.add(s.what);
  return [...found];
}
// [id, kind] for each secret any text value of a graph holds: its text, notes and attachments alike.
function secretsInGraph(g) {
  const out = [];
  for (const [id, [, props]] of [...g.nodes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    for (const v of Object.values(props))
      if (typeof v === 'string') for (const what of secretsIn(v)) out.push([id, what]);
  return out;
}

module.exports = { secretsIn, secretsInGraph };
