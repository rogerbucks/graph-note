#!/usr/bin/env node
// Checks the editor's requirements graph, the one source (spec §12, requirements_checked_in_ci), read with
// the repo's own graph-spec reader: every requirement of a slice that has started is proved by a test, every test the
// repository holds is where it says, every test claims a requirement, no test is planned while its file is written,
// every open question has its number, a whole-number slice and its text and blocks only requirements, only a question
// blocks anything, and the file's banner stands. A question never needs a test, and never proves a
// requirement.
//
// Usage:
//   node scripts/check-requirements.mjs           the committed copy
//   node scripts/check-requirements.mjs --stdin   a copy on stdin
//   node scripts/check-requirements.mjs --done N  whether slice N is done (done_means_proved), with or without --stdin
//
// Exits 1 and lists each problem. The file is never edited here: a problem is fixed by editing the file itself, in a
// pull request (Roger, 16 Oct 2026: no vault holds the requirements any more). With --done it checks only that a slice is
// done: every one of its requirements proved by a written test whose file is there (exit 0), or not, listing each
// requirement still to prove and why (exit 1). A slice in progress is not done, so CI runs the check without it.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gqlBlocks } from '../packages/core/src/fences.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

export const REQUIREMENTS = 'requirements/editor-requirements.gql';
// The slice being built: its requirements, and every earlier slice's, must each be proved by a named test.
export const CURRENT_SLICE = 3;
export const BANNER = [
  '// graph: editor_requirements · SOURCE',
  "// The editor's requirements graph, the one source: edit it here, in a pull request. A test only moves forward.",
];
// A test whose file the repository holds, alone or as well as somewhere else.
const IN_REPO = new Set(['repo', 'both']);
// A path in a test's file list: a list may carry notes in brackets, and a path may follow a repository's name. A path
// ending in a slash names a folder of tests, such as scripts/benchmarks/.
const FILE_PATH =
  /(?:^|[\s:,])((?:\.?[\w-]+\/)*[\w.-]+\.(?:js|mjs|ts|md|yml|yaml|json|py)|(?:\.?[\w-]+\/)+)(?=$|[\s,)])/g;

/** The repository paths a test's file field names. */
export const filesOf = (field) => [...String(field ?? '').matchAll(FILE_PATH)].map((m) => m[1]);

/** Where a test may be kept: the repository's, both, or outside it. Any other is not known, so proves nothing. */
export const WHERE = ['repo', 'both', 'outside the repo'];

/**
 * The statuses of a test, in the order it moves through them: planned (no file yet), partial (the file is there but does
 * not yet prove every rule its record covers) and written (it proves them all). Only a written test proves a requirement.
 */
export const TEST_STATUSES = ['planned', 'partial', 'written'];
/** The statuses whose test file must be in the repository. */
export const HAS_FILE = ['partial', 'written'];

/**
 * The requirements graph's text from the copy as kept (requirements_as_graph_note): a graph file is the graph itself; a
 * note holds it as the one block that opens on the banner, found by the core's own block reader, so either form passes
 * every reader here alike. A note with no such block, or with more than one, is given back as it is, and refused.
 */
export function requirementsGraph(text) {
  const own = gqlBlocks(text).filter((b) => b.text.split('\n')[0] === BANNER[0]);
  return own.length === 1 ? `${own[0].text}\n` : text;
}

/** A banner problem, as the audit lists it, for each line of the banner the file opens on that is not as it should be. */
function bannerProblems(text) {
  const lines = text.split('\n');
  return BANNER.flatMap((want, i) =>
    lines[i] === want
      ? []
      : [
          {
            kind: 'banner',
            id: `line ${i + 1}`,
            message: `line ${i + 1} of ${REQUIREMENTS} is not the banner the requirements open on: put it back`,
          },
        ],
  );
}

/**
 * Every problem with a copy of the requirements, each as {kind, id, message}. kind is banner, unreadable, unproved,
 * missing-file, unclaimed, status, question (a question lacking its num, slice or text, with a slice that is not a
 * whole number, or with a BLOCKS link to something that is not a requirement) or blocks (a BLOCKS link from something
 * that is not a question). exists(path) says whether the repository holds a repo-relative path.
 */
export function auditRequirements(copy, { exists = (rel) => existsSync(join(ROOT, rel)), slice = CURRENT_SLICE } = {}) {
  const text = requirementsGraph(copy);
  const problems = bannerProblems(text);

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
    if (!TEST_STATUSES.includes(status))
      problems.push({
        kind: 'status',
        id,
        message: `test ${id} has a status that is not planned, partial or written: ${JSON.stringify(status ?? null)}`,
      });
    if (!IN_REPO.has(where)) continue;
    const files = filesOf(n.props.file);
    const missing = files.filter((f) => !exists(f));
    if (HAS_FILE.includes(status) && (missing.length || !files.length))
      problems.push({
        kind: 'missing-file',
        id,
        message: `test ${id} is ${status}, but the repository has no ${missing.join(', ') || 'file named for it'}`,
      });
    if (status === 'planned' && files.length && !missing.length)
      problems.push({
        kind: 'status',
        id,
        message: `test ${id} is planned, but ${files.join(', ')} is written: its status should be written`,
      });
  }

  for (const [key, n] of ofLabel('Question')) {
    const { id } = n.props;
    for (const field of ['num', 'slice', 'text'])
      if (n.props[field] === undefined || n.props[field] === '')
        problems.push({ kind: 'question', id, message: `question ${id} has no ${field}` });
    if (n.props.slice !== undefined && !Number.isInteger(n.props.slice))
      problems.push({ kind: 'question', id, message: `question ${id} has a slice that is not a whole number` });
    for (const [from, type, to] of graph.edges)
      if (from === key && type === 'BLOCKS' && !byKey.get(to)?.labels.has('Requirement'))
        problems.push({
          kind: 'question',
          id,
          message: `question ${id} blocks ${byKey.get(to)?.props.id ?? to}, which is not a requirement`,
        });
  }
  for (const [from, type, to] of graph.edges)
    if (type === 'BLOCKS' && !byKey.get(from)?.labels.has('Question')) {
      const name = (key) => byKey.get(key)?.props.id ?? key;
      problems.push({
        kind: 'blocks',
        id: name(from),
        message: `${name(from)} blocks ${name(to)}, but it is not a question: only a question blocks`,
      });
    }
  return problems;
}

