// An estimated link, tapped (spec §3; device check V-06, Roger, 11 Oct 2026: "I can't click on the estimated link to
// review it / edit it / fix it. Make that simple (quick fix or full edit options)"): it is selected as any link is, and
// its details offer the quick fix, which accepts the estimate with its problem's own fix, and Edit the link, which opens
// the editor with the misspelt name selected, where the fix bar offers the same fix.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { fakeContext } from './host/fake-obsidian.js';
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

/** Taps estimated link `n` of the drawing, as a finger does. */
const tapGuess = (el, n = 0) => {
  // by its number among the estimates: Graphviz may write the links in another order
  const guess = el.querySelectorAll('g.edge').find((g) => g.getAttribute('data-estimate') === String(n)),
    vp = el.querySelector('.graph-note-viewport');
  vp.dispatch('pointerdown', { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
  vp.dispatch('pointerup', { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
  return guess;
};
const details = (el) => el.querySelector('.graph-note-details');

/** Draws the note's block where Obsidian's reading view puts it, as block-reading-view.test.js does. */
async function showReading(env) {
  const text = env.state.files.get(PATH),
    lines = text.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
  const el = host.createDiv({ cls: 'markdown-preview-view' }).createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(text, open));
  return el;
}

// review of #85: the fix took the first match of the word on its line, even inside quotes or in another link
const TWO_LINE = "(eyes)-[:FAVOURS {why: 'small_reeder'}]->(small_reeder), (q)-[:ANSWERS]->(small_reeder)";
const TWO = BLOCK.replace('(eyes)-[:FAVOURS]->(small_reeder)', TWO_LINE);
const TWO_NOTE = ['# Reader', '', fence(TWO), ''].join('\n');
/** Each link's own word, at its end: never the one in quotes. */
const own = (n) => (n ? TWO.lastIndexOf('small_reeder') : TWO.indexOf('>(small_reeder)') + 2);
const fixedAt = (text, at) => text.slice(0, at) + 'small_reader' + text.slice(at + 'small_reeder'.length);

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
      const el = await showReading(env);
      assert.ok(tapGuess(el).classList.contains('is-selected'), 'it is selected, as any link is');
      assert.match(details(el).textContent, /taken to mean small_reader/, 'it is still explained');
      assert.equal(!!labelled(details(el), FIX), false);
      assert.equal(!!labelled(details(el), 'Edit the link'), false);
    } finally {
      env.uninstall();
    }
  });

  // review of #85: full screen is put on the page's body, outside reading view, so it must take the card's read-only
  test('in full screen opened from reading view neither is offered, and the note is never written', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await showReading(env);
      labelled(el, 'Full screen').click();
      const full = env.doc.body.querySelector('.graph-note-fullscreen');
      assert.ok(full, 'full screen is open');
      tapGuess(full);
      assert.match(details(full).textContent, /taken to mean small_reader/, 'it is still explained');
      // as booleans: a failing assertion on an element would print the whole page
      assert.equal(!!labelled(details(full), FIX), false, 'no quick fix');
      assert.equal(!!labelled(details(full), 'Edit the link'), false, 'no Edit the link');
      assert.equal(!!labelled(full, 'Edit here'), false, 'nor Edit here in its bar');
      assert.equal(!!labelled(full, 'Edit in pane'), false, 'nor Edit in pane');
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  // review of #85: what was typed since the drawing was made is never written over by a fix made for the old text
  test('while edited in place, a fix pressed after typing writes nothing over what was typed, and says so', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapGuess(el);
      const fix = labelled(details(el), FIX),
        t = el.querySelector('textarea'),
        typed = BLOCK + ',\n(tablet:Option)';
      t.value = typed;
      t.setSelectionRange(typed.length, typed.length);
      t.dispatch('input');
      fix.click();
      await until(() => /nothing was written/.test(fix.parentElement.textContent), 2000);
      assert.equal(t.value, typed, 'what was typed is kept');
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

  test('in the pane, a fix pressed after typing writes nothing over what was typed, and says so', async () => {
    const env = await openPane({ note: NOTE });
    try {
      const drawing = () => env.el.querySelector('.graph-note-pane-drawing');
      await until(() => !!drawing().querySelector('g.edge[data-estimate]'), 3000);
      tapGuess(drawing());
      const fix = labelled(details(drawing()), FIX),
        t = textarea(env.el),
        typed = BLOCK + ',\n(tablet:Option)';
      t.value = typed;
      t.setSelectionRange(typed.length, typed.length);
      t.dispatch('input');
      fix.click();
      await until(() => /nothing was written/.test(fix.parentElement.textContent), 2000);
      assert.equal(t.value, typed, 'what was typed is kept');
    } finally {
      env.uninstall();
    }
  });

  test('in the pane, a fix pressed once its editor is gone writes nothing, and says so', async () => {
    const env = await openPane({ note: NOTE });
    try {
      const drawing = () => env.el.querySelector('.graph-note-pane-drawing');
      await until(() => !!drawing().querySelector('g.edge[data-estimate]'), 3000);
      tapGuess(drawing());
      const fix = labelled(details(drawing()), FIX);
      env.pane.editor.detach(); // as when the pane's editor leaves the page
      fix.click();
      await until(() => /nothing was written/.test(fix.parentElement.textContent), 2000);
      assert.equal(paneNote(env), NOTE);
    } finally {
      env.uninstall();
    }
  });
});

describe('the fix of an estimated link acts on its own word', () => {
  // review of #85: a word in quotes on its line, and another link's on the same line, are left as they are
  test('the quick fix changes each link’s own word, never one in quotes or another link’s', async () => {
    for (const n of [0, 1]) {
      const env = await load({ files: { [PATH]: TWO_NOTE } });
      try {
        const el = await show(env);
        tapGuess(el, n);
        labelled(details(el), FIX).click();
        const want = TWO_NOTE.replace(TWO, fixedAt(TWO, own(n)));
        await until(() => env.state.files.get(PATH) === want, 2000);
      } finally {
        env.uninstall();
      }
    }
  });

  test('Edit the link selects the link’s own word, and the fix bar’s fix for it changes only that word', async () => {
    const env = await load({ files: { [PATH]: TWO_NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapGuess(el, 1);
      labelled(details(el), 'Edit the link').click();
      const t = el.querySelector('textarea');
      assert.deepEqual([t.selectionStart, t.selectionEnd], [own(1), own(1) + 'small_reeder'.length]);
      const offered = el.querySelector('.graph-note-fixbar').querySelectorAll('button');
      assert.equal(offered.length, 2, 'both links’ fixes, on their line');
      offered[1].click();
      assert.equal(t.value, fixedAt(TWO, own(1)), 'the second link’s word, and nothing else');
    } finally {
      env.uninstall();
    }
  });
});
