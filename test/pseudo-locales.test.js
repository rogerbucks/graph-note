// The test languages, in every view of every host (editor spec §42, pseudo_locales_checked): each view is drawn with the
// host in `en-XA` (every catalogue word accented, bracketed and 40 per cent longer) and in `ar-XB` (the same, read right to
// left), and fails on a word of the catalogue left in UK English, a view not read in the language's direction, or a part
// set on a physical side where it should follow the reading direction. The words the code still says itself, not yet in
// the catalogue, are counted and may not grow. A box too small for a longer word is held in the style sheets: no box that
// holds words has a fixed width, and none clips or keeps a line from wrapping unless listed here with why.
//
// Not done here, because jsdom has no layout: whether a longer word overlaps another part as drawn. The release
// walk-through (RELEASING.md, AX-20 and AX-21) covers that by hand, with the browser page in the test languages.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, speakIn } from '../packages/obsidian/test/host/load-plugin.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { isPseudoWord, PSEUDO_LANGUAGES, setLanguage, SOURCE_LANGUAGE, SOURCE_WORDS } from '@graph-note/core';
import { openWindow, toHtml } from './repository/wcag.js';
import { openEditorPage } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { SHEETS, rulesOf, valueOf } from './repository/sheet-rules.js';

const LANGUAGES = Object.entries(PSEUDO_LANGUAGES);

/** The views Obsidian draws itself, from what the plugin gives it, in its own direction: the plugin sets none on them. */
const DRAWN_BY_OBSIDIAN = ['the settings page'];

/** The words the code still says itself in each host's views, not yet from the catalogue: lowered as each moves there. */
const STILL_SAID_BY_CODE = { obsidian: 103, page: 36 };

/** The parts set at a point measured on the screen, by class: these keep a physical side (as in test/rtl.test.js). */
const PLACED = [
  'graph-note-table',
  'graph-note-svg',
  'graph-note-sheet',
  'graph-note-pointer',
  'graph-note-quick-info',
  'gn-menu',
];

/**
 * Each catalogue word as a pattern of a whole text, a count standing for a number and any other placeholder for a name
 * with no stop or comma in it, so a sentence the code says itself is not taken for one: in a test language none shows. A word that is placeholders
 * alone says nothing of its own, so has no pattern.
 */
const SOURCE_PATTERNS = Object.entries(SOURCE_WORDS).flatMap(([key, entry]) =>
  (typeof entry === 'string' ? [entry] : Object.values(entry))
    .filter((text) => /[a-zA-Z]/.test(text.replace(/\{[a-zA-Z0-9]+\}/g, '')))
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
  '.graph-note-view': 'the card, whose words wrap inside it; it clips only its rounded corners',
  '.graph-note-viewport': 'the drawing, which is moved and zoomed inside it',
  '.graph-note-table th': 'a column of the table, which scrolls sideways when wide',
  '.graph-note-table td': 'a cell of the table, which scrolls sideways when wide',
  '.graph-note-sr': 'the screen reader’s text, kept off the screen on purpose',
};

/** The rules with a fixed width that hold no words, each with why. */
const HOLDS_NO_WORDS = {
  '.graph-note-swatch': 'a line in a colour of the drawing',
  '.graph-note-sr': 'the screen reader’s text, kept off the screen on purpose',
  '.gn-icon': 'an icon',
};

/** A length that does not grow with the words: pixels, points, em or characters. */
const FIXED = /(?<![\w.-])\d*\.?\d+(?:px|pt|r?em|ch)\b/;

describe('a longer language fits every box', () => {
  for (const sheet of SHEETS) {
    test(`${sheet} fixes the width of no box that holds words`, () => {
      const fixed = rulesOf(sheet)
        .filter((r) => !r.selectors.every((s) => s.startsWith('.graph-note-svg')))
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