/**
 * Whether slice `slice` is done (spec §12, done_means_proved): every one of its requirements proved by a written test,
 * and every repository file such a test names there, in a copy that can be trusted. {slice, done, total, missing: [{id,
 * why}], faults: [{id, why}], said}: `total` counts the slice's requirements, `missing` lists each still to prove with
 * why (it names no test; a test it names is not written; a written test's file is not in the repository, or it says a
 * `where` not in `WHERE`, so its file is never skipped unknowingly), `faults` what makes the copy untrustworthy (a banner
 * line not as it should be; a requirement whose slice is not a whole number, which no slice can then be done while it
 * holds), and `said` says it in a line. A slice with no requirements is never done. Only the slice's own requirements
 * count. Throws what the reader throws for a copy it cannot read.
 */
export function sliceDone(copy, slice, { exists = (rel) => existsSync(join(ROOT, rel)) } = {}) {
  const text = requirementsGraph(copy);
  const store = read([text]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const proving = new Map();
  for (const [from, type, to] of graph.edges)
    if (type === 'PROVED_BY' && graph.nodes.get(to)?.labels.has('Test'))
      proving.set(from, [...(proving.get(from) ?? []), graph.nodes.get(to).props]);
  const requirements = [...graph.nodes].filter(([, n]) => n.labels.has('Requirement'));
  const faults = [
    ...bannerProblems(text).map((p) => ({ id: p.id, why: p.message })),
    ...requirements
      .filter(([, n]) => !Number.isInteger(n.props.slice))
      .map(([, n]) => ({
        id: n.props.id,
        why: `requirement ${n.props.id} has slice ${JSON.stringify(n.props.slice ?? null).replaceAll('"', "'")}, which is not a whole number`,
      })),
  ];
  const why = (test) => {
    if (test.status === 'partial')
      return [
        `test ${test.id} is partial: its file does not yet prove every rule its record covers, so it is not written`,
      ];
    if (test.status !== 'written') return [`test ${test.id} is ${test.status ?? 'without a status'}, not written`];
    if (!WHERE.includes(test.where))
      return [
        `test ${test.id} says where: '${test.where}', which is not ${WHERE.slice(0, -1).join(', ')} or ${WHERE.at(-1)}`,
      ];
    if (!IN_REPO.has(test.where)) return [];
    const files = filesOf(test.file);
    const absent = files.length ? files.filter((f) => !exists(f)) : ['file named for it'];
    return absent.length ? [`test ${test.id} is written, but the repository has no ${absent.join(', ')}`] : [];
  };
  const own = requirements.filter(([, n]) => n.props.slice === slice);
  const missing = own.flatMap(([key, n]) => {
    const tests = proving.get(key) ?? [];
    const reasons = tests.length ? tests.flatMap(why) : ['it names no test'];
    return reasons.length ? [{ id: n.props.id, why: reasons.join('; ') }] : [];
  });
  const total = own.length,
    done = total > 0 && !missing.length && !faults.length;
  const faulty = faults.length ? `, and the copy has ${faults.length} fault${faults.length === 1 ? '' : 's'}` : '';
  const said =
    !total && !faults.length
      ? `slice ${slice} has no requirements, so it is not done`
      : done
        ? `slice ${slice} is done: all ${total} of its requirements are proved by written tests`
        : `slice ${slice} is not done: ${missing.length} of ${total} requirements are still to prove${faulty}`;
  return { slice, done, total, missing, faults, said };
}

/** Prints whether a slice is done, and each fault and requirement still to prove; 0 when it is done, else 1. */
function doneMain(text, slice) {
  const r = sliceDone(text, slice);
  console.log(r.said);
  for (const m of [...r.faults, ...r.missing]) console.log(`  ${m.id}: ${m.why}`);
  return r.done ? 0 : 1;
}

function main(args) {
  const text = args.includes('--stdin') ? readFileSync(0, 'utf8') : readFileSync(join(ROOT, REQUIREMENTS), 'utf8');
  const at = args.indexOf('--done');
  if (at !== -1) {
    const slice = args[at + 1];
    if (!/^\d+$/.test(slice ?? '')) {
      console.error('--done needs a slice number, such as --done 3');
      return 2;
    }
    try {
      return doneMain(text, Number(slice));
    } catch (e) {
      console.error(`${REQUIREMENTS} cannot be read: ${e.message}`);
      return 1;
    }
  }
  const problems = auditRequirements(text);
  for (const p of problems) console.log(`${p.kind}: ${p.message}`);
  if (!problems.length) console.log(`${REQUIREMENTS}: every started requirement proved, every test in place`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
