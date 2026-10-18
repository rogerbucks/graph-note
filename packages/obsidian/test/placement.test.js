// Where a drawing's card is placed, and waiting for it to be placed (spec §3, §4). Live Preview puts a card on the page
// only once it is scrolled to, and cards drawn while the layout engine starts wait for it; what the card offers, Edit
// here above all, must work however late it is placed, and nothing may be left polling while cards wait.
import { test, describe, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show, showLate } from './host/card-notes.js';

const flush = () => new Promise((r) => setImmediate(r));

describe('waiting for a card to be put on the page', () => {
  test('a card put on the page long after it was drawn is still acted on, once', async () => {
    const doc = fakeDocument(),
      uninstall = installGlobals(doc);
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      const { whenPlaced } = await import('../../core/src/display/graph-view/placement.ts');
      const el = doc.createElement('div');
      let placed = 0;
      whenPlaced(el, () => placed++);
      mock.timers.tick(5000);
      assert.equal(placed, 0, 'not before it is on the page');
      doc.body.appendChild(el);
      mock.timers.tick(100);
      mock.timers.reset();
      await flush();
      assert.equal(placed, 1);
    } finally {
      mock.timers.reset();
      uninstall();
    }
  });

  test('a card unloaded before it is placed is never acted on', async () => {
    const doc = fakeDocument(),
      uninstall = installGlobals(doc);
    try {
      const { whenPlaced } = await import('../../core/src/display/graph-view/placement.ts');
      const el = doc.createElement('div');
      let placed = 0,
        wanted = true;
      whenPlaced(
        el,
        () => placed++,
        () => wanted,
      );
      wanted = false;
      doc.body.appendChild(el);
      await flush();
      assert.equal(placed, 0);
    } finally {
      uninstall();
    }
  });

  test('nothing polls while cards wait, and nothing watches the page once none waits', async () => {
    const doc = fakeDocument(),
      uninstall = installGlobals(doc);
    let timers = 0;
    const real = doc.defaultView.setTimeout;
    doc.defaultView.setTimeout = (...a) => (timers++, real(...a));
    try {
      const { whenPlaced } = await import('../../core/src/display/graph-view/placement.ts');
      const cards = [1, 2, 3].map(() => doc.createElement('div'));
      let placed = 0;
      for (const c of cards) whenPlaced(c, () => placed++);
      await new Promise((r) => real(r, 50));
      assert.equal(timers, 0, 'no timer runs while they wait');
      assert.equal(doc.mutationObservers?.size, 1, 'one watcher for all of them');
      for (const c of cards) doc.body.appendChild(c);
      await flush();
      assert.equal(placed, 3);
      assert.equal(doc.mutationObservers.size, 0, 'and none once all are placed');
    } finally {
      doc.defaultView.setTimeout = real;
      uninstall();
    }
  });
});

describe('a card placed late, in the note', () => {
  before(() => build());

  test('Edit here on a card put on the page late, as one scrolled to, opens its editor there', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el, placed } = await showLate(env, 2500);
      await placed;
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('.thoughtknot-view textarea'), 2000);
      assert.equal(el.querySelector('.thoughtknot-view textarea').value, READER);
    } finally {
      env.uninstall();
    }
  });

  test('the editor moves into a redrawn card placed late, and Done there closes it with what was typed in the note', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const first = await show(env);
      labelled(first, 'Edit here').click();
      await until(() => !!first.querySelector('textarea'));
      const t = first.querySelector('textarea');
      const typed = READER + ",\n(small:Option {name: 'Small reader'})";
      t.value = typed;
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes('Small reader'), 2000);
      first.remove();
      const { el, placed } = await showLate(env, 2500);
      await placed;
      await until(() => el.querySelector('textarea') === t, 2000);
      labelled(el, 'Done').click();
      await until(() => !el.querySelector('textarea'), 2000);
      assert.equal(env.state.files.get(PATH), NOTE.replace(READER, typed));
      assert.ok(labelled(el, 'Edit here'), 'the card offers Edit here again');
    } finally {
      env.uninstall();
    }
  });

  test('Edit here leaves the page where it is: the focus moves into the editor without scrolling to it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      env.doc.scrolledToFocus = 0;
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'), 2000);
      await until(() => env.doc.activeElement === el.querySelector('textarea'), 1000);
      assert.equal(env.doc.scrolledToFocus, 0, 'no focus scrolled the page');
    } finally {
      env.uninstall();
    }
  });

  test('Edit here on a card that is not on the page says so, rather than doing nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await showLate(env, 3000);
      labelled(el, 'Edit here').click();
      await until(() => env.state.notices.some((n) => /not on the page/i.test(n)), 1000);
      assert.equal(el.querySelector('textarea'), null);
    } finally {
      env.uninstall();
    }
  });
});
