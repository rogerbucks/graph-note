// The README's status line is made from the requirements graph (spec §41, readme_status_generated). So it never drifts
// from how far the slices are proved. `node scripts/readme-status.mjs --write` puts the line right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';
import { END, START, statusLine, withStatus } from '../scripts/readme-status.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';

test('the README status line equals the one made from the requirements graph', () => {
  const readme = read('README.md');
  const between = readme.slice(readme.indexOf(START) + START.length, readme.indexOf(END)).trim();
  assert.ok(readme.includes(START) && readme.includes(END), 'README.md has the status markers');
  assert.equal(between, statusLine(read(REQUIREMENTS)), 'run node scripts/readme-status.mjs --write');
});

test('the line names how many slices there are, which are done and which is in progress', () => {
  const line = statusLine(read(REQUIREMENTS));
  assert.match(line, /built in \w+ slices\./);
  assert.match(line, /(Slice 1 is in progress|Slice 1 is done|Slices 1 to \d+ are done|All \w+ are done)/);
});

test('a slice whose test is not written leaves it in progress, so the line moves back', () => {
  const copy = read(REQUIREMENTS);
  const nothing = () => false;
  assert.match(statusLine(copy, { exists: nothing }), /Slice 1 is in progress\.$/);
});

test('only the text between the markers is replaced, and a README without them is refused', () => {
  const readme = `# Title\n\n${START}\nold\n${END}\n\nRest.\n`;
  assert.equal(withStatus(readme, 'new'), `# Title\n\n${START}\nnew\n${END}\n\nRest.\n`);
  assert.throws(() => withStatus('# Title\n', 'new'), /markers/);
});
