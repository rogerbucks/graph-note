#!/usr/bin/env node
// The guard that a test asserts the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026): it reads
// every JavaScript test file, and its test support, and finds an assertion that holds a span of elapsed time. A span is
// one clock reading less another: performance.now(), Date.now(), new Date(), process.hrtime() and its bigint,
// process.cpuUsage(), process.resourceUsage() or process.uptime(), read directly, kept in a variable, or returned by a
// helper (the test's own, or one imported from test support). It is followed through variables, objects and helpers
// that carry it, each by its own scope. A number compared with what any call makes of a reading it is handed, such as
// `elapsed(t0) < 500`, is taken for a span too, whatever the call is. An assertion holds a span when its arguments use
// it, or when it, or a throw, runs only under a condition that does.
//
// Allowed: a clock reading that is not a span (a file's time compared with when the test began); Date.now() and
// new Date() where the file runs Node's mock timers with Date mocked, which take no real time; and a deadline for
// polling, a condition on a span inside a loop that awaits, giving up on waiting rather than asserting how long the work
// took. JavaScript only: the Python library's tests are outside the suite the quality job runs twice.
//
// Known limits, each a way a span could still be asserted unseen (the review of #113): a reading kept in an array, a Map
// or a class's field and read back from it; one passed through a callback's parameter, a promise's value or an event;
// a helper imported from anywhere but test support, or required, or imported dynamically; a span measured in another
// process and handed back as text; performance.mark() and measure(), console.time(), and timing by counting timers that
// fire; a comparison made by a matcher other than `assert` and `expect`; and the Python library's tests.
//
// Usage: node scripts/timed-assertions.mjs    lists each assertion found, by file and line; exits 1 if there is one
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLOCKS = new Set([
  'performance.now',
  'Date.now',
  'process.hrtime',
  'process.hrtime.bigint',
  'process.cpuUsage',
  'process.resourceUsage',
  'process.uptime',
]);
const COMPARISONS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);
// these give a span themselves when handed an earlier reading
const SPAN_FROM = new Set(['process.hrtime', 'process.cpuUsage']);
const ASSERTION = /^(?:t\.)?assert(?:\.\w+)?$|^expect$/;
const SUPPORT = /(^|\/)(test|tests)\//;
const NONE = 0,
  READING = 1,
  SPAN = 2;

const functionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
const LOOPS = [ts.isForStatement, ts.isForOfStatement, ts.isForInStatement, ts.isWhileStatement, ts.isDoStatement];
const loop = (n) => LOOPS.some((is) => is(n));

/** Whether a subtree awaits, not counting the functions inside it. */
function awaits(node) {
  let found = false;
  const visit = (n) => {
    if (found || (n !== node && functionLike(n))) return;
    if (ts.isAwaitExpression(n)) found = true;
    else n.forEachChild(visit);
  };
  visit(node);
  return found;
}

/** The identifiers a binding, or an assignment's left side, gives a value to. */
function bound(n) {
  if (ts.isIdentifier(n)) return [n];
  if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))
    return n.elements.flatMap((e) => (ts.isBindingElement(e) ? bound(e.name) : []));
  if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(bound);
  if (ts.isObjectLiteralExpression(n)) return n.properties.flatMap(bound);
  if (ts.isShorthandPropertyAssignment(n)) return [n.name];
  if (ts.isPropertyAssignment(n)) return bound(n.initializer);
  return [];
}

/** The relative modules a file imports from, each with its import specifiers. */
function importsOf(src) {
  return src.statements.flatMap((s) => {
    const named = ts.isImportDeclaration(s) && s.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named) || !s.moduleSpecifier.text.startsWith('.')) return [];
    return [{ from: s.moduleSpecifier.text, specifiers: named.elements }];
  });
}

/**
 * Reads one file with the checker that resolves its names: the functions it declares that return a clock reading or a
 * span, by name, and the assertions on a span it holds. `imported` gives what each import specifier of a helper carries.
 */
