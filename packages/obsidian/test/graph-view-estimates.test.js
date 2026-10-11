// An estimated link, tapped (spec §3; device check V-06, Roger, 11 Oct 2026: "I can't click on the estimated link to
// review it / edit it / fix it. Make that simple (quick fix or full edit options)"): it is selected as any link is, and
// its details offer the quick fix, which accepts the estimate with its problem's own fix, and Edit the link, which opens
// the editor with the misspelt name selected, where the fix bar offers the same fix.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { open as openPane, textarea, note as paneNote } from './host/pane-notes.js';

before(() => build());

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(small_reeder)`;
const NOTE = ['# Reader', '', fence(BLOCK), ''].join('\n');
const FIXED = NOTE.replace('small_reeder', 'small_reader');
const FIX = 'Change small_reeder to small_reader';

/** Taps the estimated link, as a finger does. */
const tapGuess = (el) => {
  const guess = el.querySelector('g.edge[data-estimate]'),
    vp = el.querySelector('.graph-note-viewport');
  vp.dispatch('pointerdown', { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
  vp.dispatch('pointerup', { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
  return guess;
};
const details = (el) => el.querySelector('.graph-note-details');

describe('an estimated link, tapped', () => {
  test('it offers the quick fix and Edit the link, beside the sentence that explains it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      tapGuess(el);
      assert.match(details(el).textContent, /taken to mean small_reader/);
      assert.ok(labelled(details(el), FIX), 'the quick fix, named as the fix bar names it');
      assert.ok(labelled(details(el), 'Edit the link'), 'and the full edit');
    } finally {
      env.uninstall();
    }
  });

  test('the quick fix writes what the estimate was taken to mean into the note, every other byte kept', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      tapGuess(el);
      labelled(details(el), FIX).click();
      await until(() => env.state.files.get(PATH) === FIXED, 2000);
    } finally {
      env.uninstall();
    }
  });

  test('a note changed since it was drawn is never written over: the quick fix writes nothing and says why', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      tapGuess(el);
      const changed = NOTE.replace("'Which device?'", "'Which one?'");
      env.state.files.set(PATH, changed);
      labelled(details(el), FIX).click();
      await until(() => /nothing was written/.test(details(el).textContent), 2000);
      assert.equal(env.state.files.get(PATH), changed);
    } finally {
      env.uninstall();
    }
  });

  test('while the block is edited in place, the quick fix changes the text being edited, as the fix bar does', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapGuess(el);
      labelled(details(el), FIX).click();
      assert.equal(el.querySelector('textarea').value, BLOCK.replace('small_reeder', 'small_reader'));
      await until(() => env.state.files.get(PATH) === FIXED, 2000);
    } finally {
      env.uninstall();
    }
  });

  test('Edit the link opens the editor in place with the misspelt name selected, and the fix bar offers its fix', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      tapGuess(el);
      labelled(details(el), 'Edit the link').click();
      await until(() => {
        const t = el.querySelector('textarea');
        return !!t && t.value.slice(t.selectionStart, t.selectionEnd) === 'small_reeder';
      });
      const t = el.querySelector('textarea');
      assert.equal(t.selectionStart, BLOCK.indexOf('small_reeder'));
      assert.equal(env.doc.activeElement, t, 'the focus in the text, so the selection shows');
      assert.ok(labelled(el.querySelector('.graph-note-fixbar'), FIX), 'the fix bar offers the same fix');
    } finally {
      env.uninstall();
    }
  });

  test('in reading view nothing can be written, so neither is offered', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const el = await show(env);
      host.appendChild(el);
      assert.ok(tapGuess(el).classList.contains('is-selected'), 'it is selected, as any link is');
      assert.match(details(el).textContent, /taken to mean small_reader/, 'it is still explained');
      assert.equal(labelled(details(el), FIX), undefined);
      assert.equal(labelled(details(el), 'Edit the link'), undefined);
    } finally {
      env.uninstall();
    }
  });

  test('in the pane, the quick fix changes the pane’s text, and Edit the link selects the misspelt name in it', async () => {
    const env = await openPane({ note: NOTE });
    try {
      const drawing = () => env.el.querySelector('.graph-note-pane-drawing');
      await until(() => !!drawing().querySelector('g.edge[data-estimate]'), 3000);
      tapGuess(drawing());
      labelled(details(drawing()), 'Edit the link').click();
      const t = textarea(env.el);
      assert.equal(t.value.slice(t.selectionStart, t.selectionEnd), 'small_reeder');
      labelled(details(drawing()), FIX).click();
      assert.equal(t.value, BLOCK.replace('small_reeder', 'small_reader'));
      await until(() => paneNote(env) === FIXED, 2000);
    } finally {
      env.uninstall();
    }
  });
});
