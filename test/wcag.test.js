// WCAG 2.2 Level AA in every interface of every host (editor spec §11; wcag_aa, wcag_new_hosts, wcag_checked). Every view
// and page of every host is put through an automated check, in the light and the dark theme: axe-core's rules for WCAG 2.0,
// 2.1 and 2.2 at A and AA (names, roles, labels, language, headings, ARIA and the like), and the contrast of every piece of
// text (SC 1.4.3), worked out from the real stylesheet with the theme's own colours. The check itself is tried first, on
// planted faults, so a pass means it looked. Test support: test/repository/wcag.js and wcag-page.js.
//
// A view a later workstream adds gets its case in test/repository/views-obsidian.js or views-page.js, with the same
// commit as the view.
//
// Not done here, because jsdom has no layout or paint: the contrast of lines and controls (SC 1.4.11) and text
// spacing (SC 1.4.12); target size and reflow (SC 2.5.8, 1.4.10) are held in a real Chrome, by
// test/a11y-targets-reflow.test.js. The release walk-through (RELEASING.md, "Accessibility walk-through") covers those
// by hand, with the keyboard and a screen reader.
// Obsidian draws its own settings page from the plugin's definitions; the stand-in for it labels each control by its row's
// name, which is how a screen reader reads a settings row, and the plugin's part (every row named, no two alike) is held
// directly. Obsidian draws its own menus too, from the items the plugin gives it: the stand-in for one lists them as a
// screen reader reads a menu, and the plugin's part (every item named) is held directly. The drawing's own colours are
// held by test/accessibility.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { build, load } from '../packages/obsidian/test/host/load-plugin.js';
import { styles } from '../packages/obsidian/test/host/view-notes.js';
import { editing, row, tapKey } from '../packages/obsidian/test/host/inspector-steps.js';
import * as cardNotes from '../packages/obsidian/test/host/card-notes.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { THEMES, audit, auditView, openWindow, pageFor, obsidianVariables } from './repository/wcag.js';
import { auditPage, openEditorPage } from './repository/wcag-page.js';
import { OBSIDIAN } from './repository/views-obsidian.js';
import { pageStates } from './repository/views-page.js';

const here = new URL('../', import.meta.url).pathname;

/** What a check found, as text for a failure message: nothing is the pass. */
const found = (r) => r.problems;

describe('the check itself', () => {
  const planted = (html, theme = 'light') => audit(openWindow(pageFor({ html, css: '', theme })), theme, '#ffffff');

  test('finds a control with no name, an image with no alternative and a field with no label', async () => {
    const r = await planted('<button></button><img src="x.png"><input type="text">');
    const rules = r.problems.map((p) => p.split(' ')[0]);
    assert.ok(rules.includes('button-name'), r.problems.join('\n'));
    assert.ok(rules.includes('image-alt'), r.problems.join('\n'));
    assert.ok(rules.includes('label'), r.problems.join('\n'));
  });

  test('finds text too pale for its page, in either theme, and passes text that is not', async () => {
    const pale = '<p style="color: #aaaaaa">pale words</p>';
    assert.match((await planted(pale)).problems.join('\n'), /contrast 2\.\d\d:1/);
    const dim = '<p style="color: #444444">dim words</p>';
    assert.match((await planted(dim, 'dark')).problems.join('\n'), /contrast 1\.\d\d:1|contrast 2\.\d\d:1/);
    assert.deepEqual(found(await planted('<p>plain words</p>')), []);
  });

  test('reads large text against 3:1 and everything else against 4.5:1', async () => {
    const grey = '#868686'; // 3.5:1 on white
    assert.deepEqual(found(await planted(`<p style="color: ${grey}; font-size: 24px">large</p>`)), []);
    assert.match(
      (await planted(`<p style="color: ${grey}; font-size: 16px">small</p>`)).problems.join(''),
      /needs 4\.5:1/,
    );
  });

  test('runs a good number of axe rules, so a pass means it looked', async () => {
    const r = await planted('<p>words</p>');
    assert.ok(r.rules >= 5, `${r.rules} rules`);
  });

  test('puts in the theme’s own colours for the variables the styles name', () => {
    assert.equal(obsidianVariables('light')['--background-primary'], '#ffffff');
    assert.equal(obsidianVariables('dark')['--background-primary'], '#1e1e1e');
  });
});

