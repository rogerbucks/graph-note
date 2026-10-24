// Ready for GitHub's merge queue (Eve, #825, 24 Oct 2026). Each workflow behind a required check also runs on
// merge_group, and finds the base it compares with there. Pull requests and pushes run as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

test('the workflows behind the required checks run in the merge queue too', () => {
  for (const file of ['ci.yml', 'dependency-review.yml']) {
    const text = read(`.github/workflows/${file}`);
    const on = text.slice(text.indexOf('\non:\n'), text.search(/\n(permissions|concurrency|jobs):/));
    assert.match(on, /\n {2}pull_request:\n[\s\S]*\n {2}merge_group:\n/, file);
    for (const base of text.match(/github\.event\.pull_request\.base\.sha[^}]*/g) ?? [])
      assert.match(base, /github\.event\.merge_group\.base_sha/, `${file}: ${base}`);
  }
});
