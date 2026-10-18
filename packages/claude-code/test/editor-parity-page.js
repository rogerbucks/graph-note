// The same edit writes the same bytes on the browser editor's page and in Obsidian's pane (editor spec §26, cc_same_bytes), C9:
// shared cases, one for each kind of edit the pane makes. Each case is a note and what is done to the pane, said once, through
// a few verbs both hosts answer (`type`, `click`, `external`, ...), and runs twice: in Obsidian's own pane (the plugin as built,
// over its stand-in vault) and on the page as built (its script in a DOM, over the real server and a real vault on disk). What
// each leaves in the note is compared, byte for byte, and with what the case says it must be. Registered by
// editor-parity.test.js, which is test_cc_parity's file, within the repository's size baseline. Test code only.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { settled, until } from '../../obsidian/test/host/load-plugin.js';
import { open, note, textarea, type, NOTE, OTHER, PATH, READER } from '../../obsidian/test/host/pane-notes.js';
import { labelled } from '../../obsidian/test/host/notes.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

/** A graph with a link naming a thing that is not there, which the drawing draws as an estimate (spec §3). */
const GUESS = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(small_reeder)`;
const GUESS_NOTE = NOTE.replace(READER, GUESS);
const FIX = 'Change small_reeder to small_reader';

const MINE = READER + ",\n(mine:Reason {title: 'Mine'})";
const swap = (block, now) => NOTE.replace(block, now);

/**
 * The cases: a name, the note, what is done (`run`, given the host's verbs), and what the note must be after it: a string,
 * or a test of it. Every case's two outcomes must also be the same bytes as each other.
 */
const CASES = [
  ['a thing added, typed', NOTE, (h) => h.type(MINE), swap(READER, MINE)],
  [
    'a thing renamed, typed',
    NOTE,
    (h) => h.type(READER.replace("'Large reader'", "'Small reader'")),
    (n) => /Small reader/.test(n),
  ],
  [
    'a problem’s fix taken from the fix bar',
    NOTE,
    async (h) => {
      h.type(READER + ',\n(eyes)-[:FAVOURS]->(larg)');
      h.click('Change larg to large');
    },
    swap(READER, READER + ',\n(eyes)-[:FAVOURS]->(large)'),
  ],
  [
    'a comment moved to its own line by its fix',
    NOTE,
    (h) => {
      h.type(READER + ', // the reader graph');
      h.click('Put the comment on its own line');
    },
    swap(READER, READER + ',\n// the reader graph'),
  ],
  [
    'a suggestion chosen from the bar',
    NOTE,
    (h) => {
      h.type(READER + ',\n(eyes)-[:F');
      h.take('FAVOURS');
    },
    swap(READER, READER + ',\n(eyes)-[:FAVOURS'),
  ],
  [
    'Undo, then Redo, of a typed change',
    NOTE,
    async (h) => {
      h.type(MINE);
      await h.written(swap(READER, MINE));
      await h.press('Undo');
      await h.written(NOTE);
      await h.press('Redo');
    },
    swap(READER, MINE),
  ],
  [
    'Lock the graph',
    NOTE,
    (h) => h.click('Lock the graph'),
    (n) => /\/\/ ── The schema: locked \d{4}-\d\d-\d\d from the data above ──/.test(n),
  ],
  [
    'an estimated link’s quick fix, taken from the drawing’s details',
    GUESS_NOTE,
    async (h) => {
      await h.estimate();
      h.click(FIX);
    },
    GUESS_NOTE.replace('small_reeder', 'small_reader'),
  ],
  [
    'another graph block chosen in the picker, then typed in',
    NOTE,
    async (h) => {
      await h.choose('other');
      h.type(OTHER + ",\n(y:Thing {name: 'Y'})");
    },
    NOTE.replace(OTHER, OTHER + ",\n(y:Thing {name: 'Y'})"),
  ],
  [
    'text changed elsewhere in the note first: both kept',
    NOTE,
    async (h) => {
      await h.external(NOTE.replace('Between.', 'Between, and changed.'));
      h.type(MINE);
    },
    NOTE.replace('Between.', 'Between, and changed.').replace(READER, MINE),
  ],
  [
    'the block changed elsewhere meanwhile: nothing is overwritten, the draft is kept',
    NOTE,
    async (h) => {
      h.type(MINE);
      h.stale(NOTE.replace(READER, READER + ',\n(theirs:Reason)'));
      await h.kept();
    },
    NOTE.replace(READER, READER + ',\n(theirs:Reason)'),
    READER + ',\n(theirs:Reason)',
  ],
];

/** The suggestion offered under the caret whose name is `name`. */
const optionNamed = (el, name) =>
  Array.from(el.querySelectorAll('[role="option"]')).find(
    (o) => o.querySelector('.thoughtknot-suggestion-name')?.textContent === name,
  );

/** Obsidian's pane, driven as its own tests drive it. */
async function inObsidian(note0) {
  const env = await open({ note: note0 });
  const pane = () => env.el.querySelector('.thoughtknot-pane-drawing');
  return {
    note: () => note(env),
    field: () => textarea(env.el).value,
    type: (t) => type(env.el, t),
    click: (label) => labelled(env.el, label).click(),
    take: (name) => optionNamed(env.el, name).click(),
    async press(label) {
      labelled(env.el, label).click();
    },
    async written(expected) {
      await until(() => note(env) === expected && !!textarea(env.el));
      // what the pane does after the write (the field, the tools) is promises already settled: an order, not a sleep
      for (let i = 0; i < 10; i++) await settled();
    },
    async estimate() {
      await until(() => !!pane().querySelector('g.edge[data-estimate]'), 5000);
      const guess = pane()
        .querySelectorAll('g.edge')
        .find((g) => g.getAttribute('data-estimate') === '0');
      const vp = pane().querySelector('.thoughtknot-viewport');
      for (const t of ['pointerdown', 'pointerup'])
        vp.dispatch(t, { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
    },
    async choose(graph) {
      const picker = env.el.querySelector('select');
      const o = picker.querySelectorAll('option').find((x) => x.textContent.startsWith(`${graph} ·`));
      picker.value = o.getAttribute('value');
      picker.dispatch('change');
      await until(() => textarea(env.el).value.startsWith(`// graph: ${graph}`));
    },
    async external(text) {
      await env.app.vault.modify({ path: PATH }, text);
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    },
    stale: (text) => void env.app.vault.modify({ path: PATH }, text), // (told to the pane at once, as Obsidian tells it)
    async kept() {
      await until(() => /kept as a draft/.test(env.el.querySelector('.thoughtknot-draft').textContent), 5000);
    },
    done: async (expected) => {
      await until(() => (typeof expected === 'function' ? expected(note(env)) : note(env) === expected), 5000);
      return note(env);
    },
    stop: () => env.uninstall(),
  };
}

