// The edit pane (spec §4, §9): opened beside the note on the block whose Edit was pressed, with a picker when the note has
// several graphs; the text coloured as gql-highlight colours it, problems marked where they are with their fixes, names,
// kinds and relationships suggested while typing, and each line read back in plain English; Drawing and Text as two tabs on
// a phone. What is typed reaches the note quickly, never overwrites a block changed meanwhile, is never lost, and can be
// undone. A draft offers Lock the graph.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, root, until, wait } from './lib/load-plugin.js';

const styles = readFileSync(`${root}styles.css`, 'utf8');
before(() => build());

const fence = (t) => '```gql\n' + t + '\n```';
const READER = `// graph: reader
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)`;
const OTHER = "// graph: other\n(x:Thing {name: 'X'})";
const NOTE = ['# Reader', '', fence(READER), '', 'Between.', '', fence(OTHER), ''].join('\n');
const PATH = 'Reader.md';

/** Opens the pane on a block, as the Edit button does; returns it with the plugin's world. */
async function open(options = {}, line = 2) {
  const env = await load({ files: { [PATH]: options.note ?? NOTE }, ...options });
  await env.plugin.openEditor({ path: PATH, line, graph: 'reader' });
  const leaf = env.app.workspace.getLeavesOfType('graph-note-pane')[0];
  return { ...env, leaf, pane: leaf?.view, el: leaf?.view.contentEl };
}
const textarea = (el) => el.querySelector('textarea');
const type = (el, value, caret = value.length) => {
  const t = textarea(el);
  t.value = value;
  t.setSelectionRange(caret, caret);
  t.dispatch('input');
};
const labelled = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const note = (env) => env.state.files.get(PATH);

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
    assert.ok(backs.includes(' — Easy on the eyes favours Large reader'));
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
    assert.equal(t.getAttribute('aria-label'), 'Text of graph reader');
  });
});

describe('problems, in place', () => {
  test('a problem is marked where it is, and its fix is offered on that line', async () => {
    const env = await open();
    try {
      const typo = READER + ',\n(eyes)-[:FAVOURS]->(larg)';
      type(env.el, typo);
      await wait(400);
      const mark = env.el.querySelector('.graph-note-overlay .graph-note-problem');
      assert.equal(mark.textContent, 'larg');
      assert.match(mark.className, /is-warning/);
      const here = env.el.querySelector('.graph-note-fixbar');
      assert.ok(!here.hidden, 'the caret is on that line, so its fix is offered there');
      assert.match(here.textContent, /larg is not in graph reader/);
      labelled(here, 'Change larg to large').click();
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(large)');
      await wait(400);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(eyes)-[:FAVOURS]->(large)'));
    } finally {
      env.uninstall();
    }
  });

  test('every problem is listed with its line, and each line marked with a sign as well as a colour', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(x:T {y: })');
      await wait(400);
      const items = env.el.querySelectorAll('.graph-note-pane-problems li').map((li) => li.textContent);
      assert.equal(items.length, 2);
      assert.match(items[0], /^Line 7: /);
      assert.ok(env.el.querySelectorAll('.graph-note-overlay .graph-note-line-sign').length >= 2);
    } finally {
      env.uninstall();
    }
  });
});

