// The block editor stopped by a copy of its block it cannot tell from the block (editor spec §9,
// block_followed_not_its_copy): the stop is said once in the draft banner, what is typed after it is held, never lost,
// and Open again goes on with the block, keeping what was typed as a draft. The review of #465, 15 Oct 2026: every
// debounced write saved the draft again and showed the banner again, and the pane's picker could not choose the block
// it was already on.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { READER, NOTE, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

const MORE = READER + ",\n(price:Reason {title: 'Costs more'})";
/** Lets every promise already settled run its callbacks. */
const flush = () => new Promise((r) => setImmediate(r));
const drafts = (env) => Object.values(env.state.data?.drafts ?? {}).map((d) => d.text);
const undoButton = (env) => labelled(env.el, 'Undo');

/** The pane on the reader block, MORE written into it, then a copy of the block pasted beside it from outside. */
async function stopped() {
  const env = await open();
  type(env.el, MORE);
  await until(() => note(env) === NOTE.replace(READER, MORE));
  const pasted = note(env).replace(fence(MORE), fence(MORE) + '\n\n' + fence(MORE));
  await env.app.vault.modify({ path: PATH }, pasted);
  await until(() => undoButton(env)?.getAttribute('aria-disabled') === 'true');
  assert.match(undoButton(env).getAttribute('aria-description'), /copy of this block/);
  return { env, pasted };
}

describe('stopped by a copy of its block', () => {
  test('the stop is said once: typing after it is held, not saved again, and Open again keeps it as a draft', async (t) => {
    const { env, pasted } = await stopped();
    try {
      const first = MORE + ',\n(one:Reason)';
      type(env.el, first);
      await until(() => drafts(env).includes(first));
      const banner = env.el.querySelector('.graph-note-draft');
      assert.match(banner.textContent, /copy of this block/);
      assert.doesNotMatch(banner.textContent, /reloaded/);
      // the next debounced write, on the test's own mock clock: held, the draft and the banner as they were
      const real = { setTimeout: env.doc.defaultView.setTimeout, clearTimeout: env.doc.defaultView.clearTimeout };
      t.mock.timers.enable({ apis: ['setTimeout'] });
      Object.assign(env.doc.defaultView, { setTimeout, clearTimeout });
      const second = first + ',\n(two:Reason)';
      type(env.el, second);
      t.mock.timers.tick(2000);
      await flush();
      t.mock.timers.reset();
      Object.assign(env.doc.defaultView, real);
      assert.deepEqual(drafts(env), [first], 'not saved again on every debounced write');
      assert.equal(textarea(env.el).value, second, 'what was typed stays in the field');
      assert.equal(note(env), pasted, 'nothing written into either block');
      labelled(env.el, 'Open again').click();
      await until(() => undoButton(env)?.getAttribute('aria-disabled') !== 'true');
      assert.deepEqual(drafts(env), [second], 'what was typed since is kept as the draft, never lost');
      assert.equal(textarea(env.el).value, MORE, 'the block open again, as the note has it');
      assert.equal(labelled(env.el, 'Open again'), undefined);
    } finally {
      env.uninstall();
    }
  });

  test('Open again with nothing typed goes on with the block, its own history started', async () => {
    const { env, pasted } = await stopped();
    try {
      labelled(env.el, 'Open again').click();
      await until(() => undoButton(env)?.getAttribute('aria-disabled') !== 'true');
      type(env.el, MORE + ',\n(again:Reason)');
      await until(() => note(env) !== pasted);
      assert.equal(note(env), pasted.replace(fence(MORE), fence(MORE + ',\n(again:Reason)')));
    } finally {
      env.uninstall();
    }
  });
});
