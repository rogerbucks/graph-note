// The secrets scan of the quality metrics (spec §12, quality_ratchet): looks through every file git would commit for what
// looks like a secret. Like the content check beside it (check-classification.mjs) the patterns are general, kinds of
// secret and never anyone's own. What matched is never printed: only the file, the line and the kind.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 2 * 1024 * 1024;

// A value that is plainly not one: a stand-in, or the dotted name of a module or a field.
const PLACEHOLDER =
  /^(x+|\*+|\.+|example|changeme|change-me|dummy|test|secret|password|redacted|your[-_ ].*|<.*>|\$\{.*\}|\{\{.*\}\}|[a-z_]+(\.[a-z_]+)+)$/i;

const RULES = [
  { rule: 'private-key', test: (line) => /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/.test(line) },
  {
    rule: 'github-token',
    test: (line) => /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/.test(line),
  },
  { rule: 'aws-key', test: (line) => /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(line) },
  {
    rule: 'api-key',
    test: (line) => /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/.test(line) || /\bAIza[0-9A-Za-z_-]{35}\b/.test(line),
  },
  { rule: 'slack-token', test: (line) => /\bxox[abeprs]-[A-Za-z0-9-]{10,}/.test(line) },
  {
    rule: 'password-literal',
    // a name that means a secret, given a quoted value of eight characters or more that is no stand-in
    test: (line) =>
      [
        ...line.matchAll(
          /\b(?:pass(?:word|wd)?|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
        ),
      ].some((m) => !PLACEHOLDER.test(m[1])),
  },
];

/** The secrets in a text: each by rule and line number (from 1). Never the text that matched. */
export function findSecrets(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const { rule, test } of RULES) if (test(line)) found.push({ rule, line: i + 1 });
  });
  return found;
}

/** The files to scan: every one git would commit (tracked, or new and not ignored) that is there and not too large. */
export function scannedFiles(root = ROOT) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return [...new Set(listed.split('\0').filter(Boolean))].filter((f) => {
    const full = join(root, f);
    return existsSync(full) && statSync(full).isFile() && statSync(full).size <= MAX_BYTES;
  });
}

/** Every secret in the repository's files, as `{ file, line, rule }`. A binary file is passed over. */
export function scanRepo(root = ROOT) {
  return scannedFiles(root).flatMap((file) => {
    const bytes = readFileSync(join(root, file));
    if (bytes.includes(0)) return [];
    return findSecrets(bytes.toString('utf8')).map((f) => ({ file, ...f }));
  });
}
