// The block editor stopped by a copy of its block it cannot tell from the block (editor spec §9,
// block_followed_not_its_copy): the stop is said once in the draft banner, what is typed after it is saved quietly as
// the draft at each pause, never lost, and Open again goes on with the block, keeping what was typed as a draft. The
// review of #465, 15 Oct 2026: every debounced write showed the banner again, and the pane's picker could not choose
// the block it was already on.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { READER, NOTE, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

const MORE = READER + ",\n(price:Reason {title: 'Costs more'})";
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
  // the coordinator, 15 Oct 2026: typing is never held in memory alone, so a crash loses nothing; only the banner is once
  test('the stop is said once: typing after it is saved quietly as the draft at each pause, and Open again keeps it', async () => {
    const { env, pasted } = await stopped();
    try {
      const first = MORE + ',\n(one:Reason)';
      type(env.el, first);
      await until(() => drafts(env).includes(first));
      const banner = env.el.querySelector('.thoughtknot-draft');
      assert.match(banner.textContent, /copy of this block/);
      assert.doesNotMatch(banner.textContent, /reloaded/);
      const said = banner.querySelector('p'),
        notices = env.state.notices.length;
      // the next pause in typing: the draft saved again, with no banner shown again and no notice
      const second = first + ',\n(two:Reason)';
      type(env.el, second);
      await until(() => drafts(env).includes(second));
      assert.deepEqual(drafts(env), [second], 'the one draft of this editor, saved in place');
      assert.ok(banner.querySelector('p') === said && !banner.hidden, 'the banner shown once, as it was');
      assert.equal(env.state.notices.length, notices, 'no notice');
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

  // the re-review of #465, 15 Oct 2026: an outside change while typing was pending wrote at once, saying the stop again
  test('a change from outside while typing waits: the draft saved quietly, the banner still shown once', async () => {
    const { env, pasted } = await stopped();
    try {
      const first = MORE + ',\n(one:Reason)';
      type(env.el, first);
      await until(() => drafts(env).includes(first));
      const banner = env.el.querySelector('.thoughtknot-draft'),
        said = banner.querySelector('p'),
        notices = env.state.notices.length;
      const second = first + ',\n(two:Reason)';
      type(env.el, second);
      const theirs = pasted.replace('Between.', 'Between, changed.');
      await env.app.vault.modify({ path: PATH }, theirs);
      await until(() => drafts(env).includes(second));
      assert.ok(banner.querySelector('p') === said && !banner.hidden, 'the banner shown once, as it was');
      assert.equal(env.state.notices.length, notices, 'no notice');
      assert.equal(note(env), theirs, 'nothing written into either block');
    } finally {
      env.uninstall();
    }
  });
});

/** The picker's options, as their labels. */
const labels = (env) => (env.el.querySelector('select')?.querySelectorAll('option') ?? []).map((o) => o.textContent);
const W = "// graph: other\n(w:Thing {name: 'W'})";

// the re-review of #465, 15 Oct 2026: Open again opened whatever block was on the last line known, of any graph
describe('Open again finds a block of its graph', () => {
  test('another graph’s block on its line: the first block of its own graph is opened instead', async () => {
    const { env, pasted } = await stopped();
    try {
      await env.app.vault.modify({ path: PATH }, pasted.replace(fence(MORE), fence(W)));
      await until(() => labels(env).includes('other · line 3'));
      labelled(env.el, 'Open again').click();
      await until(() => undoButton(env)?.getAttribute('aria-disabled') !== 'true');
      assert.equal(textarea(env.el).value, MORE, 'the reader block left, never the other graph’s');
    } finally {
      env.uninstall();
    }
  });

  test('no block of its graph left: said in a notice, and no other block opened', async () => {
    const { env, pasted } = await stopped();
    try {
      await env.app.vault.modify({ path: PATH }, pasted.replaceAll(fence(MORE), fence(W)));
      await until(() => labels(env).includes('other · line 3'));
      const shown = textarea(env.el).value;
      labelled(env.el, 'Open again').click();
      await until(() => env.state.notices.some((n) => /no longer in the note/.test(n)));
      assert.equal(textarea(env.el).value, shown, 'nothing else opened');
    } finally {
      env.uninstall();
    }
  });
});
