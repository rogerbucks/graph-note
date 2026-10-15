// What the history check reads in text, a file's or a commit message's (spec §13, Delivery): the content check's rules
// and the secret scan, each problem as {rule, line}. One allowance, for a commit message alone: GitHub's own bot signs
// off its commits with an address at github.com, which names no one.
import { findProblems } from './check-classification.mjs';
import { findSecrets } from './quality-secrets.mjs';

// The one line allowed: Dependabot's sign-off, with one address, at github.com and nowhere else.
const BOT_SIGN_OFF = /^Signed-off-by: dependabot\[bot\] <[^\s<>@]+@github\.com>$/;

/** The problems in a text, each as {rule, line}: confidential or personal content, or a secret. */
export const problemsIn = (text) =>
  [...findProblems(text), ...findSecrets(text)].map((p) => ({ rule: p.rule, line: p.line }));

/**
 * The problems in a commit message. Dependabot's own sign-off line is not read, since its address names no one; every
 * other line is, with its number unchanged, and so is that address on any other line, of another sign-off, bot or
 * domain.
 */
export const messageProblems = (message) =>
  problemsIn(
    message
      .split('\n')
      .map((line) => (BOT_SIGN_OFF.test(line) ? '' : line))
      .join('\n'),
  );
