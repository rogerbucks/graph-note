// Every view's drawing against its committed reference, in the light and the dark theme (editor spec §41,
// visual_regression_auto). The views are those test/wcag.test.js checks, in test/repository/views-obsidian.js and
// views-page.js. Each drawing is written as its picture by test/repository/visual.js: what is seen, with the theme's
// colours worked out from the real stylesheet.
//
// The picture must be the reference in test/visual/. Each reference must be recorded in quality/visual.json with a
// reason. So a drawing that changes fails until the change is accepted with one. The picture itself is tried first, so
// a pass means it looked.
//
// To accept the drawings as they are now, run this. It writes every reference that differs, with the reason and the day:
//   THOUGHTKNOT_VISUAL_ACCEPT="why" npm run -s test:ai -- test/visual-regression.test.js
// CI never accepts.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { build } from '../packages/obsidian/test/host/load-plugin.js';
import { styles } from '../packages/obsidian/test/host/view-notes.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { THEMES, obsidianVariables, openWindow, pageFor, pageStyleFor, toHtml } from './repository/wcag.js';
import { openEditorPage } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';
import { drawingsIn, pictureOf } from './repository/visual.js';
import { ROOT } from './repository/repo.js';

const REFERENCES = join(ROOT, 'test/visual');
const RECORD = join(ROOT, 'quality/visual.json');
const ACCEPT = process.env.THOUGHTKNOT_VISUAL_ACCEPT?.trim();
if (ACCEPT && process.env.GITHUB_ACTIONS)
  throw new Error('CI never accepts a drawing: accept it on a branch, with a reason');

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const accepted = new Map(record.accepted.map((a) => [a.picture, a]));
/** The reference file for a view's drawings in a theme, as the record names it. */
const referenceOf = (host, view, theme) => `test/visual/${host}/${slug(view)}.${theme}.txt`;
/** Every reference this run drew, so one no view draws any more is found. */
const drawn = new Set();

/** Where `got` first differs from `want`, said for a person: the line, and the part of it around the difference. */
function firstDifference(want, got) {
  const [w, g] = [want.split('\n'), got.split('\n')];
  let n = w.findIndex((line, i) => line !== g[i]);
  if (n === -1) n = w.length;
  const [a, b] = [w[n] ?? '', g[n] ?? ''];
  let c = 0;
  while (c < a.length && a[c] === b[c]) c++;
  const near = (text) =>
    n >= w.length && text === a ? '(nothing)' : JSON.stringify(text.slice(Math.max(0, c - 40), c + 80));
  return `line ${n + 1}: the reference has ${near(a)}, the drawing ${near(b)}`;
}

/**
 * The pictures of a view's drawings in a theme held against its reference: what is wrong, or nothing. When accepting,
 * a picture that differs is written as the reference instead, and recorded.
 */
function differs(host, view, theme, pictures) {
  if (!pictures.length) return null;
  const file = referenceOf(host, view, theme);
  drawn.add(file);
  const got = pictures.join('\n');
  const want = existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : null;
  if (ACCEPT && (got !== want || accepted.get(file)?.sha256 !== sha(got))) {
    mkdirSync(dirname(join(ROOT, file)), { recursive: true });
    writeFileSync(join(ROOT, file), got);
    accepted.set(file, { picture: file, sha256: sha(got), reason: ACCEPT, day: new Date().toISOString().slice(0, 10) });
    return null;
  }
  const how = 'if that is meant, accept it with a reason (this file’s header says how)';
  if (want === null) return `${view} (${theme}) has no reference: ${how}`;
  if (got !== want)
    return `${view} (${theme}) is drawn differently from ${file}, ${firstDifference(want, got)}; ${how}`;
  return null;
}

after(() => {
  if (!ACCEPT) return;
  const kept = [...accepted.values()]
    .filter((a) => drawn.has(a.picture))
    .sort((a, b) => a.picture.localeCompare(b.picture));
  writeFileSync(RECORD, `${JSON.stringify({ ...record, accepted: kept }, null, 2)}\n`);
});