describe('suggestions while typing', () => {
  test('names, kinds and relationships already in the graph are offered, and choosing one writes it in', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:F');
      const bar = env.el.querySelector('.graph-note-suggestions');
      assert.ok(!bar.hidden);
      const chip = labelled(bar, 'FAVOURS — favours');
      assert.ok(chip);
      chip.click();
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS');
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(la');
      assert.deepEqual(
        bar.querySelectorAll('button').map((b) => b.getAttribute('aria-label')),
        ['large — Option: Large reader'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('Tab takes the first suggestion from the keyboard', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(qu');
      const ev = textarea(env.el).dispatch('keydown', { key: 'Tab' });
      assert.ok(ev.defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
    } finally {
      env.uninstall();
    }
  });

  test('with nothing to suggest, the bar is hidden and Tab is left alone', async () => {
    const env = await open();
    try {
      type(env.el, READER + ",\n(x:Reason {title: 'abc");
      assert.ok(env.el.querySelector('.graph-note-suggestions').hidden);
      assert.equal(textarea(env.el).dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
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

describe('writing to the note', () => {
  test('what is typed reaches the note within about a third of a second', async () => {
    const env = await open();
    try {
      type(env.el, READER + ",\n(price:Reason {title: 'Costs more'})");
      const t0 = Date.now();
      while (note(env) === NOTE && Date.now() - t0 < 1000) await wait(10);
      assert.ok(Date.now() - t0 <= 350, `${Date.now() - t0} ms`);
      assert.equal(note(env), NOTE.replace(READER, READER + ",\n(price:Reason {title: 'Costs more'})"));
    } finally {
      env.uninstall();
    }
  });

  test('a block changed in the note meanwhile is never overwritten: the pane reloads it and keeps what was typed as a draft', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(mine:Reason)');
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(400);
      assert.equal(note(env), theirs, 'not overwritten');
      assert.equal(textarea(env.el).value, READER + ',\n(theirs:Reason)', 'reloaded');
      const banner = env.el.querySelector('.graph-note-draft');
      assert.match(banner.textContent, /kept as a draft/);
      assert.deepEqual(
        Object.values(env.state.data.drafts).map((d) => d.text),
        [READER + ',\n(mine:Reason)'],
      );
      labelled(banner, 'Restore draft').click();
      assert.equal(textarea(env.el).value, READER + ',\n(mine:Reason)');
    } finally {
      env.uninstall();
    }
  });

  test('a draft kept from before is offered when the pane opens on its block again', async () => {
    const env = await open({
      data: { drafts: { [`${PATH}#reader`]: { text: READER + ',\n(mine:Reason)', kept: '2026-10-07T22:00:00.000Z' } } },
    });
    try {
      const banner = env.el.querySelector('.graph-note-draft');
      assert.ok(!banner.hidden);
      labelled(banner, 'Discard draft').click();
      assert.deepEqual(env.state.data.drafts, {});
      assert.ok(banner.hidden);
    } finally {
      env.uninstall();
    }
  });

  test('a change to the note under a clean pane reloads it', async () => {
    const env = await open();
    try {
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      await env.app.vault.modify({ path: PATH }, theirs);
      await wait(20);
      assert.equal(textarea(env.el).value, READER + ',\n(theirs:Reason)');
    } finally {
      env.uninstall();
    }
  });

  test('Undo and Redo take back and put back each change in the note', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(one:Reason)');
      await wait(400);
      type(env.el, READER + ',\n(one:Reason),\n(two:Reason)');
      await wait(400);
      labelled(env.el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(one:Reason)'));
      labelled(env.el, 'Undo').click();
      await wait(20);
      assert.equal(note(env), NOTE);
      assert.equal(textarea(env.el).value, READER);
      labelled(env.el, 'Redo').click();
      await wait(20);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(one:Reason)'));
    } finally {
      env.uninstall();
    }
  });
});

describe('Lock the graph', () => {
  test('a draft offers Lock the graph, which writes its schema into the note after the graph', async () => {
    const env = await open();
    try {
      const lock = labelled(env.el, 'Lock the graph');
      assert.ok(lock);
      lock.click();
      await wait(50);
      assert.match(
        note(env),
        /```\n\n```gql\n\/\/ graph: reader\n\/\/ ── The schema: locked \d{4}-\d\d-\d\d from the data above ──/,
      );
      assert.equal(labelled(env.el, 'Lock the graph'), undefined, 'a locked graph is no longer offered it');
    } finally {
      env.uninstall();
    }
  });
});

describe('problems announced', () => {
  test('a new problem is announced to screen readers, and the focus stays in the text', async () => {
    const env = await open();
    try {
      const live = env.el.querySelector('.graph-note-announce');
      assert.equal(live.getAttribute('aria-live'), 'polite');
      textarea(env.el).focus();
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere)');
      assert.match(live.textContent, /^1 new problem: no thing called nowhere/i);
      assert.equal(env.doc.activeElement, textarea(env.el));
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere)\n');
      assert.equal(live.textContent, '', 'the same problem is not announced again');
    } finally {
      env.uninstall();
    }
  });
});

describe('shared schemas', () => {
  const SCHEMA_NOTE =
    "# Schemas\n\n```gql\n// graph: shared · SCHEMA seeing@1\n(t1:Meta:ElementType {name: 'Thing', kind: 'node'}),\n(t2:Meta:ElementType {name: 'SEES', kind: 'edge', reading: 'can see', reverse_name: 'is seen by'})\n```\n";
  const USES = fence(
    "// graph: view · schema seeing@1\n(a:Thing {name: 'A'}), (b:Thing {name: 'B'}), (a)-[:SEES]->(b)",
  );

  test('a graph that names a shared schema reads its links in that schema’s words, in the note and in the pane', async () => {
    const env = await load({ files: { 'Schemas.md': SCHEMA_NOTE, 'View.md': USES } });
    try {
      const el = env.doc.body.createDiv();
      const lines = USES.split('\n');
      const { fakeContext } = await import('./lib/fake-obsidian.js');
      await env.state.processors.get('gql')(lines.slice(1, -1).join('\n'), el, {
        ...fakeContext(USES, 0),
        sourcePath: 'View.md',
      });
      assert.match(el.querySelector('g.edge').textContent, /can see/);
      await env.plugin.openEditor({ path: 'View.md', line: 0, graph: 'view' });
      const pane = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
      assert.ok(pane.querySelectorAll('.graph-note-readback').some((s) => /A can see B/.test(s.textContent)));
    } finally {
      env.uninstall();
    }
  });

  test('a graph that names no shared schema never reads the vault for one', async () => {
    const env = await load({ files: { 'Schemas.md': SCHEMA_NOTE, 'Reader.md': NOTE } });
    try {
      let reads = 0;
      const read = env.app.vault.cachedRead;
      env.app.vault.cachedRead = async (f) => {
        reads++;
        return read(f);
      };
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'reader' });
      assert.equal(reads, 0);
    } finally {
      env.uninstall();
    }
  });
});

describe('the comma added for you', () => {
  test('starting the next pattern on a new line adds the comma at the end of the line before, and the caret stays put', async () => {
    const env = await open();
    try {
      const t = textarea(env.el);
      const before = READER + '\n';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + '(');
      assert.equal(t.value, READER + ',\n(');
      assert.equal(t.selectionStart, t.value.length, 'the caret is still just after the (');
    } finally {
      env.uninstall();
    }
  });

  test('one undo takes the comma back, and only the comma', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + '\n';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + '(');
      const ev = t.dispatch('keydown', { key: 'z', metaKey: true });
      assert.ok(ev.defaultPrevented);
      assert.equal(t.value, READER + '\n(');
      assert.equal(t.selectionStart, t.value.length);
      assert.equal(
        t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented,
        false,
        'the next undo is the platform’s own',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a line that is not otherwise valid gets no comma', async () => {
    const env = await open();
    try {
      const broken = READER + ',\n(x:T {name: })\n';
      const t = textarea(env.el);
      t.value = broken;
      t.setSelectionRange(broken.length, broken.length);
      t.dispatch('input');
      type(env.el, broken + '(');
      assert.equal(t.value, broken + '(');
    } finally {
      env.uninstall();
    }
  });
});

describe('the colon added for you', () => {
  // colon_added_for_you (spec §4): a link type typed without its colon, matching one type of the graph, gets it as ] is typed
  test('closing a bare type known to the graph adds the colon and the graph’s spelling; the caret stays after the ]', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[favours';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.equal(t.value, READER + ',\n(eyes)-[:FAVOURS]');
      assert.equal(t.selectionStart, t.value.length);
    } finally {
      env.uninstall();
    }
  });

  test('one undo takes the colon back, and only the colon', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[favours';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.ok(t.dispatch('keydown', { key: 'z', metaKey: true }).defaultPrevented);
      assert.equal(t.value, before + ']');
      assert.equal(t.selectionStart, t.value.length);
    } finally {
      env.uninstall();
    }
  });

  test('a first use gets no colon: it is not guessed', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[cites';
      t.value = before;
      t.setSelectionRange(before.length, before.length);
      t.dispatch('input');
      type(env.el, before + ']');
      assert.equal(t.value, before + ']');
    } finally {
      env.uninstall();
    }
  });
});