describe('the Obsidian host: every view, in both themes', () => {
  before(() => build());

  for (const [name, open] of Object.entries(OBSIDIAN))
    for (const theme of THEMES)
      test(`${name} meets WCAG 2.2 AA in the ${theme} theme`, async () => {
        const { env, el } = await open();
        try {
          const result = await auditView(el, styles, theme);
          assert.ok(result.rules >= 10, 'the check ran its rules');
          assert.deepEqual(found(result), []);
        } finally {
          env.uninstall();
        }
      });

  test('a menu the plugin gives Obsidian names every item, and reads as a menu, in both themes', async () => {
    const env = await load({ files: { [cardNotes.PATH]: cardNotes.NOTE } });
    try {
      const el = await editing(env);
      tapKey(el, 'large');
      row(el.querySelector('.graph-note-details'), 'name').querySelector('.metadata-property-icon').click();
      const { items } = env.state.menus.at(-1);
      assert.ok(items.length > 1, 'the property type menu');
      for (const item of items) assert.ok(item.title.trim(), `an item with no name: ${JSON.stringify(item)}`);
      const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const html = `<div class="menu" role="menu" aria-label="Property type">${items
        .map(
          (i) =>
            `<div class="menu-item" role="menuitem" tabindex="-1"><span class="menu-item-title">${escape(i.title)}</span></div>`,
        )
        .join('')}</div>`;
      for (const theme of THEMES) {
        const result = await audit(
          openWindow(pageFor({ html, css: styles, theme })),
          theme,
          obsidianVariables(theme)['--background-primary'],
        );
        assert.ok(result.rules >= 5, 'the check ran its rules');
        assert.deepEqual(found(result), [], theme);
      }
    } finally {
      env.uninstall();
    }
  });

  test('every row of the settings page has a name, and no two rows of a group share one', async () => {
    const { env, el } = await OBSIDIAN['the settings page']();
    try {
      for (const row of el.querySelectorAll('.setting-item')) {
        // a row is named, or holds only buttons that are (the add button of a list)
        const named = row.querySelector('.setting-item-name')?.textContent;
        const buttons = row.querySelectorAll('button');
        assert.ok(
          named || (buttons.length > 0 && buttons.every((b) => b.getAttribute('aria-label'))),
          `a row with no name: ${row.textContent}`,
        );
      }
      const names = el
        .querySelectorAll('.setting-item')
        .filter((r) => !r.hasClass('setting-item-heading') && r.querySelector('.setting-item-name')?.textContent)
        .map((r) => r.querySelector('.setting-item-name').textContent);
      // the model pages repeat Name, Purpose and the like, each under its own model; the top page does not
      const top = el.children
        .filter((r) => r.hasClass('setting-item') && !r.hasClass('setting-item-heading'))
        .map((r) => r.querySelector('.setting-item-name')?.textContent)
        .filter(Boolean);
      assert.equal(new Set(top).size, top.length, `repeated: ${top.join(' | ')}`);
      assert.ok(names.length > 5);
    } finally {
      env.uninstall();
    }
  });
});

describe('the browser editor’s page: every state, in both themes', () => {
  let dir;
  const opened = [];
  before(async () => {
    ({ dir } = await built());
  });
  after(async () => {
    await Promise.all(opened.map((o) => o.stop()));
    await cleanUp();
  });

  /** The page opened as the pane opens it (the token and the note in the address), or with neither. */
  const open = (hash, note, draft) => {
    const page = openEditorPage(dir, hash, note, draft);
    opened.push(page);
    return page;
  };
  const STATES = pageStates(open);

  for (const [name, state] of Object.entries(STATES))
    for (const theme of THEMES)
      test(`${name} meets WCAG 2.2 AA in the ${theme} theme`, async () => {
        const page = await state();
        const result = await auditPage(dir, page, theme);
        assert.ok(result.rules >= 5, 'the check ran its rules');
        assert.deepEqual(found(result), []);
      });
});

describe('every host', () => {
  /** The packages that are hosts, which draw an interface: the others are libraries with none. */
  const LIBRARIES = ['core', 'graph-spec'];
  /** The hosts this file checks, with the views it checks of each. */
  const HOSTS = { obsidian: Object.keys(OBSIDIAN), 'claude-code': ['the browser editor’s page'] };

  test('has its views checked here before it can be released: a new host with no entry fails', () => {
    const hosts = readdirSync(`${here}packages`).filter((p) => !LIBRARIES.includes(p));
    assert.deepEqual(hosts.sort(), Object.keys(HOSTS).sort());
    for (const [host, views] of Object.entries(HOSTS)) assert.ok(views.length > 0, host);
  });

  test('is named in the spec: every interface, in every host, WCAG 2.2 Level AA', () => {
    const spec = readFileSync(`${here}requirements/editor-requirements.gql`, 'utf8');
    for (const id of ['wcag_aa', 'wcag_new_hosts', 'wcag_checked'])
      assert.match(spec, new RegExp(`\\(${id}\\)-\\[:PROVED_BY\\]->\\(test_wcag\\)`), id);
  });
});
