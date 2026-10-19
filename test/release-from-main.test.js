// A stable release is built only from a tag on main (spec §13 release_from_main, risk OPS-2). The first job of
// release.yml checks the tag before anything is installed. Read as text, as policy.test.js reads the workflows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jobs, read, runCommands, stripComment } from './repository/repo.js';

describe('the release workflow', () => {
  // Risk OPS-2: a tag pushed on another branch, or on a stale checkout, would ship code that never passed main's checks.
  test('a stable release is built only from a tag on main, checked before anything is installed', () => {
    const all = jobs(read('.github/workflows/release.yml'));
    const gate = all['on-main'];
    assert.ok(gate, 'release.yml has an on-main job');
    const runs = runCommands(gate.join('\n'));
    assert.ok(runs.length, 'the on-main job runs its checks');
    assert.ok(
      runs.every((r) => !/\bnpm\b|\bnpx\b|\buv\b|\bpip\b/.test(r)),
      'the on-main job installs nothing, so a wrong tag fails in seconds',
    );
    assert.match(
      runs.join('\n'),
      /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/,
      'the tagged commit is on main',
    );
    assert.match(runs.join('\n'), /manifest\.json/, 'the tag matches the manifest version');
    const needs = (lines) =>
      (lines.map(stripComment).find((l) => /^ {4}needs:/.test(l)) ?? '').replace(/^ {4}needs:/, '').match(/[\w-]+/g) ??
      [];
    const reaches = (name, seen = new Set()) =>
      needs(all[name]).some((n) => n === 'on-main' || (!seen.has(n) && seen.add(n) && reaches(n, seen)));
    for (const name of Object.keys(all).filter((n) => n !== 'on-main')) {
      assert.ok(reaches(name), `job ${name} waits for on-main`);
    }
  });
});