describe('the comma added for you in the note itself', () => {
  /** A typing update of the note's own editor: `text` after a ( was typed at `caret`. */
  function typing(text, caret, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: true,
      state: { doc },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: { iterChanges: (cb) => cb(caret - 1, caret - 1, caret - 1, caret, { toString: () => '(' }) },
    };
  }

  test('typing ( to start the next pattern in a graph block adds the comma, as its own step', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '# N\n```gql\n// graph: g\n(a:T)\n(\n```';
      const dispatched = [];
      listener(typing(note, note.indexOf('(\n```') + 1, dispatched));
      assert.deepEqual(dispatched, [], 'not while the editor is updating');
      await wait(10);
      assert.equal(dispatched.length, 1);
      assert.deepEqual(dispatched[0].changes, { from: note.indexOf('(a:T)') + 5, insert: ',' });
      assert.deepEqual(
        dispatched[0].annotations,
        { userEvent: 'input.comma' },
        'its own step, so one undo takes it back',
      );
    } finally {
      env.uninstall();
    }
  });

  test('typing ( in prose, in other code, or in a query adds nothing', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners,
        dispatched = [];
      for (const note of [
        'Text (aside)\n(',
        '```python\nf(a)\n(\n```',
        '```gql\n// graph: g · QUERY\nMATCH (a)\n(\n```',
      ]) {
        listener(typing(note, note.lastIndexOf('(') + 1, dispatched));
      }
      await wait(10);
      assert.deepEqual(dispatched, []);
    } finally {
      env.uninstall();
    }
  });
});

