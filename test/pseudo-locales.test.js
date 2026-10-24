// The test languages, in every view of every host (editor spec §42, pseudo_locales_checked). Each view is drawn with
// the host in `en-XA` (every catalogue word accented, bracketed and 40 per cent longer). It is drawn again in `ar-XB`
// (the same, read right to left). It fails on any of these:
// - a word of the catalogue left in UK English;
// - a view not read in the language's direction;
// - a part set on a physical side where it should follow the reading direction.
// The words the code still says itself, not yet in the catalogue, are counted and may not grow. A box too small for a
// longer word is held in the style sheets. No box that holds words has a fixed width. None clips or keeps a line from
// wrapping unless listed here with why.
//
// The hosts: Obsidian, the browser editor's page, the VS Code tab and the desktop app. VS Code's display language is
// set to each test language, and so is the system's for the app. The app is run on its first page and its editor.
//
// Not done here, because jsdom has no layout: whether a longer word is cut off or drawn over another as laid out.
// test/pseudo-layout.test.js checks that in a real browser, in every view of both hosts.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, speakIn } from '../packages/obsidian/test/host/load-plugin.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { isPseudoWord, PSEUDO_LANGUAGES, setLanguage, SOURCE_LANGUAGE, SOURCE_WORDS } from '@thoughtknot/core';
import { openWindow, toHtml } from './repository/wcag.js';
import { openEditorPage } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { SHEETS, rulesOf, valueOf } from './repository/sheet-rules.js';
import {
  cleanUpApp,
  emptyFolder as emptyAppFolder,
  openAppEditor,
  openAppStart,
} from '../packages/app/test/app-window.js';
import { cleanUpVscode, emptyFolder, openVscodeTab } from '../packages/vscode/test/vscode-window.js';
import { NOTE } from './repository/journey-note.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LANGUAGES = Object.entries(PSEUDO_LANGUAGES);

/** The views Obsidian draws itself, from what the plugin gives it, in its own direction: the plugin sets none on them. */
const DRAWN_BY_OBSIDIAN = ['the settings page'];

/** The words the code still says itself in each host's views, not yet from the catalogue: lowered as each moves there. */
const STILL_SAID_BY_CODE = { obsidian: 39, page: 13, vscode: 5, app: 5 };

/** The parts set at a point measured on the screen, by class: these keep a physical side (as in test/rtl.test.js). */
const PLACED = [
  'thoughtknot-table',
  'thoughtknot-svg',
  'thoughtknot-sheet',
  'thoughtknot-pointer',
  'thoughtknot-quick-info',
  'gn-menu',
];

/**
 * Each catalogue word as a pattern of a whole text. In it, a count stands for a number, and any other placeholder for a
 * name with no stop or comma in it. So a sentence the code says itself is not taken for one: in a test language none
 * shows. A word that is placeholders alone says nothing of its own, so has no pattern. Nor has one that is two
 * placeholders joined by one word, as "{written} to {taken}" is: it matches any text with that word.
 */
const SOURCE_PATTERNS = Object.entries(SOURCE_WORDS).flatMap(([key, entry]) =>
  (typeof entry === 'string' ? [entry] : Object.values(entry))
    .filter((text) => /[a-zA-Z]/.test(text.replace(/\{[a-zA-Z0-9]+\}/g, '')))
    .filter((text) => !/^\{[a-zA-Z0-9]+\},? [a-z]+ \{[a-zA-Z0-9]+\}$/.test(text))
    .map((text) => ({
      key,
      pattern: new RegExp(
        `^${text
          .split(/(\{[a-zA-Z0-9]+\})/)
          .map((p, i) =>
            i % 2 ? (p === '{count}' ? '\\d[\\d,. ]*' : '[^,.:;]*?') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('')}$`,
      ),
    })),
);

/** The words the person reads in a document, outside the drawing: each text and each name, title or hint. */
function wordsOf(document) {
  const outside = (el) => !el.closest('svg');
  const texts = [];
  const walker = document.createTreeWalker(document.body, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    if (outside(n.parentElement) && n.textContent.trim()) texts.push(n.textContent.trim());
  for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder], [alt]'))
    if (outside(el))
      for (const a of ['aria-label', 'title', 'placeholder', 'alt'])
        if (el.getAttribute(a)?.trim()) texts.push(el.getAttribute(a).trim());
  return texts;
}

