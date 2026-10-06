#!/usr/bin/env node
// Refuses files that look confidential or personal, so they never reach the
// repository: a classification other than Public, a note's uuid line, an
// absolute home-folder path, a personal email address, a phone number or a
// card number. The patterns are general: this file holds no list of anyone's
// personal details.
//
// Usage:
//   node scripts/check-classification.mjs                staged files (the pre-commit hook)
//   node scripts/check-classification.mjs --all          every tracked file (CI)
//   node scripts/check-classification.mjs --stdin NAME   text on stdin, reported as NAME
//
// Exits 1 and lists each problem by file, line and rule. The matched text is
// never printed, so a CI log cannot leak it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Addresses that belong to no one: documentation domains and no-reply senders.
const SAFE_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|users\.noreply\.github\.com)$/i;
const SAFE_EMAIL_LOCAL = /^(no-?reply|git)$/i;

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

const RULES = [
  {
    rule: 'classification',
    what: 'a classification other than Public',
    test: (line) => {
      const m = /^\s*classification\s*:\s*["']?([^"'\s#]+)/i.exec(line);
      return Boolean(m) && m[1].toLowerCase() !== 'public';
    },
  },
  {
    rule: 'vault-uuid',
    what: "a note's uuid line",
    test: (line) => new RegExp(`^\\s*uuid\\s*:\\s*["']?${UUID}["']?\\s*$`, 'i').test(line),
  },
  {
    rule: 'home-path',
    what: 'an absolute path in a home folder',
    test: (line) =>
      /(?<![\w.~-])\/(Users|home)\/(?!Shared\/)[\w.-]+/.test(line) ||
      /\b[A-Za-z]:\\Users\\[\w.-]+/.test(line),
  },
  {
    rule: 'email',
    what: 'a personal email address',
    test: (line) =>
      [...line.matchAll(/(?<![\w.+-])([\w.+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g)]
        .some(([, local, domain]) => !SAFE_EMAIL_DOMAIN.test(domain) && !SAFE_EMAIL_LOCAL.test(local)),
  },
  {
    rule: 'phone',
    what: 'a phone number',
    test: (line) =>
      // International: +country code, then groups of digits.
      /(?<![\w+])\+\d{1,3}[ .-]?(\(\d{1,4}\)[ .-]?)?\d{2,6}([ .-]\d{2,6}){1,3}(?![\w.])/.test(line) ||
      // North American: (NNN) NNN-NNNN or NNN-NNN-NNNN.
      /(?<![\w.-])(\(\d{3}\) ?|\d{3}[ .-])\d{3}[ .-]\d{4}(?![\w.-])/.test(line) ||
      // UK national: 0NNNN NNNNNN or 0NN NNNN NNNN.
      /(?<![\w.-])0\d{3,4} ?\d{3} ?\d{3,4}(?![\w.-])/.test(line),
  },
  {
    rule: 'card',
    what: 'a card number',
    test: (line) =>
      [...line.matchAll(/(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w.-])/g)]
        .some(([m]) => luhn(m.replace(/[ -]/g, ''))),
  },
];

/** Every problem in a piece of text, as { rule, what, line }. */
export function findProblems(text) {
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const r of RULES) if (r.test(line)) problems.push({ rule: r.rule, what: r.what, line: i + 1 });
  });
  return problems;
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

function check(files) {
  const found = [];
  for (const { name, content } of files) {
    if (isBinary(content)) continue;
    for (const p of findProblems(content.toString('utf8'))) found.push({ name, ...p });
  }
  return found;
}

const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 30 });
const names = (out) => out.toString('utf8').split('\0').filter(Boolean);

function stagedFiles() {
  return names(git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'))
    .map((name) => ({ name, content: git('show', `:${name}`) }));
}

function trackedFiles() {
  return names(git('ls-files', '-z'))
    .filter((name) => existsSync(name))
    .map((name) => ({ name, content: readFileSync(name) }));
}

function main(argv) {
  let files;
  if (argv[0] === '--all') files = trackedFiles();
  else if (argv[0] === '--stdin') files = [{ name: argv[1] ?? '<stdin>', content: readFileSync(0) }];
  else files = stagedFiles();

  const found = check(files);
  if (!found.length) return 0;
  console.error(`Refused: ${found.length} thing${found.length === 1 ? '' : 's'} that look confidential or personal.`);
  for (const f of found) console.error(`  ${f.name}:${f.line} — ${f.what} (${f.rule})`);
  console.error('Remove it from the file. If it is a false alarm, change the text so it no longer has that shape.');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
