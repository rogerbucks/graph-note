#!/usr/bin/env node
// Checks a change to the generated requirements copy against the copy it started from. The copy says do not hand-edit,
// and a vault-side script pulls one kind of change back into the source later: tests flipped from planned to written,
// with a flipped test's repository file path corrected. This accepts exactly that and refuses every other difference,
// naming each one.
//
// Usage:
//   node scripts/check-requirements-flips.mjs --base-ref <commit>   the committed copy against the copy at <commit>
//   node scripts/check-requirements-flips.mjs --base <file>         the committed copy against a file
//
// Exits 1 and lists each refused difference. A base that holds no copy (the copy is new) has nothing to compare.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNER, REQUIREMENTS, filesOf } from './check-requirements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
// A test whose file the repository holds, alone or as well as somewhere else.
const IN_REPO = new Set(['repo', 'both']);

function parse(text, side) {
  try {
    const store = read([text]);
    const graph = store.graph(Object.keys(store.graphs)[0]);
    const name = (key) => graph.nodes.get(key)?.props.id ?? key;
    return {
      graph: {
        nodes: new Map([...graph.nodes].map(([key, n]) => [name(key), n])),
        edges: graph.edges.map(([from, type, to, props]) => [name(from), type, name(to), props]),
      },
    };
  } catch (e) {
    const at = e.line === undefined ? '' : ` at line ${e.line}`;
    return { problem: { kind: 'unreadable', id: side, message: `the ${side} copy cannot be read${at}: ${e.message}` } };
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const propsKey = (props) =>
  JSON.stringify(Object.entries(props ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const edgeKey = ([from, type, to, props]) => {
  const p = propsKey(props);
  return `(${from})-[:${type}${p === '[]' ? '' : ` ${p}`}]->(${to})`;
};
// a comment line may be indented, as the reader takes it
const commentsOf = (text) => text.split('\n').filter((l) => l.trim().startsWith('//'));

/** Banner and other comment lines: the banner as generated, every other comment line as it was. */
function commentProblems(baseText, headText) {
  const lines = headText.split('\n');
  const banner = BANNER.flatMap((want, i) =>
    lines[i] === want
      ? []
      : [
          {
            kind: 'banner',
            id: `line ${i + 1}`,
            message: `line ${i + 1} is not the generated banner: regenerate the copy`,
          },
        ],
  );
  const was = commentsOf(baseText).slice(BANNER.length);
  const now = commentsOf(headText).slice(BANNER.length);
  const changed = was.length !== now.length || was.some((l, i) => l !== now[i]);
  return [
    ...banner,
    ...(changed
      ? [{ kind: 'comment', id: 'comments', message: 'a comment line or heading was changed, added or removed' }]
      : []),
  ];
}

/** The problems with one record present in both copies. */
function recordProblems(id, was, now, exists) {
  const problems = [];
  const field = (name, detail) =>
    problems.push({ kind: 'field', id, message: `${id}: ${name} ${detail}, which only a flip's status and file may` });
  if ([...was.labels].sort().join() !== [...now.labels].sort().join()) field('labels', 'changed');
  const isTest = was.labels.has('Test');
  const flipped = isTest && was.props.status === 'planned' && now.props.status === 'written';
  const names = new Set([...Object.keys(was.props), ...Object.keys(now.props)]);
  for (const name of names) {
    if (same(was.props[name], now.props[name])) continue;
    if (name === 'status') {
      if (flipped) continue;
      if (isTest && was.props.status === 'written' && now.props.status === 'planned')
        problems.push({
          kind: 'flip-back',
          id,
          message: `${id}: status went from written to planned: only planned to written is allowed`,
        });
      else if (was.props.status === 'planned' && now.props.status === 'written')
        problems.push({
          kind: 'not-a-test',
          id,
          message: `${id}: is not a test, so its status may not be flipped by hand`,
        });
      else field('status', `went from ${JSON.stringify(was.props.status)} to ${JSON.stringify(now.props.status)}`);
    } else if (name === 'file' && flipped) continue;
    else field(name, 'changed');
  }
  if (flipped && IN_REPO.has(now.props.where)) {
    const files = filesOf(now.props.file);
    const missing = files.filter((f) => !exists(f));
    if (missing.length || !files.length)
      problems.push({
        kind: 'missing-file',
        id,
        message: `${id}: flipped to written, but the repository has no ${missing.join(', ') || 'file named for it'}`,
      });
  }
  return problems;
}

/**
 * The differences between two copies of the requirements that may not be made by hand, each as {kind, id, message}:
 * banner, comment, unreadable, added, removed, link-added, link-removed, field (a record's field changed, other than the
 * status and file of a flipped test), flip-back (a test's status from written to planned), not-a-test (a status flipped
 * on a record that is not a test) and missing-file (a flipped test whose file the repository does not hold). Empty when
 * the only differences are tests flipped from planned to written, each with its file path perhaps corrected.
 * exists(path) says whether the repository holds a repo-relative path.
 */
export function refusedChanges(baseText, headText, { exists = (rel) => existsSync(join(ROOT, rel)) } = {}) {
  const problems = commentProblems(baseText, headText);
  const base = parse(baseText, 'base');
  const head = parse(headText, 'head');
  if (base.problem || head.problem) return [...problems, base.problem, head.problem].filter(Boolean);

  const was = base.graph.nodes;
  const now = head.graph.nodes;
  for (const id of now.keys())
    if (!was.has(id)) problems.push({ kind: 'added', id, message: `${id}: a record added by hand` });
  for (const id of was.keys())
    if (!now.has(id)) problems.push({ kind: 'removed', id, message: `${id}: a record removed by hand` });
  for (const [id, record] of now) if (was.has(id)) problems.push(...recordProblems(id, was.get(id), record, exists));

  // a multiset: a link repeated is a link added
  const count = (edges) => edges.map(edgeKey).reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map());
  const before = count(base.graph.edges);
  const after = count(head.graph.edges);
  for (const [e, n] of after)
    if (n > (before.get(e) ?? 0)) problems.push({ kind: 'link-added', id: e, message: `${e}: a link added by hand` });
  for (const [e, n] of before)
    if (n > (after.get(e) ?? 0))
      problems.push({ kind: 'link-removed', id: e, message: `${e}: a link removed by hand` });
  return problems;
}

function main(args) {
  const value = (flag) => args[args.indexOf(flag) + 1];
  const head = readFileSync(join(ROOT, REQUIREMENTS), 'utf8');
  let base;
  if (args.includes('--base-ref')) {
    const ref = value('--base-ref');
    if (!ref || ref.startsWith('-')) {
      console.error('--base-ref needs a commit, such as --base-ref origin/main');
      return 2;
    }
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      // the commit must resolve; only a commit that holds no copy has nothing to compare
      git('rev-parse', '--verify', '--quiet', `${ref}^{tree}`);
      if (!git('ls-tree', '--name-only', ref, '--', REQUIREMENTS).trim()) {
        console.log(`${REQUIREMENTS}: not in the base, so nothing to compare`);
        return 0;
      }
      base = git('show', `${ref}:${REQUIREMENTS}`);
    } catch (e) {
      console.error(`cannot read ${REQUIREMENTS} at ${ref}: ${String(e.stderr || e.message).trim()}`);
      return 2;
    }
  } else if (args.includes('--base')) {
    try {
      base = readFileSync(value('--base') ?? '', 'utf8');
    } catch (e) {
      console.error(`cannot read the base file: ${e.message}`);
      return 2;
    }
  } else {
    console.error('needs --base-ref <commit> or --base <file>');
    return 2;
  }
  const problems = refusedChanges(base, head);
  for (const p of problems) console.log(`${p.kind}: ${p.message}`);
  if (!problems.length) console.log(`${REQUIREMENTS}: unchanged, or changed only by tests flipped to written`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