function analyse(src, checker, imported) {
  const mockedDate = /mock\.timers\.enable\([^)]*['"]Date['"]/s.test(src.text);
  const sym = (id) =>
    ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
      ? checker.getShorthandAssignmentValueSymbol(id.parent)
      : checker.getSymbolAtLocation(id);
  const parameter = (n) => ts.isIdentifier(n) && Boolean(sym(n)?.declarations?.some((d) => ts.isParameter(d)));
  const values = new Map(),
    fns = new Map();
  for (const [specifier, k] of imported) fns.set(sym(specifier.name), k);
  const kind = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(src);
      if (CLOCKS.has(callee) && !(mockedDate && callee === 'Date.now'))
        return SPAN_FROM.has(callee) && n.arguments.length ? SPAN : READING;
      const own = ts.isIdentifier(n.expression) ? (fns.get(sym(n.expression)) ?? NONE) : NONE;
      return Math.max(own, ...n.arguments.map(kind));
    }
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      if ((ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p)) && p.name === n) return NONE;
      return values.get(sym(n)) ?? NONE;
    }
    // `new Date()`, a reading as a date, unless Date is mocked
    if (ts.isNewExpression(n) && n.expression.getText(src) === 'Date' && !n.arguments?.length)
      return mockedDate ? NONE : READING;
    // a number compared with what any call makes of a reading it is handed, `elapsed(t0) < 500`: what the call does
    // with it cannot be seen, and a reading handed on to be compared is a span by another name
    if (ts.isBinaryExpression(n) && COMPARISONS.has(n.operatorToken.kind) && (handed(n.left) || handed(n.right)))
      return SPAN;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.MinusToken) {
      const [l, r] = [kind(n.left), kind(n.right)];
      // a reading less a parameter is a helper's span since a reading it is handed: `(t) => performance.now() - t`
      const span = (l >= READING && (r >= READING || parameter(n.right))) || (r >= READING && parameter(n.left));
      return span ? SPAN : Math.max(l, r);
    }
    if (functionLike(n)) return NONE;
    let most = NONE;
    n.forEachChild((c) => (most = Math.max(most, kind(c))));
    return most;
  };
  // whether an operand holds a call handed a clock reading, not counting the functions inside it
  const handed = (n) => {
    if (functionLike(n)) return false;
    if (ts.isCallExpression(n) && !CLOCKS.has(n.expression.getText(src)) && n.arguments.some((a) => kind(a) >= READING))
      return true;
    let found = false;
    n.forEachChild((c) => (found ||= handed(c)));
    return found;
  };
  const returned = (fn) => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return kind(fn.body);
    let most = NONE;
    const visit = (n) => {
      if (n !== fn && functionLike(n)) return;
      if (ts.isReturnStatement(n) && n.expression) most = Math.max(most, kind(n.expression));
      n.forEachChild(visit);
    };
    visit(fn);
    return most;
  };
  const raise = (map, key, k) => Boolean(key) && k > (map.get(key) ?? NONE) && (map.set(key, k), true);
  const helpers = new Map();
  for (let changed = true, rounds = 0; changed && rounds < 10; rounds++) {
    changed = false;
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        const fn = ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer);
        if (fn && ts.isIdentifier(n.name)) {
          const k = returned(n.initializer);
          changed = raise(fns, sym(n.name), k) || changed;
          if (k) helpers.set(n.name.text, k);
        } else for (const id of bound(n.name)) changed = raise(values, sym(id), kind(n.initializer)) || changed;
      } else if (ts.isFunctionDeclaration(n) && n.name) {
        const k = returned(n);
        changed = raise(fns, sym(n.name), k) || changed;
        if (k) helpers.set(n.name.text, k);
      } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken)
        for (const id of bound(n.left)) changed = raise(values, sym(id), kind(n.right)) || changed;
      n.forEachChild(visit);
    };
    visit(src);
  }
  // under a condition on a span, unless that condition gives up waiting in a loop that awaits: a deadline for polling
  const guarded = (n) => {
    for (let p = n.parent; p && !functionLike(p); p = p.parent)
      if (ts.isIfStatement(p) && kind(p.expression) === SPAN) {
        for (let q = p.parent; q && !functionLike(q); q = q.parent) if (loop(q) && awaits(q)) return false;
        return true;
      }
    return false;
  };
  const found = [];
  const visit = (n) => {
    const asserting = ts.isCallExpression(n) && ASSERTION.test(n.expression.getText(src));
    const spans = asserting && n.arguments.some((a) => kind(a) === SPAN);
    if (spans || ((asserting || ts.isThrowStatement(n)) && guarded(n))) {
      const line = src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
      found.push({ file: src.fileName, line, text: n.getText(src).split('\n')[0].slice(0, 100) });
    }
    n.forEachChild(visit);
  };
  visit(src);
  return { helpers, found };
}

