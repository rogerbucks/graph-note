#!/usr/bin/env node
// Checks the repository's generated copy of the editor's requirements (spec §12, requirements_checked_in_ci), read with
// the repo's own graph-spec reader: every requirement of a slice that has started is proved by a test, every test the
// repository holds is where it says, every test claims a requirement, no test is planned while its file is written, and
// the copy's do-not-hand-edit banner stands.
//
// Usage:
//   node scripts/check-requirements.mjs           the committed copy
//   node scripts/check-requirements.mjs --stdin   a copy on stdin
//
// Exits 1 and lists each problem. The copy is never edited here: a problem is fixed in the vault's requirements graph,
// which regenerates the copy.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

export const REQUIREMENTS = 'requirements/editor-requirements.gql';
// The slice being built: its requirements, and every earlier slice's, must each be proved by a named test.
export const CURRENT_SLICE = 2;
export const BANNER = [
  '// graph: editor_requirements · SOURCE',
  "// Generated from the editor's requirements graph by graph-note-requirements-export.py — do not hand-edit; regenerate.",
];
// A test whose file the repository holds, alone or as well as somewhere else.
const IN_REPO = new Set(['repo', 'both']);
// A path in a test's file list: a list may carry notes in brackets, and a path may follow a repository's name.
const FILE_PATH = /(?:^|[\s:,])((?:\.?[\w-]+\/)*[\w.-]+\.(?:js|mjs|ts|md|yml|yaml|json|py))(?=$|[\s,)])/g;

/** The repository paths a test's file field names. */
export const filesOf = (field) => [...String(field ?? '').matchAll(FILE_PATH)].map((m) => m[1]);

/**
 * Every problem with a copy of the requirements, each as {kind, id, message}. kind is banner, unreadable, unproved,
 * missing-file, unclaimed or status. exists(path) says whether the repository holds a repo-relative path.
 */
export function auditRequirements(text, { exists = (rel) => existsSync(join(ROOT, rel)), slice = CURRENT_SLICE } = {}) {
  const problems = [];
  const lines = text.split('\n');
  BANNER.forEach((want, i) => {
    if (lines[i] !== want)
      problems.push({
        kind: 'banner',
        id: `line ${i + 1}`,
        message: `line ${i + 1} of ${REQUIREMENTS} is not the generated banner: regenerate the copy, never edit it`,
      });
  });

  let graph;
  try {
    const store = read([text]);
    graph = store.graph(Object.keys(store.graphs)[0]);
  } catch (e) {
    const id = e.line === undefined ? 'copy' : `line ${e.line}`;
    problems.push({ kind: 'unreadable', id, message: `${REQUIREMENTS} cannot be read: ${e.message}` });
    return problems;
  }

  const byKey = graph.nodes;
  const ofLabel = (label) => [...byKey].filter(([, n]) => n.labels.has(label));
  const proving = new Map(); // requirement key -> its tests' keys
  const claimed = new Set(); // test keys some requirement names
  for (const [from, type, to] of graph.edges) {
    if (type !== 'PROVED_BY') continue;
    if (!proving.has(from)) proving.set(from, []);
    proving.get(from).push(to);
    claimed.add(to);
  }

  for (const [key, n] of ofLabel('Requirement')) {
    const tests = (proving.get(key) ?? []).filter((t) => byKey.get(t)?.labels.has('Test'));
    if (n.props.slice <= slice && !tests.length)
      problems.push({
        kind: 'unproved',
        id: n.props.id,
        message: `requirement ${n.props.id} is in slice ${n.props.slice}, which has started, and names no test`,
      });
  }

  for (const [key, n] of ofLabel('Test')) {
    const { id, where, status } = n.props;
    if (!claimed.has(key))
      problems.push({ kind: 'unclaimed', id, message: `test ${id} claims no requirement: no PROVED_BY names it` });
    if (!IN_REPO.has(where)) continue;
    const files = filesOf(n.props.file);
    const missing = files.filter((f) => !exists(f));
    if (status === 'written' && (missing.length || !files.length))
      problems.push({
        kind: 'missing-file',
        id,
        message: `test ${id} is written, but the repository has no ${missing.join(', ') || 'file named for it'}`,
      });
    if (status === 'planned' && files.length && !missing.length)
      problems.push({
        kind: 'status',
        id,
        message: `test ${id} is planned, but ${files.join(', ')} is written: its status should be written`,
      });
  }
  return problems;
}

function main(args) {
  const text = args.includes('--stdin') ? readFileSync(0, 'utf8') : readFileSync(join(ROOT, REQUIREMENTS), 'utf8');
  const problems = auditRequirements(text);
  for (const p of problems) console.log(`${p.kind}: ${p.message}`);
  if (!problems.length) console.log(`${REQUIREMENTS}: every started requirement proved, every test in place`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
