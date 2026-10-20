#!/usr/bin/env node
// Which graph-spec rules a test in this repository proves (spec §51, spec_rules_proved, spec_no_general_proof and
// spec_index_true; GS1). requirements/graph-spec.gql holds the graph spec's rules, each with an id such as
// req:3.first-line. A rule counts as proved when a test file here cites that id. A proof the spec only names, such as
// 'general' or a case kept in the owner's vault, counts for nothing, as CI cannot run it.
//
// A rule is also proved by the conformance suite kept here, in python/graph_spec/conformance (spec_conformance_in_repo).
// Its proof must name a test that is in that case's data, and must not be partial. CI runs the suite.
//
// quality/graph-spec-unproved.json lists the rules no test proves yet, and the list only shrinks. A new unproved rule
// fails. So does a listed rule that a test now proves, until it comes off the list.
//
// The spec file is also checked against itself: its first line's counts, the paths it names, and no pending rule that a
// test already proves.
//
// Usage:
//   node scripts/graph-spec-proved.mjs           what is wrong, one line each (exit 1), or how many rules are proved.
//   node scripts/graph-spec-proved.mjs --update  rewrite the list from the repository as it is.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC = 'requirements/graph-spec.gql';
export const LIST = 'quality/graph-spec-unproved.json';
/** The conformance suite's documents: each case's data is a yaml block that starts `# conformance case`. */
export const SUITE = 'python/graph_spec/conformance/Standards';
/** The folders that hold tests, and the kinds of file a test or its cases is written in. */
const TEST_DIRS = ['test', 'packages', 'python'];
const TEST_FILE = /(^|\/)(test|tests)\/.+\.(m?js|ts|py|json)$/;
/** Folders never searched: installs, builds, and the tests-first record, which only repeats test names. */
const SKIP = new Set(['node_modules', 'dist', '.venv', '__pycache__', 'tests-first', '.git']);
/** A rule's id as a whole word, so req:1.two is not found in req:1.twofold. */
const ID = /req:\d+\.[a-z0-9]+(?:-[a-z0-9]+)*(?![a-z0-9-])/g;

/** The ids of the spec's rules, in the order it lists them. */
export function specRules(text) {
  return [...text.matchAll(/:Requirement \{id: '(req:[^']+)'/g)].map((m) => m[1]);
}

/** Every repo-relative file under `rel` that holds a test or its cases. */
function testFiles(rel) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return testFiles(child);
    return TEST_FILE.test(child) ? [child] : [];
  });
}

/** The rule ids the tests cite. `files` is a list of [path, text]; by default every test file in the repository. */
export function citedIds(files = TEST_DIRS.flatMap(testFiles).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')])) {
  const cited = new Set();
  for (const [, text] of files) for (const m of text.matchAll(ID)) cited.add(m[0]);
  return cited;
}

/** {case name: case data} from the suite's documents. `files` is a list of [path, text]; by default the suite here. */
export function suiteCases(files = suiteFiles()) {
  const cases = new Map();
  for (const [, text] of files)
    for (const m of text.matchAll(/```yaml\n(# conformance case[\s\S]*?)\n```/g)) {
      const name = /^case:\s*(.+)$/m.exec(m[1]);
      if (name) cases.set(name[1].trim(), m[1]);
    }
  return cases;
}

function suiteFiles() {
  const dir = join(ROOT, SUITE);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => [`${SUITE}/${f}`, readFileSync(join(dir, f), 'utf8')]);
}

/** The rule ids the suite's cases prove: a full proof naming a test that is in its case's data. */
export function suiteProved(text, cases = suiteCases()) {
  const ids = new Map(
    [...text.matchAll(/\((\w+):(?:Requirement|ConformanceCase) \{id: '([^']+)'/g)].map((m) => [m[1], m[2]]),
  );
  const proved = new Set();
  for (const m of text.matchAll(/\((\w+)\)-\[:PROVED_BY \{test: '([^']+)'(, partial: TRUE)?\}\]->\((\w+)\)/g)) {
    const [, rule, code, partial, kase] = m;
    const data = cases.get((ids.get(kase) ?? '').replace(/^case:/, ''));
    const named = new RegExp(`(?<![A-Za-z0-9])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9a-z])`);
    if (code !== 'general' && !partial && data && named.test(data)) proved.add(ids.get(rule));
  }
  return proved;
}

/** Every rule proved here: cited by a test, or proved by the suite. */
export function provedIds() {
  return new Set([...citedIds(), ...suiteProved(readFileSync(join(ROOT, SPEC), 'utf8'))]);
}

/** The spec's rules that no test cites, in the spec's order. */
export function unproved(text, cited) {
  return specRules(text).filter((id) => !cited.has(id));
}

/** What is wrong when `now` (the unproved rules) is compared with `listed`, one line each. */
export function compareToList(now, listed) {
  const was = new Set(listed);
  const is = new Set(now);
  return [
    ...now
      .filter((id) => !was.has(id))
      .map(
        (id) =>
          `${id} is not proved by any test in the repository: cite its id in a test that fails when the rule is broken`,
      ),
    ...listed
      .filter((id) => !is.has(id))
      .map((id) => `${id} is proved now: run node scripts/graph-spec-proved.mjs --update to take it off the list`),
  ];
}

/** What the spec file says about itself that is not true, one line each. */
export function indexProblems(text, { cited, exists = (rel) => existsSync(join(ROOT, rel)) }) {
  const out = [];
  const first = text.split('\n')[0];
  const counts = /(\d+) requirements, (\d+) wordings/.exec(first);
  const held = { requirements: specRules(text).length, wordings: [...text.matchAll(/\(\w+:Wording \{/g)].length };
  if (!counts) out.push('the first line does not count its requirements and wordings');
  else {
    if (Number(counts[1]) !== held.requirements)
      out.push(`the first line counts ${counts[1]} requirements, but the file holds ${held.requirements}`);
    if (Number(counts[2]) !== held.wordings)
      out.push(`the first line counts ${counts[2]} wordings, but the file holds ${held.wordings}`);
  }
  const paths = new Set([...text.matchAll(/[\w.-]+(?:\/[\w.-]+)+\.(?:py|m?js|ts|json|md|gql)\b/g)].map((m) => m[0]));
  for (const p of paths) if (!exists(p)) out.push(`it names ${p}, which is not in the repository`);
  for (const m of text.matchAll(/:Requirement \{id: '(req:[^']+)'[^\n]*pending: TRUE/g))
    if (cited.has(m[1])) out.push(`${m[1]} is marked pending, but a test proves it: take pending off`);
  return out;
}

function main(args) {
  const text = readFileSync(join(ROOT, SPEC), 'utf8');
  const cited = provedIds();
  const now = unproved(text, cited);
  if (args[0] === '--update') {
    const list = {
      about: 'The graph-spec rules no test in this repository proves yet. It only shrinks.',
      unproved: now,
    };
    writeFileSync(join(ROOT, LIST), `${JSON.stringify(list, null, 2)}\n`);
    console.log(`${LIST}: ${now.length} of ${specRules(text).length} rules not proved yet`);
    return 0;
  }
  const listed = JSON.parse(readFileSync(join(ROOT, LIST), 'utf8')).unproved;
  const problems = [...compareToList(now, listed), ...indexProblems(text, { cited })];
  for (const p of problems) console.error(p);
  if (!problems.length) {
    const all = specRules(text).length;
    console.log(`${all - now.length} of ${all} graph-spec rules proved by a test here; ${now.length} still to prove`);
  }
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
