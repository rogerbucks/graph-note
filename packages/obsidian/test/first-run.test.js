// A first graph from an example, then a short tour (editor spec §44, first_run_help). A graph with nothing in it yet
// offers Start from an example. Pressed, it writes the example into the note, and the drawing that follows opens the
// tour. The tour can be skipped, and a command opens it again on the drawing last used.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const EMPTY = ['# Team', '', fence('// graph: team'), ''].join('\n');
const tourOf = (el) => el.querySelector('.thoughtknot-tour');

/** Waits for the promises waiting now. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** The empty graph's card, its example pressed: the note as it was written, and the card drawn from it. */
async function started() {
  const env = await load({ files: { [PATH]: EMPTY } });
  const { el } = await show(env, EMPTY);
  const start = labelled(el, 'Start from an example');
  assert.ok(start, 'the empty graph offers an example');
  start.click();
  await settle();
  const note = env.state.files.get(PATH);
  const drawn = await show(env, note);
  return { env, note, el: drawn.el };
}

describe('a first graph from an example', () => {
  // proves: first_run_help
  test('Start from an example writes the example into the empty graph', async () => {
    const { env, note, el } = await started();
    try {
      assert.ok(note.startsWith('# Team\n\n```gql\n// graph: team\n('), note);
      assert.ok(el.querySelector('svg'), 'and it is drawn');
    } finally {
      env.uninstall();
    }
  });

  // proves: first_run_help
  test('the drawing that follows opens a short tour, a step at a time', async () => {
    const { env, el } = await started();
    try {
      const tour = tourOf(el);
      assert.ok(tour, 'the tour opens');
      assert.equal(tour.getAttribute('role'), 'dialog');
      assert.match(tour.textContent, /Step 1 of \d/);
      labelled(tour, 'Next step').click();
      assert.match(tourOf(el).textContent, /Step 2 of/);
      labelled(tourOf(el), 'Step back').click();
      assert.match(tourOf(el).textContent, /Step 1 of/);
    } finally {
      env.uninstall();
    }
  });

  // proves: first_run_help
  test('the tour can be skipped, and a command opens it again', async () => {
    const { env, el } = await started();
    try {
      labelled(tourOf(el), 'Skip the tour').click();
      assert.equal(tourOf(el), null, 'skipped');
      const again = await show(env, env.state.files.get(PATH));
      assert.equal(tourOf(again.el), null, 'and not shown again on its own');
      again.el.querySelector('.thoughtknot-viewport').focus();
      const command = env.state.commands.find((c) => c.id === 'tour');
      assert.equal(command.checkCallback(true), true);
      command.checkCallback(false);
      assert.match(tourOf(again.el)?.textContent ?? '', /Step 1 of/, 'opened again');
      tourOf(again.el).dispatch('keydown', { key: 'Escape' });
      assert.equal(tourOf(again.el), null, 'Escape skips it too');
    } finally {
      env.uninstall();
    }
  });
});
