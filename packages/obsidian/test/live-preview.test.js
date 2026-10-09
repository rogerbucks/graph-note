// The editing view's own cards (spec §4, "The page stays still"; Roger's choice C, 9 Oct 2026): in Live Preview the
// plugin draws each graph block with a CodeMirror widget of its own, which outlives every change to the block's text —
// redrawn in place, never torn down — and tells CodeMirror the card's last height, so the editor has nothing to correct
// and the page stays still. What is typed in place is written as one editor transaction, never through the vault.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './lib/load-plugin.js';
import { cmState, cmView, editorLivePreviewField, editorInfoField } from './lib/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const fence = (t) => '```gql\n' + t + '\n```';
const READER = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(q)`;
const QUERY = '// graph: reader · QUERY\nMATCH (o:Option) RETURN o.name';
const NOTE = ['# Reader', '', fence(READER), '', 'Between.', '', fence(QUERY), ''].join('\n');

/** The plugin's own editor extension: the one it registers that is a real CodeMirror extension. */
const ownExtension = (env) => (env.state.editorExtensions ?? []).filter((e) => !e?.listener);

/** An editor state for the note, as Obsidian builds one: in Live Preview or not, showing the note's file. */
function editorState(env, doc, livePreview = true) {
  return cmState.EditorState.create({
    doc,
    extensions: [
      editorLivePreviewField.init(() => livePreview),
      editorInfoField.init(() => ({ file: { path: PATH } })),
      ...ownExtension(env),
    ],
  });
}

/** The block widgets the editor would draw: where each starts and ends, and the widget. */
function widgets(state) {
  const out = [];
  for (const source of state.facet(cmView.EditorView.decorations)) {
    const set = typeof source === 'function' ? null : source;
    set?.between(0, state.doc.length, (from, to, deco) => {
      if (deco.spec.widget) out.push({ from, to, widget: deco.spec.widget, block: !!deco.spec.block });
    });
  }
  return out;
}

describe('the editing view draws graph blocks with its own widget', () => {
  test('in Live Preview each graph block is one block widget over its fences; a query is left to Obsidian', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const ws = widgets(editorState(env, NOTE));
      assert.equal(ws.length, 1);
      const open = NOTE.indexOf('```gql\n// graph: reader\n');
      assert.deepEqual([ws[0].from, ws[0].to, ws[0].block], [open, open + fence(READER).length, true]);
    } finally {
      env.uninstall();
    }
  });

  test('in Source mode nothing is drawn: the text is the text', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      assert.deepEqual(widgets(editorState(env, NOTE, false)), []);
    } finally {
      env.uninstall();
    }
  });

  test('a change to the block’s text keeps its card: the same element, redrawn in place, never built again', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const state = editorState(env, NOTE);
      const [first] = widgets(state);
      const dom = first.widget.toDOM();
      env.doc.body.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      const at = NOTE.indexOf('(large)-[:ANSWERS]->(q)') + '(large)-[:ANSWERS]->(q)'.length;
      const next = state.update({ changes: { from: at, insert: ",\n(small:Option {name: 'Small'})" } }).state;
      const [second] = widgets(next);
      assert.ok(!second.widget.eq(first.widget), 'the text changed');
      assert.equal(second.widget.updateDOM(dom), true, 'so it is redrawn in the same element');
      await until(() => dom.querySelectorAll('g.node').length === 3, 3000);
      assert.equal(dom.querySelectorAll('.graph-note-view').length, 1, 'one card, the old one gone');
      second.widget.destroy(dom);
    } finally {
      env.uninstall();
    }
  });

  test('CodeMirror is told the card’s last height, so it has nothing to correct while the card is redrawn', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const state = editorState(env, NOTE);
      const [first] = widgets(state);
      const dom = first.widget.toDOM();
      env.doc.body.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      first.widget.measured(dom, 412);
      const at = NOTE.indexOf('(large)-[:ANSWERS]->(q)');
      const [second] = widgets(state.update({ changes: { from: at, insert: ' ' } }).state);
      assert.equal(second.widget.estimatedHeight, 412);
      first.widget.destroy(dom);
    } finally {
      env.uninstall();
    }
  });

  test('the old card stays on the page until the new drawing is ready, so the card never shrinks between', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const state = editorState(env, NOTE);
      const [first] = widgets(state);
      const dom = first.widget.toDOM();
      env.doc.body.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      const old = dom.querySelector('.graph-note-view');
      const at = NOTE.indexOf('(large)-[:ANSWERS]->(q)');
      const [second] = widgets(state.update({ changes: { from: at, insert: ' ' } }).state);
      second.widget.updateDOM(dom);
      assert.ok(old.isConnected, 'still there while the new one is drawn');
      await until(() => !old.isConnected, 3000);
      assert.equal(dom.querySelectorAll('.graph-note-view').length, 1);
      second.widget.destroy(dom);
    } finally {
      env.uninstall();
    }
  });
});