/** The words of controls and their names the code says itself: not from the catalogue, so left in UK English. */
function saidByCode(document) {
  const outside = (el) => !el.closest('svg');
  const said = new Set();
  for (const el of document.body.querySelectorAll('button, label, option, legend, summary, th, [role="button"]'))
    if (outside(el) && /[a-zA-Z]{2}/.test(el.textContent) && !isPseudoWord(el.textContent))
      said.add(el.textContent.trim());
  for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder]'))
    if (outside(el))
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a)?.trim();
        if (v && /[a-zA-Z]{2}/.test(v) && !isPseudoWord(v)) said.add(v);
      }
  return said;
}

/** The catalogue words a document shows in UK English, by key. */
const leftInSource = (document) =>
  wordsOf(document).flatMap((t) => SOURCE_PATTERNS.filter((p) => p.pattern.test(t)).map((p) => `${p.key}: ${t}`));

/** The parts a document sets on a physical side by an inline style, other than those placed at a measured point. */
function physicalSides(document) {
  return [...document.querySelectorAll('[style]')]
    .filter((el) => !PLACED.some((c) => el.closest(`.${c}`)))
    .filter((el) =>
      /(?:^|;)\s*(?:left|right|(?:margin|padding|border)-(?:left|right))\s*:/.test(el.getAttribute('style')),
    )
    .map((el) => `${el.className}: ${el.getAttribute('style')}`);
}

/** The directions the parts of the interface are read in, each once: the `dir` each view's root was set to. */
function directionsOf(el, found = new Set()) {
  if (typeof el.dir === 'string' && el.dir) found.add(el.dir);
  for (const c of el.children ?? []) directionsOf(c, found);
  return found;
}

describe('the check itself', () => {
  test('finds a catalogue word left in UK English, and a part set on a physical side', () => {
    const { document } = openWindow(
      '<body><button aria-label="Copy"></button><p>3 things found.</p><div style="margin-left: 4px"></div></body>',
    ).window;
    assert.deepEqual(leftInSource(document).sort(), ['code.copy: Copy', 'find.found: 3 things found.']);
    assert.equal(physicalSides(document).length, 1);
  });

  test('passes a word in a test language, and counts a control’s word the code said itself', () => {
    const { document } = openWindow(
      '<body><button aria-label="⟦Ƈǿƥẏ ··⟧"></button><button>Close</button></body>',
    ).window;
    assert.deepEqual(leftInSource(document), []);
    assert.deepEqual([...saidByCode(document)], ['Close']);
  });
});

describe('the Obsidian host: every view, in each test language', () => {
  before(() => build());
  after(() => {
    speakIn(undefined);
    setLanguage(SOURCE_LANGUAGE);
  });
  const still = new Set();

  for (const [tag, direction] of LANGUAGES)
    for (const [name, open] of Object.entries(OBSIDIAN))
      test(`${name}, in ${tag}`, async () => {
        // the host speaks the test language, and so do the steps that find its controls by name
        speakIn(tag);
        setLanguage(tag);
        const { env, el } = await open();
        try {
          const roots = [el, ...env.doc.body.children];
          const directions = new Set(roots.flatMap((r) => [...directionsOf(r)]));
          if (!DRAWN_BY_OBSIDIAN.includes(name))
            assert.deepEqual([...directions], [direction], 'every view reads in the language’s direction');
          const { document } = openWindow(`<body>${toHtml(el)}</body>`).window;
          assert.deepEqual(leftInSource(document), [], 'a catalogue word left in UK English');
          assert.deepEqual(physicalSides(document), [], 'set it by inset-inline-start or margin-inline-end');
          for (const w of saidByCode(document)) still.add(w);
        } finally {
          env.uninstall();
        }
      });

  test('the words the code still says itself are no more than before', () => {
    assert.ok(
      still.size <= STILL_SAID_BY_CODE.obsidian,
      `${still.size} words, the most is ${STILL_SAID_BY_CODE.obsidian}: say each new one by a key of source-words.ts\n${[...still].sort().join('\n')}`,
    );
    assert.equal(still.size, STILL_SAID_BY_CODE.obsidian, 'fewer words than before: lower STILL_SAID_BY_CODE to match');
  });
});