/**
 * The assertions on elapsed time in `sources` (path, from the repository's root, to text). A helper imported from test
 * support is followed into it: from `sources`, or else read with `read`. A test's subject is never taken for a helper.
 */
export function findTimedAssertions(sources, read = (p) => readFileSync(join(ROOT, p), 'utf8')) {
  const texts = new Map(Object.entries(sources));
  const files = new Map();
  const target = (file, from) => posix.normalize(posix.join(posix.dirname(file), from));
  const parse = (file) => ts.createSourceFile(file, texts.get(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  // every test support file the sources import, and what those import, read once
  const pending = [...texts.keys()];
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.set(file, parse(file));
    for (const { from } of importsOf(files.get(file))) {
      const t = target(file, from);
      if (!SUPPORT.test(t) || texts.has(t) || !existsSync(join(ROOT, t))) continue;
      texts.set(t, read(t));
      pending.push(t);
    }
  }
  const options = { allowJs: true, noLib: true, noResolve: true, noEmit: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => files.get(name);
  host.fileExists = (name) => files.has(name);
  host.readFile = (name) => texts.get(name);
  const checker = ts.createProgram([...files.keys()], options, host).getTypeChecker();
  const done = new Map();
  const result = (file, seen = new Set()) => {
    if (done.has(file)) return done.get(file);
    seen.add(file);
    const imported = new Map();
    for (const { from, specifiers } of importsOf(files.get(file))) {
      const t = target(file, from);
      // a module being read further up an import cycle has no helpers known yet
      if (!files.has(t) || !SUPPORT.test(t) || (seen.has(t) && !done.has(t))) continue;
      const theirs = result(t, seen).helpers;
      for (const s of specifiers) {
        const k = theirs.get((s.propertyName ?? s.name).text);
        if (k) imported.set(s, k);
      }
    }
    const r = analyse(files.get(file), checker, imported);
    done.set(file, r);
    return r;
  };
  return Object.keys(sources).flatMap((file) => result(file).found);
}

/** Every JavaScript file under a test or tests folder of the repository: the tests and their support. */
export function testFiles(root = ROOT) {
  const skip = new Set(['node_modules', '.git', '.claude', 'dist', 'test-vault', 'tests-first', 'seen-failing']);
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel || '.'))) {
      if (skip.has(name)) continue;
      const child = rel ? `${rel}/${name}` : name;
      if (statSync(join(root, child)).isDirectory()) walk(child);
      else if (/\.(?:c|m)?js$/.test(name) && SUPPORT.test(child)) out.push(child);
    }
  };
  walk('');
  return out.sort();
}

function main() {
  const files = testFiles();
  const found = findTimedAssertions(Object.fromEntries(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')])));
  for (const f of found) console.error(`${f.file}:${f.line}  ${f.text}`);
  if (found.length)
    console.error(`${found.length} assertions on elapsed time: a test asserts the work done, never the time taken`);
  else console.log(`timed assertions: none in ${files.length} test files`);
  return found.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
