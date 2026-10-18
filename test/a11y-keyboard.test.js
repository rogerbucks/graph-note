// A keyboard-only run of every view of every host (editor spec §41, a11y_keyboard_auto). Each view of each host, the same
// views test/wcag.test.js checks, is walked with Tab and Shift+Tab round its whole tab order, with the page's own key
// handlers live: every element in the order must be reached, no element may keep the focus (a field that takes Tab for itself is left with Escape then Tab), and an open
// dialog of ours must keep the focus in it. An action out of the tab order must be in a widget whose arrow keys reach it.
// One of each kind of action the page draws itself (no browser operates it) is operated with Enter or Space, and each
// dialog of ours is left with Escape from every element in it. The check itself is tried first, on planted faults, so a
// pass means it looked. The browser editor's page is run in test/a11y-keyboard-page-*.test.js, its states split over
// those files so they run side by side; here each state is checked to be in one of them. Test support:
// test/repository/keyboard-run.js and keyboard-page.js.
import { test, describe, before } from 'node:test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { openWindow, pageFor, toHtml } from './repository/wcag.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { PAGE_PARTS } from './repository/keyboard-page.js';
import {
  escapeProblems,
  operateProblem,
  ownActionKinds,
  runProblems,
  tabOrder,
  unreachedProblems,
  walkProblems,
} from './repository/keyboard-run.js';

/** A page holding `html`, its handlers put on by `wire(document)`. */
function planted(html, wire = () => {}) {
  const { window } = openWindow(pageFor({ html, css: '', theme: 'light' }));
  wire(window.document);
  return window.document;
}
const onKey = (e, fn) => e.addEventListener('keydown', fn);

describe('the check itself', () => {
  test('walks the whole tab order both ways, and passes a page where every action is reached and operated', async () => {
    const doc = planted(
      '<button>One</button><a href="#x">Two</a><div role="button" tabindex="0" id="own">Three</div>' +
        '<div role="menu" id="menu"><div role="menuitem" tabindex="0">Cut</div><div role="menuitem" tabindex="-1">Copy</div>' +
        '</div>',
      (d) => {
        onKey(d.getElementById('own'), (e) => e.key === 'Enter' && e.target.setAttribute('aria-pressed', 'true'));
        onKey(d.getElementById('menu'), (e) => e.key === ' ' && e.preventDefault());
      },
    );
    assert.equal(tabOrder(doc).length, 4);
    assert.deepEqual(walkProblems(doc), []);
    assert.deepEqual(unreachedProblems(doc), []);
    const snapshot = () => doc.body.innerHTML;
    // the own button by Enter, the menu's items by Space
    assert.deepEqual(
      ownActionKinds(doc).map((k) => operateProblem(doc, k, snapshot)),
      [null, null],
    );
  });

  test('finds an action of the page’s own that neither Enter nor Space operates', () => {
    const doc = planted('<div role="button" tabindex="0">Dead</div>');
    const [kind] = ownActionKinds(doc);
    assert.match(
      operateProblem(doc, kind, () => doc.body.innerHTML),
      /“Dead”: neither Enter nor Space operates it/,
    );
  });

  test('finds a focus that Tab cannot leave', () => {
    const doc = planted('<input aria-label="Trap" id="trap"><button>After</button>', (d) =>
      onKey(d.getElementById('trap'), (e) => e.key === 'Tab' && e.preventDefault()),
    );
    doc.getElementById('trap').focus();
    assert.match(walkProblems(doc).join('\n'), /“Trap”: Tab leaves the focus here/);
  });

  test('finds an action out of the tab order that no arrow key reaches', () => {
    const doc = planted('<button>Here</button><div role="button" tabindex="-1">Lost</div>');
    assert.deepEqual(unreachedProblems(doc), [
      '<div> “Lost”: out of the tab order, and in no widget whose arrow keys reach it',
    ]);
  });

  test('finds a dialog that lets Tab out, and one that Escape does not leave', async () => {
    const doc = planted(
      '<button id="opener">Open</button><div role="dialog" aria-modal="true" aria-label="D" id="d">' +
        '<button>Inside</button></div><button>Behind</button>',
    );
    doc.querySelector('#d button').focus();
    assert.match(walkProblems(doc).join('\n'), /takes the focus out of the open dialog/);
    assert.match((await escapeProblems(doc, async () => doc)).join('\n'), /“Inside”: Escape does not leave the dialog/);
  });

  test('passes a dialog that keeps the focus in it, and closes on Escape with the focus given back', async () => {
    const make = () =>
      planted(
        '<button id="opener">Open</button><div role="dialog" aria-modal="true" aria-label="D" id="d">' +
          '<button>A</button><button>B</button></div>',
        (d) => {
          const dialog = d.getElementById('d');
          onKey(dialog, (e) => {
            const [a, b] = dialog.querySelectorAll('button');
            if (e.key === 'Escape') {
              dialog.remove();
              d.getElementById('opener').focus();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              (d.activeElement === a ? b : a).focus();
            }
          });
          dialog.querySelector('button').focus();
        },
      );
    const doc = make();
    assert.deepEqual(walkProblems(doc), []);
    assert.deepEqual(await escapeProblems(make(), async () => make()), []);
  });
});

describe('the Obsidian host: every view, from the keyboard alone', () => {
  before(() => build());

  for (const [name, open] of Object.entries(OBSIDIAN))
    test(`${name}: every action reached and operated, and every focus left`, async () => {
      const problems = await runProblems(
        open,
        ({ env }) => env.doc,
        ({ env }) => toHtml(env.doc.body),
        ({ env }) => env.uninstall(),
      );
      assert.deepEqual(problems, []);
    });
});

describe('the browser editor’s page: every state is run', () => {
  test('each state of the page is in exactly one of the files that run them, and each file is there', () => {
    const run = Object.values(PAGE_PARTS).flat();
    assert.deepEqual([...run].sort(), Object.keys(pageStates(() => {})).sort());
    for (const part of Object.keys(PAGE_PARTS)) assert.ok(existsSync(`test/a11y-keyboard-page-${part}.test.js`), part);
  });
});
