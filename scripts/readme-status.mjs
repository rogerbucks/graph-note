#!/usr/bin/env node
// The README's status line, made from the requirements graph (spec §41, readme_status_generated). It says how many
// slices there are, which are done and which is being built. A slice is done when every one of its requirements is
// proved by a written test, as `check-requirements.mjs --done` says.
//
// The line sits between two markers in README.md, so nothing else in the file is touched.
//
// Usage:
//   node scripts/readme-status.mjs           prints the line.
//   node scripts/readme-status.mjs --write   puts it in README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS, requirementsGraph, sliceDone } from './check-requirements.mjs';

const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const README = 'README.md';
export const START = '<!-- readme:status -->';
export const END = '<!-- /readme:status -->';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n) => WORDS[n] ?? String(n);

// The highest slice any requirement names: the number of slices.
function slices(copy) {
  const store = read([requirementsGraph(copy)]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const named = [...graph.nodes.values()]
    .filter((n) => n.labels.has('Requirement') && Number.isInteger(n.props.slice))
    .map((n) => n.props.slice);
  return Math.max(0, ...named);
}

/**
 * The status line for a copy of the requirements. The slices done are the run from slice 1 that are all done; the one
 * after them is in progress. `exists` is passed to `sliceDone`, for a test.
 */
export function statusLine(copy, options = {}) {
  const total = slices(copy);
  let done = 0;
  while (done < total && sliceDone(copy, done + 1, options).done) done += 1;
  const head = `**Status: in development.** It is not in the community plugin directory yet. It is built in ${count(total)} slices.`;
  if (done === 0) return `${head} Slice 1 is in progress.`;
  if (done === total) return `${head} All ${count(total)} are done.`;
  const finished = done === 1 ? 'Slice 1 is done' : `Slices 1 to ${done} are done`;
  return `${head} ${finished}, and slice ${done + 1} is in progress.`;
}

/** The README with its status line, between the markers, set to `line`. Throws when a marker is missing. */
export function withStatus(readme, line) {
  const from = readme.indexOf(START);
  const to = readme.indexOf(END);
  if (from === -1 || to < from) throw new Error(`${README} has no ${START} … ${END} markers`);
  return `${readme.slice(0, from + START.length)}\n${line}\n${readme.slice(to)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const line = statusLine(readFileSync(join(ROOT, REQUIREMENTS), 'utf8'));
  if (process.argv.includes('--write')) {
    const file = join(ROOT, README);
    writeFileSync(file, withStatus(readFileSync(file, 'utf8'), line));
  } else console.log(line);
}
