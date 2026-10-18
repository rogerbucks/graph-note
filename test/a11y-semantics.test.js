// Every control's name, role and state, and the text version against the drawing (editor spec §41, a11y_semantics_auto).
// Each view of each host, the same views test/wcag.test.js checks, is read as a screen reader reads it: every control
// a person can operate must have an accessible name, be read as a control, and say its state where its role has one
// (checked, selected, expanded). Each drawing's text version must count the things drawn and name each of them. The
// check itself is tried first, on planted faults, so a pass means it looked. Test support: test/repository/a11y-tree.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { styles } from '../packages/obsidian/test/host/view-notes.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { openWindow, pageFor, toHtml } from './repository/wcag.js';
import { openEditorPage, styleFor } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { controlsOf, textVersionProblems, treeProblems } from './repository/a11y-tree.js';

/** A window holding `html`, as a view is checked. */
const planted = (html) => openWindow(pageFor({ html, css: '', theme: 'light' })).window;

describe('the check itself', () => {
  test('finds a control with no name, one not read as a control, and widgets that say no state', () => {
    const window = planted(
      '<button></button><div tabindex="0">plain words</div><div role="checkbox" tabindex="0">Wrap</div>' +
        '<div role="tab" tabindex="0">One</div><button aria-haspopup="menu">More</button>',
    );
    const problems = treeProblems(window).join('\n');
    assert.match(problems, /<button> “” \(button\): no accessible name/);
    assert.match(problems, /<div> “plain words” \(no role\): read as nothing, not as a control/);
    assert.match(problems, /“Wrap” \(checkbox\): says no checked state/);
    assert.match(problems, /“One” \(tab\): says no selected state/);
    assert.match(problems, /“More” \(button\): opens a popup but says no expanded state/);
  });

  test('passes controls that are named, read as controls and say their state', () => {
    const window = planted(
      '<button>Save</button><label>Wrap <input type="checkbox"></label><div role="switch" aria-checked="true" ' +
        'tabindex="0" aria-label="Snap"></div><button aria-haspopup="menu" aria-expanded="false">More</button>' +
        '<details><summary>Notes</summary>words</details><a href="#x">Go</a>',
    );
    assert.deepEqual(treeProblems(window), []);
    assert.equal(controlsOf(window).length, 6, 'it found every control');
  });

  test('skips what a screen reader cannot reach: hidden, aria-hidden and inert parts', () => {
    const window = planted(
      '<button hidden></button><div aria-hidden="true"><button></button></div><div inert><button></button></div>',
    );
    assert.deepEqual(treeProblems(window), []);
  });

  test('finds a drawing with no text version, one that counts too few, and a thing drawn but not listed', () => {
    const box = (key, name) => `<g class="node" data-key="${key}" aria-label="Thing: ${name}"><text>${name}</text></g>`;
    const svg = (...boxes) => `<svg class="thoughtknot-svg">${boxes.join('')}</svg>`;
    const lone = planted(svg(box('a', 'Alpha'))).document;
    assert.deepEqual(textVersionProblems(lone), ['a drawing with no text version describing it']);
    const short = planted(
      `<div aria-describedby="t">${svg(box('a', 'Alpha'), box('b', 'Beta'))}</div>` +
        '<ul id="t"><li>Graph g: 1 thing, 0 links.</li><li>Alpha is a Thing.</li></ul>',
    ).document;
    assert.deepEqual(textVersionProblems(short), [
      'graph g: the text version counts 1 things, 2 are drawn',
      'graph g: b (“Thing: Beta”) is drawn but not in the text version',
    ]);
    const whole = planted(
      `<div aria-describedby="t">${svg(box('a', 'Alpha'), box('b', 'Beta'))}</div>` +
        '<ul id="t"><li>Graph g: 2 things, 1 link.</li><li>Alpha is a Thing.</li><li>Beta is a Thing.</li></ul>',
    ).document;
    assert.deepEqual(textVersionProblems(whole), []);
  });
});

describe('the Obsidian host: every view', () => {
  before(() => build());

  for (const [name, open] of Object.entries(OBSIDIAN))
    test(`${name}: every control named, read as a control and saying its state; the text version matches`, async () => {
      const { env, el } = await open();
      try {
        const { window } = openWindow(pageFor({ html: toHtml(el), css: styles, theme: 'light' }));
        try {
          assert.deepEqual(treeProblems(window), []);
          assert.deepEqual(textVersionProblems(window.document), []);
        } finally {
          window.close();
        }
      } finally {
        env.uninstall();
      }
    });
});

describe('the browser editor’s page: every state', () => {
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

  for (const [name, state] of Object.entries(STATES))
    test(`${name}: every control named, read as a control and saying its state; the text version matches`, async () => {
      const page = await state();
      try {
        styleFor(dir, page.window, 'light');
        assert.deepEqual(treeProblems(page.window), []);
        assert.deepEqual(textVersionProblems(page.window.document), []);
      } finally {
        page.window.close();
      }
    });
});
