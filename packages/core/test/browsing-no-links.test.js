// Moving between altitudes leaves no links (editor spec §32, browsing_leaves_no_links). A descent with nothing after it
// leaves no link and its log entry fades. A descent followed by a new link is labelled consequence-bearing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AltitudeTrail, FADE_AFTER } from '../src/browsing.ts';

describe('browsing_leaves_no_links', () => {
  test('a descent with nothing after it leaves no link, and its log entry fades', () => {
    const trail = new AltitudeTrail();
    trail.move({ from: 'loan-life', to: 'servicing', kind: 'descend', at: 0 });
    trail.move({ from: 'servicing', to: 'loan-life', kind: 'ascend', at: 1000 });
    assert.deepEqual(trail.links(), []);
    assert.equal(trail.log(2000).length, 2);
    assert.equal(trail.log(FADE_AFTER + 1001).length, 0);
    assert.equal(trail.consequence('link'), null);
  });

  test('a descent followed by a new link is kept, labelled consequence-bearing', () => {
    const trail = new AltitudeTrail();
    trail.move({ from: 'loan-life', to: 'arrears', kind: 'descend', at: 0 });
    const kept = trail.consequence('link');
    assert.deepEqual(kept, { from: 'loan-life', to: 'arrears', label: 'consequence-bearing', because: 'link' });
    assert.deepEqual(trail.links(), [kept]);
    trail.move({ from: 'arrears', to: 'fees', kind: 'sideways', at: 10 });
    assert.equal(trail.consequence('note'), null);
    assert.equal(trail.links().length, 1);
  });
});
