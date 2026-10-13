// The edit pane (spec §4, §9): opened beside the note on the block whose Edit was pressed, with a picker when the note has
// several graphs; the text coloured as gql-highlight colours it, each line read back in plain English, the drawing of what
// is typed, and Drawing and Text as two tabs on a phone.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { styles, READER, OTHER, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

describe('its own pane, on the block that was tapped', () => {
  test('Edit opens a pane beside the note, on that block', async () => {
    const env = await open();
    try {
      assert.ok(env.pane, 'a pane');
      assert.equal(env.leaf.how, 'split', 'beside the note');
      assert.equal(env.state.revealed, env.leaf);
      assert.equal(textarea(env.el).value, READER);
    } finally {
      env.uninstall();
    }
  });

  test('opening Edit again reuses the pane, on the new block', async () => {
    const env = await open();
    try {
      await env.plugin.openEditor({ path: PATH, line: 13, graph: 'other' });
      assert.equal(env.app.workspace.getLeavesOfType('graph-note-pane').length, 1);
      assert.equal(textarea(env.el).value, OTHER);
    } finally {
      env.uninstall();
    }
  });

  test('a note with several graph blocks offers a picker, and choosing one opens it', async () => {
    const env = await open();
    try {
      const picker = env.el.querySelector('select');
      assert.equal(picker.getAttribute('aria-label'), 'Graph block');
      assert.deepEqual(
        picker.querySelectorAll('option').map((o) => o.textContent),
        ['reader · line 3', 'other · line 14'],
      );
      picker.value = '13';
      picker.dispatch('change');
      assert.equal(textarea(env.el).value, OTHER);
    } finally {
      env.uninstall();
    }
  });

  test('a note with one graph block has no picker', async () => {
    const env = await open({ note: fence(READER) }, 0);
    try {
      assert.equal(env.el.querySelector('select'), null);
    } finally {
      env.uninstall();
    }
  });

  test('the pane draws what is typed', async () => {
    const env = await open();
    try {
      await until(() => env.el.querySelectorAll('g.node').length === 3);
      type(env.el, READER + ",\n(price:Reason {title: 'Costs more'})");
      await until(() => env.el.querySelectorAll('g.node').length === 4);
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere)');
      await until(() => !!env.el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === '1 problem'));
    } finally {
      env.uninstall();
    }
  });
});

describe('the text', () => {
  let env;
  before(async () => {
    env = await open();
  });
  after(() => env.uninstall());

  test('is coloured with the same tokenizer as gql-highlight', () => {
    const overlay = env.el.querySelector('.graph-note-overlay');
    assert.equal(
      overlay.getAttribute('aria-hidden'),
      'true',
      'the colours are a picture of the text; the text itself is in the field',
    );
    assert.deepEqual(
      overlay.querySelectorAll('span.gql-label').map((s) => s.textContent),
      ['Question', 'Option', 'Reason'],
    );
    assert.deepEqual(
      overlay.querySelectorAll('span.gql-edge').map((s) => s.textContent),
      ['ANSWERS', 'FAVOURS'],
    );
  });

  test('each line is read back in plain English beside it', () => {
    const backs = env.el.querySelectorAll('.graph-note-readback').map((s) => s.textContent);
    assert.ok(
      backs.includes(' — Easy on the eyes —FAVOURS→ Large reader'),
      'a draft’s type shows itself until it has words',
    );
    assert.ok(backs.includes(' — Which device? is a Question'));
  });

  test('the field grows with its text, so it never scrolls apart from its colours', () => {
    assert.equal(textarea(env.el).getAttribute('rows'), String(READER.split('\n').length + 1));
  });

  test('what is hidden stays hidden, whatever the layout rules say', () => {
    assert.match(styles, /\.graph-note-pane \[hidden\],\s*\.graph-note \[hidden\]\s*\{\s*display:\s*none !important;/);
  });

  test('the field is for code: no spelling, no capitals, no autocorrect', () => {
    const t = textarea(env.el);
    assert.equal(t.getAttribute('spellcheck'), 'false');
    assert.equal(t.getAttribute('autocapitalize'), 'off');
  });
});

describe('typing keeps the field', () => {
  // typing_keeps_focus (spec §4, 8 Oct 2026): the pane is never redrawn by Obsidian, so its field keeps the focus, the caret
  // and the undo history while each write redraws the drawing; a control beside the card's tests in inline.test.js
  test('in the pane, each write redraws the drawing and the same field keeps the focus and the caret', async () => {
    const env = await open();
    try {
      const t = textarea(env.el);
      t.focus();
      for (const tail of [",\n(s:Option {name: 'S'})", ",\n(s:Option {name: 'Sm'})"]) {
        type(env.el, READER + tail, READER.length + 4);
        await until(() => note(env).includes(READER + tail), 2000);
        await wait(300);
        assert.ok(textarea(env.el) === t, 'the same field');
        assert.ok(env.doc.activeElement === t, 'still focused');
        assert.equal(t.selectionStart, READER.length + 4);
      }
    } finally {
      env.uninstall();
    }
  });
});

describe('selecting in the pane’s drawing moves the text to it', () => {
  // select_moves_text (spec §4, slice 2): the pane's own drawing does as the card's does
  test('choosing a box in the pane’s drawing selects its pattern in the pane’s text', async () => {
    const env = await open();
    try {
      await until(() => !!env.el.querySelector('.graph-note-pane-drawing g.node'), 3000);
      const boxes = [...env.el.querySelectorAll('.graph-note-pane-drawing g.node')];
      boxes.find((g) => g.getAttribute('data-key') === 'large').dispatch('keydown', { key: 'Enter' });
      const t = textarea(env.el);
      const from = READER.indexOf("(large:Option {name: 'Large reader'})");
      assert.deepEqual(
        [t.selectionStart, t.selectionEnd],
        [from, from + "(large:Option {name: 'Large reader'})".length],
      );
    } finally {
      env.uninstall();
    }
  });
});

describe('how far focus reaches in the pane’s drawing (editor spec §25, focus_depth)', () => {
  const keptIn = (env) =>
    env.el
      .querySelectorAll('.graph-note-pane-drawing g.node')
      .filter((g) => g.hasClass('graph-note-kept'))
      .map((g) => g.getAttribute('data-key'))
      .sort();
  const choose = async (env, key) => {
    await until(() => !!env.el.querySelector('.graph-note-pane-drawing g.node'), 3000);
    env.el
      .querySelectorAll('.graph-note-pane-drawing g.node')
      .find((g) => g.getAttribute('data-key') === key)
      .dispatch('keydown', { key: 'Enter' });
  };

  test('one step by default', async () => {
    const env = await open();
    try {
      await choose(env, 'question');
      assert.deepEqual(keptIn(env), ['large', 'question']);
    } finally {
      env.uninstall();
    }
  });

  test('two steps when the setting says so, as in a card', async () => {
    const env = await open();
    try {
      await env.plugin.saveSettings({ ...env.plugin.settings, focusDepth: 'two' });
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'reader' });
      await choose(env, 'question');
      assert.deepEqual(keptIn(env), ['eyes', 'large', 'question']);
    } finally {
      env.uninstall();
    }
  });
});