describe('the browser editor’s page: every state, in each test language', () => {
  let dir;
  const opened = [];
  const still = new Set();
  before(async () => {
    ({ dir } = await built());
  });
  after(async () => {
    setLanguage(SOURCE_LANGUAGE);
    await Promise.all(opened.map((o) => o.stop()));
    await cleanUp();
  });

  for (const [tag, direction] of LANGUAGES) {
    const STATES = pageStates((hash, note, draft) => {
      const page = openEditorPage(dir, hash, note, draft, tag);
      opened.push(page);
      return page;
    });
    for (const [name, state] of Object.entries(STATES))
      test(`${name}, in ${tag}`, async () => {
        // each state can open more than one page; stopped here, not at the end, so their windows and threads are freed
        const first = opened.length;
        after(() => Promise.all(opened.splice(first).map((o) => o.stop())));
        setLanguage(tag);
        const page = await state();
        const { document } = page.window;
        try {
          assert.equal(document.documentElement.dir, direction, 'the page reads in the language’s direction');
          assert.deepEqual(leftInSource(document), [], 'a catalogue word left in UK English');
          assert.deepEqual(physicalSides(document), [], 'set it by inset-inline-start or margin-inline-end');
          for (const w of saidByCode(document)) still.add(w);
        } finally {
          page.dom.window.close();
        }
      });
  }

  test('the words the code still says itself are no more than before', () => {
    assert.ok(
      still.size <= STILL_SAID_BY_CODE.page,
      `${still.size} words, the most is ${STILL_SAID_BY_CODE.page}: say each new one by a key of source-words.ts\n${[...still].sort().join('\n')}`,
    );
    assert.equal(still.size, STILL_SAID_BY_CODE.page, 'fewer words than before: lower STILL_SAID_BY_CODE to match');
  });
});

/** The rules that clip words or keep them on one line, each with why: a longer language would be cut off in any other. */
const CLIPS = {
  '.thoughtknot-view': 'the card, whose words wrap inside it; it clips only its rounded corners',
  '.thoughtknot-viewport': 'the drawing, which is moved and zoomed inside it',
  '.thoughtknot-overlay':
    'the coloured picture of the text, which wraps; it clips only the plain-English note after a long line',
  '.thoughtknot-text': 'the field over that picture, which wraps as the picture does and is as tall as it',
  '.thoughtknot-table th': 'a column of the table, which scrolls sideways when wide',
  '.thoughtknot-table td': 'a cell of the table, which scrolls sideways when wide',
  '.thoughtknot-sr': 'the screen reader’s text, kept off the screen on purpose',
  '.thoughtknot-view > .thoughtknot-details.thoughtknot-sheet':
    'the sheet, a size the person set; its words wrap in its body, which scrolls',
  '.thoughtknot-link-reading':
    'a link’s reading, one line of the details; its full words are read out and in the drawing',
  '.thoughtknot-link-row button.thoughtknot-link-thing':
    'a linked thing, one line of the details; its full name is its button’s words, read out whole',
};

/** The rules with a fixed width that hold no words, each with why. */
const HOLDS_NO_WORDS = {
  '.thoughtknot-swatch': 'a line in a colour of the drawing',
  '.thoughtknot-sr': 'the screen reader’s text, kept off the screen on purpose',
  '.gn-icon': 'an icon',
  '.thoughtknot-switch-track': 'a switch drawn as a toggle; its words sit beside it',
  '.thoughtknot-switch-track::before': 'the toggle’s knob',
  '.is-dock-left > .thoughtknot-sheet-resizer': 'the sheet’s resize bar',
  '.is-dock-right > .thoughtknot-sheet-resizer': 'the sheet’s resize bar',
  '.is-dock-bottom > .thoughtknot-sheet-resizer::after': 'the line drawn on the resize bar',
  '.is-dock-top > .thoughtknot-sheet-resizer::after': 'the line drawn on the resize bar',
  '.is-dock-left > .thoughtknot-sheet-resizer::after': 'the line drawn on the resize bar',
  '.is-dock-right > .thoughtknot-sheet-resizer::after': 'the line drawn on the resize bar',
};

/** A length that does not grow with the words: pixels, points, em or characters. */
const FIXED = /(?<![\w.-])\d*\.?\d+(?:px|pt|r?em|ch)\b/;

