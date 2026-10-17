// The keyboard-only run of the browser editor's page (editor spec §41, a11y_keyboard_auto), state by state: the run
// test/a11y-keyboard.test.js makes of every view, over the states of views-page.js. The states are split over the files
// test/a11y-keyboard-page-<part>.test.js, each running the states its part names, so they run side by side: in one file
// they took two minutes. test/a11y-keyboard.test.js checks that each state is in exactly one part. Test support only.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { built, cleanUp } from '../../packages/claude-code/test/editor-page-support.js';
import { openEditorPage, styleFor } from './wcag-page.js';
import { pageStates } from './views-page.js';
import { runProblems } from './keyboard-run.js';

/** The states of the page each part runs, by name, about 25 seconds of the run in each. A new state goes in the shortest. */
export const PAGE_PARTS = {
  1: [
    'the details of an estimated link, with its quick fix',
    'a menu open with the keyboard on its second row',
    'the skip link focused',
    'before the note is opened, saying how to open it',
  ],
  2: ['the details of a thing, opened beside the text', 'a notice shown', 'reduced motion asked for'],
  3: [
    'the edit pane with a problem listed and marked',
    'the edit pane with the picker of two graph blocks',
    'the text version shown',
    'the edit pane with a kept draft offered back',
  ],
  4: [
    'the note: words, a code block, a link, and the graph drawn with its words',
    'the export form open',
    'a menu open',
  ],
};

/** The tests of one part: each state it names walked, operated and left from the keyboard alone, with no problem found. */
export function keyboardPageTests(part) {
  describe('the browser editor’s page: every state, from the keyboard alone', () => {
    let dir;
    const opened = [];
    before(async () => {
      ({ dir } = await built());
    });
    after(async () => {
      await Promise.all(opened.map((o) => o.stop()));
      await cleanUp();
    });

    const open = (hash, note, draft) => {
      const page = openEditorPage(dir, hash, note, draft);
      opened.push(page);
      return page;
    };
    const STATES = pageStates(open);

    for (const name of PAGE_PARTS[part])
      test(`${name}: every action reached and operated, and every focus left`, async () => {
        const problems = await runProblems(
          async () => {
            const page = await STATES[name]();
            styleFor(dir, page.window, 'light');
            return page;
          },
          (page) => page.window.document,
          (page) => page.window.document.body.innerHTML,
          (page) => page.window.close(),
        );
        assert.deepEqual(problems, []);
      });
  });
}