describe('on a phone', () => {
  test('Drawing and Text are two tabs, and problems sit in a bottom sheet', async () => {
    const env = await open({ mobile: true });
    try {
      const tabs = env.el.querySelector('[role="tablist"]');
      assert.ok(tabs);
      const [drawing, text] = tabs.querySelectorAll('button');
      assert.deepEqual([drawing.textContent, text.textContent], ['Drawing', 'Text']);
      assert.equal(text.getAttribute('aria-selected'), 'true', 'it opens on the text');
      assert.ok(env.el.querySelector('.graph-note-pane-drawing').hidden);
      drawing.click();
      assert.ok(!env.el.querySelector('.graph-note-pane-drawing').hidden);
      assert.ok(env.el.querySelector('.graph-note-pane-text').hidden);
      assert.ok(env.el.querySelector('.graph-note-sheet'), 'a bottom sheet');
      assert.ok(env.el.querySelector('.graph-note-sheet .graph-note-pane-problems'));
    } finally {
      env.uninstall();
    }
  });

  test('on a desktop there are no tabs: drawing and text sit together', async () => {
    const env = await open();
    try {
      assert.equal(env.el.querySelector('[role="tablist"]'), null);
      assert.ok(!env.el.querySelector('.graph-note-pane-drawing').hidden);
      assert.ok(!env.el.querySelector('.graph-note-pane-text').hidden);
    } finally {
      env.uninstall();
    }
  });

  test('every control in the pane is at least 44 points', () => {
    assert.match(
      styles,
      /\.graph-note-pane button,\s*\.graph-note-pane select\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/,
    );
  });
});

describe('an empty graph block', () => {
  // Roger's try-out, 8 Oct 2026: an empty block ended up holding only "(", its graph line gone
  const EMPTY = '// graph: empty_trial · SOURCE';
  const EMPTY_NOTE = ['# Trial', '', fence(EMPTY), ''].join('\n');

  test('typing the first thing, and taking a suggestion, keeps the graph line', async () => {
    const env = await load({ files: { [PATH]: EMPTY_NOTE } });
    try {
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'empty_trial' });
      const el = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
      assert.equal(textarea(el).value, EMPTY);
      for (const typed of [EMPTY + '\n(', EMPTY + '\n(a', EMPTY + '\n(a:']) {
        type(el, typed);
        textarea(el).dispatch('keydown', { key: 'Tab' });
        const chip = el.querySelector('.graph-note-suggestions button');
        if (chip) chip.click();
        assert.match(textarea(el).value, /^\/\/ graph: empty_trial · SOURCE\n\(/, typed);
      }
      await wait(400);
      assert.match(note(env), /```gql\n\/\/ graph: empty_trial · SOURCE\n\(/);
    } finally {
      env.uninstall();
    }
  });
});
