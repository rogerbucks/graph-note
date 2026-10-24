// A process view is worked out when first asked for, kept, and built again only when the core changes (editor spec
// §34, process_views_cached). Reopening a view with no core change uses the kept view, and a core change rebuilds it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { graphOf, ProcessViews } from '../src/process-core.ts';

const steps = (extra = {}) =>
  graphOf(
    [
      ['a', ['Step'], extra],
      ['b', ['Step'], {}],
    ],
    [['a', 'TRANSITION', 'b']],
  );

describe('process_views_cached', () => {
  test('nothing is worked out until a view is asked for', () => {
    assert.equal(new ProcessViews(steps()).builds, 0);
  });

  test('reopening a view with no core change uses the kept view', () => {
    const views = new ProcessViews(steps());
    const first = views.open('pipeline');
    assert.equal(views.open('pipeline'), first);
    assert.equal(views.builds, 1);
  });

  test('a change to a view setting alone keeps the view', () => {
    const views = new ProcessViews(steps());
    const first = views.open('pipeline');
    assert.equal(views.update(steps({ x: 5 })), false);
    assert.equal(views.open('pipeline'), first);
    assert.equal(views.builds, 1);
  });

  test('a core change rebuilds it', () => {
    const views = new ProcessViews(steps());
    const first = views.open('pipeline');
    assert.equal(views.update(steps({ name: 'Start' })), true);
    const again = views.open('pipeline');
    assert.notEqual(again, first);
    assert.equal(views.builds, 2);
    assert.notEqual(again.core, first.core);
  });
});