describe('the editor in place, in the editing view’s own card', () => {
  // found in headless Chrome, 9 Oct 2026: the new drawing went in at once, but the box joined it only at the card's next
  // look, 16 ms later; for that moment the card was the box's height shorter, and CodeMirror moved the page to suit
  test('the box moves into the new drawing as it is put in place, so the card is never without it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-source-view' });
      const state = editorState(env, NOTE);
      const [first] = widgets(state);
      const dom = first.widget.toDOM();
      host.appendChild(dom);
      await until(() => !!dom.querySelector('.graph-note-view'));
      dom
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Edit here')
        .click();
      await until(() => !!dom.querySelector('textarea'));
      const seen = [];
      const put = dom.replaceChildren.bind(dom);
      dom.replaceChildren = (...cs) => {
        put(...cs);
        // once what put it in place has finished, before any later look
        queueMicrotask(() => seen.push(!!dom.querySelector('textarea')));
      };
      const at = NOTE.indexOf('(large)-[:ANSWERS]->(q)');
      const [second] = widgets(state.update({ changes: { from: at, insert: ' ' } }).state);
      second.widget.updateDOM(dom);
      await until(() => seen.length > 0, 3000);
      assert.deepEqual(seen, [true]);
      second.widget.destroy(dom);
    } finally {
      env.uninstall();
    }
  });
});

describe('what is typed in place is written through the editor', () => {
  /** An editor open on the note, as the plugin's extension sees one: its text, and what is dispatched to it. */
  function openEditor(env, text) {
    const view = {
      text,
      dispatched: [],
      state: {
        doc: { toString: () => view.text },
        field: (f) =>
          f === editorInfoField ? { file: { path: PATH } } : f === editorLivePreviewField ? true : undefined,
      },
      dispatch(spec) {
        view.dispatched.push(spec);
        const c = spec.changes;
        view.text = view.text.slice(0, c.from) + c.insert + view.text.slice(c.to);
      },
    };
    env.plugin.editorViews.add(view);
    return view;
  }

  /** Opens the block in place, in a card in the editing view, and types `typed` as its whole text. */
  async function typeInPlace(env, typed) {
    const card = env.doc.body.createDiv({ cls: 'markdown-source-view' }).createDiv();
    await env.state.processors.get('gql')(READER, card, {
      sourcePath: PATH,
      getSectionInfo: () => ({ text: NOTE, lineStart: 2, lineEnd: 7 }),
      addChild: (c) => c.load(),
    });
    card
      .querySelectorAll('button')
      .find((b) => b.getAttribute('aria-label') === 'Edit here')
      .click();
    await until(() => !!card.querySelector('textarea'));
    const t = card.querySelector('textarea');
    t.value = typed;
    t.setSelectionRange(t.value.length, t.value.length);
    t.dispatch('input');
  }

  test('with the note open in the editing view, a change is one editor transaction, never a write to the file', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const view = openEditor(env, NOTE);
      let processed = 0;
      const process = env.app.vault.process;
      env.app.vault.process = async (...a) => {
        processed++;
        return process(...a);
      };
      await typeInPlace(env, READER + ',');
      await until(() => view.dispatched.length > 0, 2000);
      await wait(50);
      assert.equal(processed, 0, 'the file is never written behind the editor’s back');
      assert.equal(view.text, NOTE.replace(READER, READER + ','));
      assert.deepEqual(view.dispatched[0].changes.insert, ',', 'one change, just what was typed');
    } finally {
      env.uninstall();
    }
  });

  // Roger's test vault, 9 Oct 2026: written through Obsidian's Editor, the change scrolled the note to the editor's own
  // cursor, which sat at the note's start, as the typing is in the card's box, not the editor
  test('the change moves neither the editor’s own cursor nor its scroll', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const view = openEditor(env, NOTE);
      await typeInPlace(env, READER + ' ');
      await until(() => view.dispatched.length > 0, 2000);
      const [spec] = view.dispatched;
      assert.equal(spec.scrollIntoView, undefined, 'no scrolling');
      assert.equal(spec.selection, undefined, 'the cursor left where it is');
      assert.equal(spec.effects, undefined);
    } finally {
      env.uninstall();
    }
  });

  test('with the note in reading view or closed, the pane still writes the file', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      await env.plugin.openEditor({ path: PATH, line: 2, graph: 'reader' });
      const pane = env.app.workspace.getLeavesOfType('graph-note-pane')[0].view.contentEl;
      const t = pane.querySelector('textarea');
      t.value = READER + ',';
      t.dispatch('input');
      await until(() => env.state.files.get(PATH).includes(READER + ','), 2000);
    } finally {
      env.uninstall();
    }
  });
});