describe('the VS Code tab: the note drawn and edited, in each test language', () => {
  const still = new Set();
  after(async () => {
    setLanguage(SOURCE_LANGUAGE);
    cleanUpVscode();
  });

  for (const [tag, direction] of LANGUAGES)
    test(`the tab and the extension's own words, with VS Code in ${tag}`, async () => {
      const folder = emptyFolder();
      writeFileSync(join(folder, 'Reader.md'), NOTE);
      // VS Code's display language is the test language: the tab's page and the extension follow it
      const tab = await openVscodeTab(folder, 'Reader.md', { language: tag });
      try {
        await tab.ready();
        setLanguage(tag);
        const { document } = tab.window;
        assert.ok(isPseudoWord(tab.vs.tabs[0].title.replace('Reader.md', '').trim()), tab.vs.tabs[0].title);
        assert.equal(document.documentElement.dir, direction, 'the page reads in the language’s direction');
        assert.deepEqual(leftInSource(document), [], 'a catalogue word left in UK English');
        assert.deepEqual(physicalSides(document), [], 'set it by inset-inline-start or margin-inline-end');
        for (const w of saidByCode(document)) still.add(w);
      } finally {
        await tab.stop();
      }
    });

  test('the words the code still says itself are no more than before', () => {
    assert.ok(
      still.size <= STILL_SAID_BY_CODE.vscode,
      `${still.size} words, the most is ${STILL_SAID_BY_CODE.vscode}: say each new one by a key of source-words.ts\n${[...still].sort().join('\n')}`,
    );
    assert.equal(still.size, STILL_SAID_BY_CODE.vscode, 'fewer words than before: lower STILL_SAID_BY_CODE to match');
  });
});

describe('the desktop app: its first page and its editor, in each test language', () => {
  const still = new Set();
  after(() => {
    setLanguage(SOURCE_LANGUAGE);
    cleanUpApp();
  });

  for (const [tag, direction] of LANGUAGES)
    test(`the first page and the editor, with the system in ${tag}`, async () => {
      const folder = emptyAppFolder();
      writeFileSync(join(folder, 'Reader.md'), NOTE);
      const start = await openAppStart(folder, tag);
      const editor = await openAppEditor(folder, 'Reader.md', tag);
      try {
        await editor.ready();
        setLanguage(tag);
        for (const { doc } of [start, editor]) {
          assert.equal(doc.documentElement.dir, direction, 'the page reads in the language’s direction');
          assert.deepEqual(leftInSource(doc), [], 'a catalogue word left in UK English');
          assert.deepEqual(physicalSides(doc), [], 'set it by inset-inline-start or margin-inline-end');
          for (const w of saidByCode(doc)) still.add(w);
        }
      } finally {
        await start.stop();
        await editor.stop();
      }
    });

  test('the words the code still says itself are no more than before', () => {
    assert.ok(
      still.size <= STILL_SAID_BY_CODE.app,
      `${still.size} words, the most is ${STILL_SAID_BY_CODE.app}: say each new one by a key of source-words.ts\n${[...still].sort().join('\n')}`,
    );
    assert.equal(still.size, STILL_SAID_BY_CODE.app, 'fewer words than before: lower STILL_SAID_BY_CODE to match');
  });
});

describe('a longer language fits every box', () => {
  for (const sheet of SHEETS) {
    test(`${sheet} fixes the width of no box that holds words`, () => {
      const fixed = rulesOf(sheet)
        .filter((r) => !r.selectors.every((s) => s.startsWith('.thoughtknot-svg')))
        .filter((r) => FIXED.test(valueOf(r, 'width') ?? ''))
        .filter((r) => !r.selectors.every((s) => Object.hasOwn(HOLDS_NO_WORDS, s)))
        .map((r) => `${r.selectors.join(', ')} → width: ${valueOf(r, 'width')}`);
      assert.deepEqual(
        fixed,
        [],
        'let it grow with its words (a max-width lets them wrap), or list it in HOLDS_NO_WORDS',
      );
    });

    test(`${sheet} clips no words and keeps none from wrapping, but those listed`, () => {
      const clipping = rulesOf(sheet)
        .filter((r) => valueOf(r, 'overflow') === 'hidden' || valueOf(r, 'white-space') === 'nowrap')
        .flatMap((r) => r.selectors)
        .filter((s) => !Object.hasOwn(CLIPS, s));
      assert.deepEqual(clipping, [], 'let the words wrap, or list the rule in CLIPS with why');
    });
  }

  test('every rule listed as clipping or holding no words is still in its sheet', () => {
    const selectors = new Set(SHEETS.flatMap((s) => rulesOf(s)).flatMap((r) => r.selectors));
    for (const s of [...Object.keys(CLIPS), ...Object.keys(HOLDS_NO_WORDS)]) assert.ok(selectors.has(s), s);
  });
});
