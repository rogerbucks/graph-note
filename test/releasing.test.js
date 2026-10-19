// RELEASING.md holds what a person needs to cut a release, take one back and recover the keys. That is spec §13
// release_steps_written, for risks OPS-3 and OPS-1. Each secret a workflow uses is named there. So a new secret comes
// with where it is made and what to do if it is lost.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, workflowFiles } from './repository/repo.js';

const doc = read('RELEASING.md');
const section = (title) => {
  const at = doc.indexOf(`\n## ${title}\n`);
  assert.ok(at >= 0, `RELEASING.md has a "${title}" section`);
  const next = doc.indexOf('\n## ', at + 1);
  return doc.slice(at, next === -1 ? undefined : next);
};

describe('RELEASING.md', () => {
  test('lists the steps of a release in order: bump, dry run, merge, tag, publish', () => {
    const steps = section('Cutting a release');
    const order = ['npm run release:prepare', 'Release check (dry run)', 'Merge', 'git tag', 'Publish the draft'].map(
      (s) => steps.indexOf(s),
    );
    assert.ok(
      order.every((i) => i >= 0),
      'each step is named',
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
      'in order',
    );
    assert.match(steps, /^1\. /m, 'as a numbered list');
    assert.match(steps, /cd ~\/Dev\/thoughtknot && /, 'the tag command starts from the checkout');
  });

  test('says how a bad release is followed, and that a tag is never moved', () => {
    const back = section('Going back');
    assert.match(back, /patch release/);
    assert.match(back, /delete the draft/i);
    assert.match(back, /Never move or reuse a tag/);
  });

  test('names every secret a workflow uses, and how the settings are put back', () => {
    const keys = section('Keys and recovery');
    const secrets = new Set(
      workflowFiles().flatMap((f) => [...read(f).matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])),
    );
    assert.ok(secrets.size, 'the control: the workflows use secrets');
    for (const s of secrets) assert.match(keys, new RegExp(`\`${s}\``), s);
    assert.match(keys, /node scripts\/public-readiness\.mjs --settings --apply|`--settings --apply`/);
    assert.match(keys, /thoughtknot\.app/);
  });
});
