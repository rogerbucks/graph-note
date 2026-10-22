// The research note on massive graphs (editor spec §53, scale_design): wiki/Massive-graphs-design.md. It must be in
// the wiki, compare the ways with measured numbers, take numbers from the scale benchmark, and record Roger's pick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

const NOTE = 'wiki/Massive-graphs-design.md';

/** The text of the note's section under `heading`, up to the next heading of the same level or higher. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${NOTE} has a section "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return next < 0 ? rest : rest.slice(0, next);
}

test('the note is in the wiki and linked from the architecture page', () => {
  assert.match(read(NOTE), /^# Massive graphs design\n/);
  assert.match(read('wiki/Architecture.md'), /\(Massive-graphs-design\)/);
});

test('the note compares the ways A to F, each with its speed at 50,000 things', () => {
  const ways = section(read(NOTE), '## The ways compared');
  for (const way of ['A', 'B', 'C', 'D', 'E', 'F']) assert.match(ways, new RegExp(`^\\| \\**${way}\\. `, 'm'), way);
  // the numbers are measured: each table of what was measured has seconds or milliseconds in it
  const measured = section(read(NOTE), '## What was measured');
  assert.match(measured, /\d+(\.\d+)? s\b/);
  assert.match(measured, /\d+(\.\d+)? ms\b/);
});

test('the note takes numbers from the scale benchmark, at each of its sizes', () => {
  const bench = section(read(NOTE), "### Today's code, measured by the scale benchmark");
  assert.match(bench, /npm run bench:scale/);
  for (const size of ['1×', '10×', '100×']) assert.match(bench, new RegExp(`^\\| ${size} `, 'm'), size);
});

test('the note records the way Roger picked, with the date', () => {
  const decision = section(read(NOTE), '## Decision');
  assert.doesNotMatch(decision, /Recorded here once picked/);
  assert.match(decision, /On \d{1,2} \w+ 20\d\d Roger chose way E/);
});
