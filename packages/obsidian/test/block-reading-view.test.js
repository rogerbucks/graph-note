// A graph block in reading view (spec §3 "Read-only in Reading view", §4; decided 9 Oct 2026): read-only, with Source in
// place of Edit, and never taking the editor in place.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, READER, NOTE, showIn } from './host/card-notes.js';

before(() => build());

describe('reading view is read-only', () => {
  // Decided by Roger, 9 Oct 2026 (spec §3 "Read-only in Reading view", §4 "In the editing view only"): a graph is edited
  // only where the note is edited, in Live Preview or Source mode, or in the pane. In reading view the bar offers Source
  // in place of Edit: the block's text, coloured and read-only, in place of the drawing, and back.
  test('in reading view the bar offers Source, and neither Edit here nor Edit in pane', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      for (const offPage of [false, true]) {
        const el = await showIn(env, 'reading', { offPage });
        await until(() => !labelled(el, 'Edit in pane'), 500).catch(() => {});
        assert.ok(labelled(el, 'Show source'), `Source is offered (${offPage ? 'drawn off the page' : 'on the page'})`);
        assert.ok(labelled(el, 'Edit here') === undefined, 'no Edit here');
        assert.ok(labelled(el, 'Edit in pane') === undefined, 'no Edit in pane');
      }
      const editing = await showIn(env, 'live');
      assert.ok(labelled(editing, 'Edit here') && labelled(editing, 'Edit in pane'), 'Live Preview still edits');
      assert.ok(labelled(editing, 'Show source') === undefined, 'no Source while editing');
    } finally {
      env.uninstall();
    }
  });

  test('Source shows the block’s text, coloured and read-only, in place of the drawing; pressed again, the drawing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await showIn(env, 'reading');
      await until(() => !labelled(el, 'Edit in pane'), 500);
      labelled(el, 'Show source').click();
      const code = el.querySelector('.thoughtknot-view pre.thoughtknot-code');
      assert.ok(code && !code.hidden, 'the text is shown');
      assert.equal(code.textContent.replace(/Copy$/, ''), READER);
      assert.ok(
        code.querySelectorAll('span').some((x) => (x.getAttribute('class') ?? '').startsWith('gql-')),
        'coloured',
      );
      assert.ok(el.querySelector('textarea') === null, 'and read-only');
      assert.ok(el.querySelector('.thoughtknot-viewport').hidden, 'in place of the drawing');
      assert.ok(labelled(el, 'Show source') === undefined, 'Source becomes Show drawing');
      labelled(el, 'Show drawing').click();
      assert.ok(!el.querySelector('.thoughtknot-viewport').hidden, 'the drawing is back');
      assert.ok(el.querySelector('pre.thoughtknot-code').hidden, 'and the text hidden');
      assert.ok(labelled(el, 'Show source'));
    } finally {
      env.uninstall();
    }
  });

  test('a card in reading view never takes the editor in place, while its block is edited in Live Preview', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const live = await showIn(env, 'live');
      labelled(live, 'Edit here').click();
      await until(() => !!live.querySelector('textarea'));
      const t = live.querySelector('textarea');
      const reading = await showIn(env, 'reading', { offPage: true });
      await wait(100);
      assert.ok(reading.querySelector('textarea') === null, 'none in reading view');
      assert.ok(live.querySelector('textarea') === t, 'the box stays in Live Preview');
    } finally {
      env.uninstall();
    }
  });

  test('an empty graph in reading view offers no Edit', async () => {
    const empty = ['# Reader', '', fence('// graph: reader'), ''].join('\n');
    const env = await load({ files: { [PATH]: empty } });
    try {
      const el = await showIn(env, 'reading');
      await wait(50);
      assert.ok(el.querySelector('.thoughtknot-empty'), 'the prompt is shown');
      assert.ok(labelled(el, 'Edit') === undefined, 'no Edit');
    } finally {
      env.uninstall();
    }
  });
});
