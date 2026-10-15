#!/usr/bin/env node
// The guard against new fixed sleeps in the tests (spec §12, quality_ratchet: flaky tests, 15 Oct 2026): a test waits for
// the state it asserts, never for a number of milliseconds and then asserts. A sleep holds only while the machine is as
// fast as when it was written; under a loaded full run the work it waits for can take longer, and the test fails once in
// a while and passes alone (block-editor-undo.test.js did, 15 Oct 2026). Wait instead with the test support's `until`,
// on the state asserted, or, where nothing should change, on a positive sign that the work is done.
//
// A fixed sleep is an `await` of `wait`, `sleep`, `delay` or timers/promises' `setTimeout` handed a fixed number (a
// literal, a `const` bound to one, or arithmetic of them), or of a `new Promise` that only resolves from `setTimeout`
// after one; or an `await` of something holding one, as `Promise.all([work(), wait(20)])`. One inside a poll, a `for`,
// `while` or `do` whose condition reads state, gives up on waiting rather than standing for the work (as `until` does),
// and is allowed; a loop over cases, or one that only counts, is no poll. Read from the syntax, so a sleep written in a
// string, such as a test planted by another test, is not one.
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
const POLLS = [ts.isForStatement, ts.isWhileStatement, ts.isDoStatement];
const strip = (e) => {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
};

/** The `const` names of the file bound to a fixed number, such as `const MS = 20`, so `wait(MS)` is fixed too. */
function constants(src) {
  const out = new Map();
  const visit = (n) => {
    if (
      ts.isVariableDeclarationList(n) &&
      n.flags & ts.NodeFlags.Const &&
      n.declarations.every((d) => ts.isIdentifier(d.name))
    )
      for (const d of n.declarations) if (d.initializer) out.set(d.name.text, d.initializer);
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

/** Whether a number of milliseconds is fixed: a literal, a `const` bound to one, or arithmetic of them. */
function fixed(n, names, seen = new Set()) {
  if (!n) return false;
  n = strip(n);
  if (ts.isNumericLiteral(n)) return true;
  if (ts.isPrefixUnaryExpression(n)) return fixed(n.operand, names, seen);
  if (ts.isBinaryExpression(n)) return fixed(n.left, names, seen) && fixed(n.right, names, seen);
  if (ts.isIdentifier(n) && names.has(n.text) && !seen.has(n.text))
    return fixed(names.get(n.text), names, new Set([...seen, n.text]));
  return false;
}

/** Whether a function only calls `resolve` from `setTimeout` after a fixed number: `(r) => setTimeout(r, 50)` and the like. */
function timerResolves(f, names) {
  if (!f || !(ts.isArrowFunction(f) || ts.isFunctionExpression(f)) || f.parameters.length < 1) return false;
  const resolve = f.parameters[0].name.getText();
  let body = f.body;
  if (ts.isBlock(body) && body.statements.length === 1 && ts.isExpressionStatement(body.statements[0]))
    body = body.statements[0].expression;
  body = strip(body);
  if (!ts.isCallExpression(body) || !ts.isIdentifier(body.expression) || body.expression.text !== 'setTimeout')
    return false;
  if (body.arguments.length !== 2 || !fixed(body.arguments[1], names)) return false;
  const callback = body.arguments[0];
  if (callback.getText() === resolve) return true;
  // () => r(), or () => r(value): the resolver called from a callback of its own
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
  const calls = ts.isBlock(callback.body)
    ? callback.body.statements.length === 1 &&
      ts.isExpressionStatement(callback.body.statements[0]) &&
      strip(callback.body.statements[0].expression)
    : strip(callback.body);
  return !!calls && ts.isCallExpression(calls) && calls.expression.getText() === resolve;
}

/** Whether an expression is a sleep of a fixed number of milliseconds. */
function isSleep(e, names) {
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && SLEEPS.has(e.expression.text))
    return e.arguments.length === 1 && fixed(e.arguments[0], names);
  return ts.isNewExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'Promise'
    ? timerResolves(e.arguments?.[0], names)
    : false;
}

/**
 * Whether an awaited expression holds a fixed sleep: itself, or one it waits on, as in `Promise.all([work(), wait(20)])`,
 * never one inside a function it defines.
 */
function sleepOf(e, names) {
  let found = false;
  const visit = (n) => {
    if (found || ts.isFunctionLike(n)) return;
    if (isSleep(n, names)) found = true;
    else ts.forEachChild(n, visit);
  };
  const top = strip(e);
  if (isSleep(top, names)) return true;
  ts.forEachChild(top, visit);
  return found;
}

/**
 * Whether a loop's condition reads state, so the loop is a poll: a call, or anything but a comparison of a counter
 * with a number. `for (let i = 0; i < 3; i++)` only counts, and is not one.
 */
function readsState(cond, names) {
  if (!cond) return false;
  const c = strip(cond);
  if (ts.isBinaryExpression(c)) {
    const k = c.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken)
      return readsState(c.left, names) || readsState(c.right, names);
    const counter = (n) => ts.isIdentifier(strip(n)) || fixed(n, names);
    if (counter(c.left) && counter(c.right)) return false;
  }
  return true;
}

/** Whether a node is inside a poll, within its own function: a `for`, `while` or `do` whose condition reads state. */
function inPoll(n, names) {
  for (let p = n.parent; p; p = p.parent) {
    if (POLLS.some((is) => is(p)) && readsState(p.condition ?? p.expression, names)) return true;
    if (ts.isFunctionLike(p)) return false;
  }
  return false;
}

/** The fixed sleeps in each of `sources` ({file: text}), as {file, line, text}, by file and line. */
export function findFixedSleeps(sources) {
  const found = [];
  for (const [file, text] of Object.entries(sources)) {
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = constants(src);
    const visit = (n) => {
      if (ts.isAwaitExpression(n) && sleepOf(n.expression, names) && !inPoll(n, names)) {
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