describe('the colon added for you in the note itself', () => {
  function typing(text, caret, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: true,
      state: { doc },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: { iterChanges: (cb) => cb(caret - 1, caret - 1, caret - 1, caret, { toString: () => ']' }) },
    };
  }

  test('typing ] to close a bare type known to the graph adds the colon, as its own step', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '```gql\n// graph: g\n(a:T),\n(b:T),\n(a)-[:LIKES]->(b),\n(b)-[likes]\n```';
      const dispatched = [];
      listener(typing(note, note.indexOf('likes]') + 6, dispatched));
      await wait(10);
      assert.equal(dispatched.length, 1);
      const at = note.indexOf('likes]');
      assert.deepEqual(dispatched[0].changes, { from: at, to: at + 5, insert: ':LIKES' });
      assert.deepEqual(dispatched[0].annotations, { userEvent: 'input.colon' });
    } finally {
      env.uninstall();
    }
  });
});

describe('what is added for you, with Obsidian’s brackets paired as you type', () => {
  // Obsidian pairs brackets by default: typing ( inserts () with the caret between, and typing ] before a ] already there
  // only moves the caret past it. The comma and the colon must come all the same.
  function update({ text, before = text, inserted = null, from = 0, head, startHead }, dispatched) {
    const doc = { toString: () => text };
    const view = { state: { doc }, dispatch: (spec) => dispatched.push(spec) };
    return {
      docChanged: inserted !== null,
      startState: { doc: { toString: () => before }, selection: { main: { head: startHead } } },
      state: { doc, selection: { main: { head } } },
      view,
      transactions: [{ isUserEvent: (e) => e === 'input.type' }],
      changes: {
        iterChanges: (cb) => {
          if (inserted !== null) cb(from, from, from, from + inserted.length, { toString: () => inserted });
        },
      },
    };
  }

  test('typing ( that inserts () still adds the comma', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '# N\n```gql\n// graph: g\n(a:T)\n()\n```',
        from = note.indexOf('()\n```'),
        dispatched = [];
      listener(update({ text: note, inserted: '()', from, head: from + 1, startHead: from }, dispatched));
      await wait(10);
      assert.deepEqual(dispatched[0]?.changes, { from: note.indexOf('(a:T)') + 5, insert: ',' });
    } finally {
      env.uninstall();
    }
  });

  test('typing ] over the ] already there still adds the colon', async () => {
    const env = await load({});
    try {
      const [listener] = env.state.listeners;
      const note = '```gql\n// graph: g\n(a:T),\n(b:T),\n(a)-[:LIKES]->(b),\n(b)-[likes]\n```',
        at = note.indexOf('likes]'),
        dispatched = [];
      listener(update({ text: note, head: at + 6, startHead: at + 5 }, dispatched));
      await wait(10);
      assert.deepEqual(dispatched[0]?.changes, { from: at, to: at + 5, insert: ':LIKES' });
    } finally {
      env.uninstall();
    }
  });
});
