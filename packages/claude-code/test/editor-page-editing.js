// The page's editing cases (C9; cc_editor_opens, cc_core_only). They are registered by editor-page.test.js, which is
// test_cc_page's file. They are kept here so that file stays within the repository's size baseline.
// - The page opens the note with the drawing, the details and the edit pane of the Obsidian host.
// - All of it is the display layer's. The editor, its drawing and its details are the very code the plugin runs.
// - The note is the editor server's store.
// Each case runs the page as built, its own script in a DOM. It runs against the real server and a real vault in a
// temporary folder (editor-page-live.js). Test code only.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { NOTE, READER } from '../../obsidian/test/host/pane-notes.js';
import { cleanUp } from './editor-page-support.js';
import { livePage, NOTE_PATH } from './editor-page-live.js';

/** The layer's parts of the edit pane: each was the plugin's, and is now the layer's alone. */
const PANE_PARTS = [
  'block-editor',
  'editor-layout',
  'editor-note',
  'text-help',
  'typing-keys',
  'pane-drawing',
  'kept-draft',
  'block-picker',
  'lock-text',
];

/** Registers the cases; `at` makes a repository path absolute, `importsOf` lists the modules a source file imports. */
export function editingCases({ at, LAYER, importsOf, bundled }) {
  const pages = [];
  after(async () => {
    await Promise.all(pages.splice(0).map((p) => p.stop()));
    await cleanUp();
  });
  const open = async (note = NOTE, options) => {
    const page = await livePage(note, options);
    pages.push(page);
    return page;
  };
  const text = (page) => page.doc.body.textContent;

  describe('C9: the page opens the note with the edit pane of the Obsidian host (cc_editor_opens, cc_core_only)', () => {
    test('the edit pane is the layer’s, and the plugin keeps only its own note behind it', () => {
      for (const part of PANE_PARTS)
        assert.ok(existsSync(at(`${LAYER}/editor/${part}.ts`)), `${LAYER}/editor/${part}.ts`);
      const own = readdirSync(at('packages/obsidian/src/block-editor')).sort();
      assert.deepEqual(own, ['block-editor.ts', 'block-note.ts', 'note-writing.ts'], 'the plugin’s share is its vault');
      const facade = readFileSync(at('packages/obsidian/src/block-editor/block-editor.ts'), 'utf8');
      assert.ok(
        importsOf(facade).includes('@thoughtknot/core/display/editor/block-editor'),
        'it runs the layer’s editor',
      );
      assert.ok(!existsSync(at('packages/obsidian/src/layout-worker/refusal-banner.ts')), 'one refusal banner');
      for (const f of ['page-note.ts', 'editor-pane.ts']) {
        const page = readFileSync(at(`packages/claude-code/page/${f}`), 'utf8');
        assert.ok(!importsOf(page).some((m) => /obsidian|codemirror/.test(m)), `${f} imports no Obsidian`);
      }
    });

    test('a bundle of the page’s editor holds the core, the graph library and the layer alone', async () => {
      const { metafile } = await bundled([
        'packages/claude-code/page/editor-pane.ts',
        'packages/claude-code/page/page-note.ts',
      ]);
      const inputs = Object.keys(metafile.inputs);
      assert.ok(
        inputs.some((i) => i.startsWith(`${LAYER}/editor/`)),
        'the layer’s editor is in it',
      );
      const allowed = [
        /^packages\/core\/src\//,
        /^packages\/graph-spec\/src\//,
        /^packages\/claude-code\/(src|page)\//,
        /^python\/graph_spec\/src\/[\w.]+\.json$/,
        /^node_modules\/@viz-js\//,
      ];
      assert.deepEqual(
        inputs.filter((i) => !allowed.some((a) => a.test(i))),
        [],
      );
      assert.deepEqual(
        inputs.filter((i) => /obsidian|codemirror|lezer|electron/i.test(i)),
        [],
      );
    });

    test('it opens with the drawing, the details of a thing and the text, each named for a screen reader', async () => {
      const page = await (await open()).ready();
      const doc = page.doc;
      assert.ok(
        doc.querySelector('.thoughtknot-pane-drawing svg.thoughtknot-svg'),
        'the drawing is the layer’s, inline',
      );
      assert.equal(doc.querySelector('.gn-drawing img'), null, 'no longer a picture of it');
      const field = page.field();
      const named = doc.getElementById(field.getAttribute('aria-labelledby'));
      assert.equal(named.textContent, 'Text of graph reader');
      for (const label of ['Undo', 'Redo']) assert.ok(page.button(label), label);
      assert.ok(page.button('Lock the graph'), 'a draft graph offers Lock the graph');
      assert.equal(field.value, READER, 'the text is the block, as the note has it');
      // the details of a thing open from the drawing, as they do in Obsidian
      const box = doc.querySelector('g.node[data-key]');
      box.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!doc.querySelector('.thoughtknot-details'));
      assert.match(
        doc.querySelector('.thoughtknot-details').textContent,
        /Which device\?|Large reader|Easy on the eyes/,
      );
    });

    test('every control of the pane is a real control with a name, and the text can be reached by the keyboard', async () => {
      const page = await (await open()).ready();
      const doc = page.doc;
      const pane = doc.querySelector('.thoughtknot-pane');
      for (const b of pane.querySelectorAll('button'))
        assert.ok(
          b.getAttribute('aria-label') || b.textContent.trim(),
          `a button with no name: ${b.outerHTML.slice(0, 80)}`,
        );
      assert.equal(page.field().tabIndex, 0, 'the field is in the tab order');
      assert.equal(page.field().disabled, false);
      assert.equal(
        doc.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').length,
        0,
        'no positive tabindex',
      );
    });

    test('the drawing’s colours are set through the CSSOM: no style attribute or sheet ever reaches the parser, under the policy as it was', async () => {
      const page = await livePage(NOTE, {
        before: (window) => {
          // (named so that no top level name of the page’s script, which is run as a plain script here, can replace it)
          window.seenByParser = [];
          const parse = window.DOMParser.prototype.parseFromString;
          window.DOMParser.prototype.parseFromString = function (markup, type) {
            window.seenByParser.push(markup);
            return parse.call(this, markup, type);
          };
        },
      });
      pages.push(page);
      await page.ready();
      const svgs = page.window.seenByParser.filter((m) => m.includes('<svg'));
      assert.ok(svgs.length > 0, 'the drawing was parsed');
      for (const m of svgs) {
        assert.doesNotMatch(m, /<[^>]*\sstyle=/, 'no style attribute in the markup the drawing is parsed from');
        assert.doesNotMatch(m, /<style[\s>]/, 'no style sheet in it either');
      }
      const label = page.doc.querySelector('.thoughtknot-svg g.node text');
      assert.ok(label.style.getPropertyValue('fill'), 'a label’s colour is set, through the CSSOM');
      assert.equal(label.getAttribute('data-gn-style'), null, 'the waiting attribute is gone');
      // the page itself holds no inline style, and the policy is the server’s, unchanged: self only, never unsafe-inline
      const served = await fetch(`${page.server.origin}/`, { headers: { host: new URL(page.server.origin).host } });
      const policy = served.headers.get('content-security-policy');
      assert.match(policy, /style-src 'self'(;|$)/);
      assert.doesNotMatch(policy, /unsafe-inline/);
      assert.doesNotMatch(await served.text(), /\sstyle=|<style/);
    });

    test('what is typed is written to the note by the server, as the pane writes it, and drawn again', async () => {
      const page = await (await open()).ready();
      const typed = READER + ",\n(mine:Reason {title: 'Mine'})";
      page.type(typed);
      await until(() => page.file() !== NOTE, 5000);
      assert.equal(page.file(), NOTE.replace(READER, typed));
      await until(() => page.doc.querySelectorAll('.thoughtknot-svg g.node').length === 4, 8000);
    });

    test('Undo and Redo take back and put back the page’s own writes, through the server', async () => {
      const page = await (await open()).ready();
      const typed = READER + ",\n(mine:Reason {title: 'Mine'})";
      await page.typed(typed);
      assert.equal(page.file(), NOTE.replace(READER, typed));
      // each step writes the note, then puts its text in the field: both are waited for before the next press
      await page.press('Undo');
      assert.equal(page.file(), NOTE);
      assert.equal(page.field().value, READER);
      await page.press('Redo');
      assert.equal(page.file(), NOTE.replace(READER, typed));
      assert.equal(page.field().value, typed);
    });

    test('a block changed on disk meanwhile is never overwritten: the page reloads it and keeps what was typed as a draft', async () => {
      const page = await (await open(NOTE, { fire: false })).ready();
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      page.write(theirs); // no watcher told the page: its next write is made over a version it has not seen
      page.type(READER + ',\n(mine:Reason)');
      await until(() => !page.doc.querySelector('.thoughtknot-draft').hidden, 5000);
      assert.equal(page.file(), theirs, 'not overwritten');
      assert.equal(page.field().value, READER + ',\n(theirs:Reason)', 'the block as the note has it');
      assert.match(page.doc.querySelector('.thoughtknot-draft').textContent, /kept as a draft/);
      page.button('Restore draft').click();
      assert.equal(page.field().value, READER + ',\n(mine:Reason)', 'the draft is what was typed');
    });

    test('a change on disk under a clean page is drawn again within a second, and Undo never undoes over it', async () => {
      const page = await (await open()).ready();
      const mine = READER + ",\n(mine:Reason {title: 'Mine'})";
      await page.typed(mine);
      const theirs = NOTE.replace(READER, READER + ',\n(theirs:Reason)');
      page.write(theirs);
      await until(() => page.field().value === READER + ',\n(theirs:Reason)', 5000);
      page.button('Undo').click();
      await until(() => /Another program changed this graph block/.test(text(page)), 5000);
      assert.equal(page.file(), theirs, 'their change stands');
    });

    test('nothing is written while the note is above the gate: the page shows why, with no editor, and the note is as it was', async () => {
      const { storeGate } = await import(at('packages/claude-code/server/editor-gate.ts'));
      const { settingsFrom } = await import(at('packages/core/src/settings.ts'));
      const s = settingsFrom(null);
      const gate = storeGate(
        { classifications: s.classifications, aiUnlabelled: s.aiUnlabelled, aiModels: s.aiModels },
        null,
      );
      const page = await livePage(NOTE, { gate });
      pages.push(page);
      await until(() => /Restricted|classification/i.test(text(page)), 8000);
      assert.equal(page.field(), null, 'no editor is offered');
      assert.equal(page.file(), NOTE, 'nothing was written');
    });

    test('the note is gone: typing is kept as a draft by the server, and nothing is written over the gap', async () => {
      const page = await (await open()).ready();
      rmSync(join(page.vault, NOTE_PATH));
      page.fireChange();
      await until(() => /no longer shown/i.test(text(page)), 5000);
      page.type(READER + ',\n(mine:Reason)');
      await until(() => !page.doc.querySelector('.thoughtknot-draft').hidden, 5000);
      assert.equal(existsSync(join(page.vault, NOTE_PATH)), false, 'the note was not written back');
    });
  });
}