describe('the picture of a drawing', () => {
  const page = (svg, css = '') =>
    openWindow(`<!doctype html><html><head><style>${css}</style></head><body>${svg}</body></html>`).window;
  const picture = (svg, css, theme = 'light') => {
    const window = page(svg, css);
    return pictureOf(window, drawingsIn(window.document.body)[0], obsidianVariables(theme));
  };
  const BOX = `<svg class="thoughtknot-svg" viewBox="0 0 10 10"><g id="node1" class="node q"><title>q</title>
    <path class="box" d="M1.234567,2 L3,4"/><text x="5.005" y="6">Which device?</text></g></svg>`;

  test('says each shape’s geometry and words, rounded to a hundredth, and leaves out what paints nothing', () => {
    const p = picture(BOX, '');
    assert.match(p, /<path d="M1\.23,2 L3,4"/);
    assert.match(p, /<text x="5\.01" y="6".*> Which device\?/);
    assert.doesNotMatch(p, /class=|node1|<title/);
    assert.match(p, /<g id="p1">/, 'an id is numbered in order');
  });

  test('writes each colour the theme’s stylesheet gives, var() and color-mix() worked out', () => {
    const css =
      '.box { stroke: color-mix(in srgb, var(--color-cyan) 50%, var(--text-normal)); } text { fill: var(--text-muted); }';
    const [light, dark] = THEMES.map((theme) => picture(BOX, css, theme));
    assert.match(light, /<path [^>]*paint="[^"]*stroke:rgb\(\d+, \d+, \d+\)/);
    assert.doesNotMatch(light, /var\(|color-mix|#/);
    assert.notEqual(light, dark, 'the two themes paint it differently');
  });

  test('changes when a colour or a shape does, and not when only a class or an id does', () => {
    const base = picture(BOX, '.box { stroke: red; }');
    assert.notEqual(picture(BOX, '.box { stroke: blue; }'), base);
    assert.notEqual(picture(BOX.replace('L3,4', 'L3,5'), '.box { stroke: red; }'), base);
    const renamed = BOX.replace('class="box"', 'class="box edge"').replace('node1', 'n9');
    assert.equal(picture(renamed, '.box { stroke: red; }'), base);
  });
});

describe('the record of the references', () => {
  test('names each reference with its hash, a reason and the day; every reference file is recorded', () => {
    const files = existsSync(REFERENCES)
      ? readdirSync(REFERENCES, { recursive: true })
          .filter((f) => f.endsWith('.txt'))
          .map((f) => relative(ROOT, join(REFERENCES, f)).split('\\').join('/'))
      : [];
    assert.deepEqual(files.sort(), record.accepted.map((a) => a.picture).sort());
    for (const a of record.accepted) {
      assert.ok(a.reason?.trim(), `${a.picture} has no reason`);
      assert.match(a.day ?? '', /^\d{4}-\d{2}-\d{2}$/, a.picture);
      if (!ACCEPT)
        assert.equal(
          sha(readFileSync(join(ROOT, a.picture), 'utf8')),
          a.sha256,
          `${a.picture} was changed with no reason recorded`,
        );
    }
  });
});

describe('the Obsidian host: every view’s drawing, in both themes', () => {
  before(() => build());

  for (const [name, open] of Object.entries(OBSIDIAN))
    test(`${name} is drawn as its reference`, async () => {
      const { env, el } = await open();
      try {
        const wrong = THEMES.map((theme) => {
          const { window } = openWindow(pageFor({ html: toHtml(el), css: styles, theme }));
          const pictures = drawingsIn(window.document.body).map((svg) =>
            pictureOf(window, svg, obsidianVariables(theme)),
          );
          window.close();
          return differs('obsidian', name, theme, pictures);
        });
        assert.deepEqual(wrong.filter(Boolean), []);
      } finally {
        env.uninstall();
      }
    });
});

describe('the browser editor’s page: every state’s drawing, in both themes', () => {
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

  for (const [name, state] of Object.entries(pageStates(open)))
    test(`${name} is drawn as its reference`, async () => {
      const wrong = [];
      for (const theme of THEMES) {
        const page = await state();
        const { window } = page;
        const { style, variables } = pageStyleFor(readFileSync(join(dir, 'page.css'), 'utf8'), theme);
        const sheet = window.document.createElement('style');
        sheet.textContent = style;
        window.document.head.append(sheet);
        const pictures = drawingsIn(window.document.body).map((svg) => pictureOf(window, svg, variables));
        // put away as soon as it is drawn: a page held to the end of the file holds its worker and its DOM
        await page.stop();
        window.close();
        wrong.push(differs('claude-code', name, theme, pictures));
      }
      assert.deepEqual(wrong.filter(Boolean), []);
    });
});

describe('every drawing has its reference', () => {
  test('no reference is left that no view draws, and every host is checked', () => {
    if (ACCEPT) return;
    const stale = record.accepted.map((a) => a.picture).filter((p) => !drawn.has(p));
    assert.deepEqual(stale, [], 'a reference no view draws any more: take it and its record out');
    for (const host of ['obsidian', 'claude-code'])
      assert.ok(
        [...drawn].some((p) => p.startsWith(`test/visual/${host}/`)),
        `${host} has a drawing checked`,
      );
  });
});
