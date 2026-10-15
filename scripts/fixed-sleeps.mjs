#!/usr/bin/env node
// The guard against new fixed sleeps in the tests (spec §12, quality_ratchet: flaky tests, 15 Oct 2026): a test waits for
// the state it asserts, never for a number of milliseconds and then asserts. A sleep holds only while the machine is as
// fast as when it was written; under a loaded full run the work it waits for can take longer, and the test fails once in
// a while and passes alone (block-editor-undo.test.js did, 15 Oct 2026). Wait instead with the test support's `until`,
// on the state asserted, or, where nothing should change, on a positive sign that the work is done.
//
// A fixed sleep is an `await` of `wait`, `sleep`, `delay` or timers/promises' `setTimeout` handed a number, or of a
// `new Promise` that only resolves from `setTimeout` after a number. One inside a loop is a poll, which gives up on
// waiting rather than standing for the work (as `until` does), and is allowed. Read from the syntax, so a sleep written
// in a string, such as a test planted by another test, is not one.
//
// Those already in the tests are allowed, file by file, in test/fixed-sleeps.json, a ratchet: a file with more than its
// allowance fails, naming each sleep by line; one with fewer fails too, until the allowance is lowered with --tighten,
// so a sleep taken out stays out. The allowance is never raised by the command.
//
// Usage: node scripts/fixed-sleeps.mjs             lists each file over or under its allowance; exits 1 if there is one
//        node scripts/fixed-sleeps.mjs --tighten   lowers each allowance to what the file now has, never raising one
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testFiles } from './timed-assertions.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOWANCE = 'test/fixed-sleeps.json';
const SLEEPS = new Set(['wait', 'sleep', 'delay', 'setTimeout']);
const LOOPS = [ts.isForStatement, ts.isForOfStatement, ts.isForInStatement, ts.isWhileStatement, ts.isDoStatement];

const fixed = (n) =>
  !!n && (ts.isNumericLiteral(n) || (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand)));

/** Whether an awaited expression is a sleep of a fixed number of milliseconds. */
function sleepOf(e) {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && SLEEPS.has(e.expression.text))
    return e.arguments.length === 1 && fixed(e.arguments[0]);
  // new Promise((r) => setTimeout(r, 50)), its resolver handed to setTimeout with a number
  if (!ts.isNewExpression(e) || !ts.isIdentifier(e.expression) || e.expression.text !== 'Promise') return false;
  const f = e.arguments?.[0];
  if (!f || !(ts.isArrowFunction(f) || ts.isFunctionExpression(f)) || f.parameters.length < 1) return false;
  const resolve = f.parameters[0].name.getText();
  let body = f.body;
  if (ts.isBlock(body) && body.statements.length === 1 && ts.isExpressionStatement(body.statements[0]))
    body = body.statements[0].expression;
  return (
    ts.isCallExpression(body) &&
    ts.isIdentifier(body.expression) &&
    body.expression.text === 'setTimeout' &&
    body.arguments.length === 2 &&
    body.arguments[0].getText() === resolve &&
    fixed(body.arguments[1])
  );
}

/** Whether a node is inside a loop, within its own function: a poll. */
function inLoop(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (LOOPS.some((is) => is(p))) return true;
    if (ts.isFunctionLike(p)) return false;
  }
  return false;
}

/** The fixed sleeps in each of `sources` ({file: text}), as {file, line, text}, by file and line. */
export function findFixedSleeps(sources) {
  const found = [];
  for (const [file, text] of Object.entries(sources)) {
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const visit = (n) => {
      if (ts.isAwaitExpression(n) && sleepOf(n.expression) && !inLoop(n)) {
        const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
        found.push({ file, line: line + 1, text: n.getText(src) });
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** How many fixed sleeps each file has, for the files that have any. */
export const countByFile = (found) => found.reduce((c, f) => ({ ...c, [f.file]: (c[f.file] ?? 0) + 1 }), {});

/**
 * Each file whose fixed sleeps differ from its allowance: `over`, with the sleeps found, or `under`, the allowance to be
 * lowered; a file with none and no allowance is not named.
 */
export function compareAllowance(found, allowance) {
  const counts = countByFile(found),
    out = [];
  for (const file of [...new Set([...Object.keys(counts), ...Object.keys(allowance)])].sort()) {
    const has = counts[file] ?? 0,
      allowed = allowance[file] ?? 0;
    if (has > allowed) out.push({ file, has, allowed, over: true, sleeps: found.filter((f) => f.file === file) });
    else if (has < allowed) out.push({ file, has, allowed, over: false });
  }
  return out;
}

/** The allowance lowered to what each file now has, never raised; a file with none left is dropped. */
export function tightened(found, allowance) {
  const counts = countByFile(found);
  return Object.fromEntries(
    Object.entries(allowance)
      .map(([file, allowed]) => [file, Math.min(allowed, counts[file] ?? 0)])
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function main(args) {
  const files = testFiles(),
    found = findFixedSleeps(Object.fromEntries(files.map((f) => [f, read(f)]))),
    tighten = args.includes('--tighten');
  let allowance = JSON.parse(read(ALLOWANCE));
  if (tighten) {
    allowance = tightened(found, allowance);
    writeFileSync(join(ROOT, ALLOWANCE), `${JSON.stringify(allowance, null, 2)}\n`);
    console.log(`fixed sleeps: allowance tightened in ${ALLOWANCE}`);
  }
  const differ = compareAllowance(found, allowance);
  for (const d of differ) {
    if (d.over) {
      console.error(`${d.file}: ${d.has} fixed sleeps, allowed ${d.allowed}`);
      for (const s of d.sleeps) console.error(`  ${s.file}:${s.line}  ${s.text}`);
    } else console.error(`${d.file}: ${d.has} fixed sleeps, allowed ${d.allowed}: run with --tighten to lower it`);
  }
  if (differ.some((d) => d.over))
    console.error('a test waits for the state it asserts, with until(), never for a number of milliseconds');
  if (!differ.length) console.log(`fixed sleeps: ${found.length} in ${files.length} test files, as allowed`);
  return differ.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