/** The page, driven through the DOM as a person's hands would. */
async function onPage(note0, pages) {
  // put away with the others whether or not it comes up: a page that never does must not keep the process alive
  const page = await livePage(note0);
  pages.push(page);
  await page.ready();
  const drawing = () => page.doc.querySelector('.thoughtknot-pane-drawing');
  // the editor draws its tools again once it has finished a write: what a case waits for before the next press
  let marked = null;
  return {
    note: () => page.file(),
    field: () => page.field().value,
    type(t) {
      marked = page.button('Undo');
      page.type(t);
    },
    click: (label) => page.button(label).click(),
    take: (name) => optionNamed(page.doc, name).click(),
    async press(label) {
      await page.press(label); // which waits for the editor itself
      marked = null;
    },
    async written(expected) {
      await until(() => page.file() === expected && (marked === null || page.button('Undo') !== marked), 8000);
      marked = null;
    },
    async estimate() {
      await until(() => !!drawing().querySelector('g.edge[data-estimate]'), 8000);
      const guess = drawing().querySelector('g.edge[data-estimate="0"]');
      guess.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!page.doc.querySelector('.thoughtknot-details'));
    },
    async choose(graph) {
      const picker = page.doc.querySelector('select.dropdown');
      const o = Array.from(picker.options).find((x) => x.textContent.startsWith(`${graph} ·`));
      picker.value = o.value;
      picker.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      await until(() => page.field().value.startsWith(`// graph: ${graph}`));
    },
    async external(text) {
      page.write(text);
      await until(() => /The note changed/.test(page.doc.getElementById('gn-notices').textContent), 8000);
    },
    // the page is not told, as a change made between two of its checks: its next write is made over a version it has not seen
    stale: (text) => page.write(text, { tell: false }),
    async kept() {
      await until(() => /kept as a draft/.test(page.doc.querySelector('.thoughtknot-draft').textContent), 8000);
    },
    done: async (expected) => {
      await until(() => (typeof expected === 'function' ? expected(page.file()) : page.file() === expected), 8000);
      return page.file();
    },
    stop: () => page.stop(),
  };
}

/** Registers the cases. */
export function parityPageCases() {
  describe('C9: every kind of edit writes the same bytes on the page and in Obsidian’s pane (cc_same_bytes)', () => {
    const pages = [];
    after(async () => {
      await Promise.all(pages.splice(0).map((p) => p.stop()));
      await cleanUp();
    });
    for (const [name, start, run, expected, field] of CASES) {
      test(name, async () => {
        const results = [];
        for (const host of [inObsidian, (n) => onPage(n, pages)]) {
          const h = await host(start);
          try {
            await run(h);
            const written = await h.done(expected);
            // where the case says what the field is left holding, both hold it
            if (field !== undefined) await until(() => h.field() === field, 8000);
            results.push(written);
          } finally {
            if (host === inObsidian) await h.stop();
          }
        }
        const [obsidian, page] = results;
        assert.equal(page, obsidian, 'the same bytes on the page as in Obsidian');
        if (typeof expected === 'string') assert.equal(page, expected);
      });
    }
  });
}
