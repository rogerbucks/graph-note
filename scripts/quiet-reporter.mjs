// A quiet reporter for `node --test` (spec §13, quiet_test_run): the cheap way for an AI session to read a test run.
// When every test passes it prints one line, `ok 693 tests`. For each failed test it prints only
//
//   file:line  suite > test name
//     expected: <cut short>        (or, for an error that is not an assertion, `error: Name: first line of the message`)
//     actual:   <cut short>
//     at file:line                 (the first stack frame in the repository's own code)
//
// and a last line, `FAIL 2 of 693 tests`. A suite is never reported for its tests' failures. Whatever the tests write to
// stdout or stderr is dropped, whether they pass or fail: a failure is described by what it threw, not by what it
// logged. The one exception is a test file that cannot run at all (a syntax error, a missing import): it throws nothing
// the reporter can see, so its first error line and location are read from what it wrote to stderr.
//
// Usage:  node --test --test-reporter=./scripts/quiet-reporter.mjs        (npm run test:ai)
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

/** How many characters of an expected value, an actual value or a message are kept. */
export const CUT = 200;

/** The text cut to at most `max` characters, with an ellipsis where it was cut. */
export function shorten(text, max = CUT) {
  const one = String(text).replace(/\s*\n\s*/g, ' ');
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

const show = (value) =>
  inspect(value, { depth: 4, breakLength: Infinity, compact: true, maxArrayLength: 2000 }).replace(/\s*\n\s*/g, ' ');

/** How much of the text before the first difference is kept, so the difference is read in its place. */
const LEAD = 40;

/**
 * Two texts cut to about `max` characters each, around where they first differ, so the difference stays in view. An
 * ellipsis marks each end that was cut. Texts that both fit are given back whole.
 */
export function cutAround(a, b, max = CUT) {
  if (a.length <= max && b.length <= max) return [a, b];
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  const start = Math.max(0, at - LEAD);
  const cut = (text) => `${start ? '…' : ''}${text.slice(start, start + max)}${text.length > start + max ? '…' : ''}`;
  return [cut(a), cut(b)];
}
/**
 * A value as text. A failure the test runner could not copy from the process that ran it, as when an assertion's values
 * hold a function or a DOM node, arrives as an empty object with no prototype, which String cannot make text: it is said
 * in words, so the run goes on to report the rest.
 */
const asText = (value) => {
  try {
    return String(value ?? '');
  } catch {
    return 'a failure whose details the test runner could not pass on (its values could not be copied)';
  }
};
const firstLine = (text) => asText(text).split('\n')[0];

/** The roots a path may be under: the working folder as given, and as the file system really has it. */
function roots(cwd) {
  const real = (() => {
    try {
      return realpathSync(cwd);
    } catch {
      return cwd;
    }
  })();
  return [...new Set([cwd, real])];
}

/** The text with the repository's own folder taken off every path in it, so a message names `src/x.ts`, not its full path. */
const local = (text, cwd) =>
  roots(cwd).reduce((t, root) => t.replaceAll(`file://${root}${sep}`, '').replaceAll(root + sep, ''), String(text));

/** A path relative to the repository, or null when it is outside it, in node_modules, or Node's own. */
export function inRepository(file, cwd = process.cwd()) {
  let path = file.startsWith('file://') ? fileURLToPath(file) : file;
  if (path.startsWith('node:') || path.split(sep).includes('node_modules')) return null;
  for (const root of roots(cwd)) if (path.startsWith(root + sep)) return path.slice(root.length + 1);
  return null;
}

const FRAME = /^\s*at (?:async )?(?:.*? \()?(.+?):(\d+):\d+\)?$/;

/** The first stack frame in the repository's own code, as `file:line`, or null. */
export function firstRepositoryFrame(stack, cwd = process.cwd()) {
  for (const line of String(stack ?? '').split('\n')) {
    const m = FRAME.exec(line);
    const file = m && inRepository(m[1], cwd);
    if (file) return `${file}:${m[2]}`;
  }
  return null;
}

/** What failed, in at most a few short lines. */
export function describeFailure(error, cwd = process.cwd()) {
  const cause = error?.cause && typeof error.cause === 'object' ? error.cause : error;
  const lines = [];
  if (cause?.code === 'ERR_ASSERTION' && cause.operator !== 'fail') {
    if (cause.generatedMessage === false && cause.message)
      lines.push(`  message: ${shorten(local(firstLine(cause.message), cwd))}`);
    const [expected, actual] = cutAround(show(cause.expected), show(cause.actual));
    lines.push(`  expected: ${expected}`, `  actual:   ${actual}`);
  } else {
    const named = cause?.name && cause.name !== 'Error' ? `${cause.name}: ` : 'Error: ';
    lines.push(`  error: ${shorten(local(`${named}${firstLine(cause?.message ?? cause)}`, cwd))}`);
  }
  const frame = firstRepositoryFrame(cause?.stack, cwd);
  if (frame) lines.push(`  at ${frame}`);
  return lines;
}

/** A test file that could not run: its first error line and location, from what it wrote to stderr. */
function describeBrokenFile(stderr, cwd) {
  const lines = stderr.join('').split('\n');
  const error = lines.find((l) => /^[A-Za-z]*(Error|Exception)\b/.test(l));
  const where = lines.map((l) => /^(?:file:\/\/)?(\/.+?):(\d+)$/.exec(l)).find(Boolean);
  const file = where && inRepository(where[1], cwd);
  return [
    `  error: ${shorten(local(error ?? 'the file failed to run', cwd))}`,
    ...(file ? [`  at ${file}:${where[2]}`] : []),
  ];
}

/** The reporter `node --test` calls: it takes the stream of test events and gives back the text to print. */
export default async function* quietReporter(source) {
  const cwd = process.cwd();
  const names = new Map(); // file -> the names of the tests now running, by nesting
  const stderr = new Map(); // file -> what the file wrote to stderr
  let total = 0;
  let failed = 0;
  let skipped = 0;
  let todo = 0;
  for await (const { type, data } of source) {
    if (type === 'test:stderr') {
      stderr.set(data.file, [...(stderr.get(data.file) ?? []), data.message]);
    } else if (type === 'test:start') {
      const running = names.get(data.file) ?? [];
      running[data.nesting] = data.name;
      names.set(data.file, running.slice(0, data.nesting + 1));
    } else if (type === 'test:pass' && data.details?.type !== 'suite') {
      total++;
      if (data.skip !== undefined) skipped++;
      else if (data.todo !== undefined) todo++;
    } else if (type === 'test:fail') {
      const error = data.details?.error;
      // a suite, or a test with subtests, fails because a subtest did: that one is reported, not its parent
      if (error?.failureType === 'subtestsFailed') {
        if (data.details?.type !== 'suite') total++;
        continue;
      }
      total++;
      // a failing test marked todo is expected to fail, and Node does not fail the run for it
      if (data.todo !== undefined) {
        todo++;
        continue;
      }
      failed++;
      const where = `${inRepository(data.file, cwd) ?? data.file}:${data.line}`;
      const broken = data.nesting === 0 && inRepository(data.file, cwd) === data.name;
      const name = broken
        ? 'the file could not run'
        : (names.get(data.file) ?? []).slice(0, data.nesting + 1).join(' > ');
      const detail = broken
        ? describeBrokenFile(stderr.get(data.name) ?? stderr.get(data.file) ?? [], cwd)
        : describeFailure(error, cwd);
      yield `${where}  ${name || data.name}\n${detail.join('\n')}\n`;
    }
  }
  const extras = `${skipped ? `, ${skipped} skipped` : ''}${todo ? `, ${todo} todo` : ''}`;
  yield failed ? `FAIL ${failed} of ${total} tests\n` : `ok ${total} tests${extras}\n`;
}
