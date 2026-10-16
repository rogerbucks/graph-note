// WCAG 2.2 Level AA in every interface of every host (editor spec §11; wcag_aa, wcag_new_hosts, wcag_checked). Every view
// and page of every host is put through an automated check, in the light and the dark theme: axe-core's rules for WCAG 2.0,
// 2.1 and 2.2 at A and AA (names, roles, labels, language, headings, ARIA and the like), and the contrast of every piece of
// text (SC 1.4.3), worked out from the real stylesheet with the theme's own colours. The check itself is tried first, on
// planted faults, so a pass means it looked. Test support: test/repository/wcag.js and wcag-page.js.
//
// Not done here, because jsdom has no layout or paint: the contrast of lines and controls (SC 1.4.11), target size
// (SC 2.5.8; the details sheet's 44-point cases hold it), reflow and text spacing (SC 1.4.10, 1.4.12). The release
// walk-through (RELEASING.md, "Accessibility walk-through") covers those by hand, with the keyboard and a screen reader.
// Obsidian draws its own settings page from the plugin's definitions; the stand-in for it labels each control by its row's
// name, which is how a screen reader reads a settings row, and the plugin's part (every row named, no two alike) is held
// directly. The drawing's own colours are held by test/accessibility.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';
import { GRAPH, show, styles } from '../packages/obsidian/test/host/view-notes.js';
import { fence, labelled } from '../packages/obsidian/test/host/notes.js';
import { tapKey } from '../packages/obsidian/test/host/inspector-steps.js';
import * as cardNotes from '../packages/obsidian/test/host/card-notes.js';
import * as paneNotes from '../packages/obsidian/test/host/pane-notes.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { browserHost } from '../packages/claude-code/page/browser-host.ts';
import { THEMES, audit, auditView, openWindow, pageFor, obsidianVariables } from './repository/wcag.js';
import { auditPage, openEditorPage } from './repository/wcag-page.js';

const here = new URL('../', import.meta.url).pathname;

/** What a check found, as text for a failure message: nothing is the pass. */
const found = (r) => r.problems;

// a missing comma on line 2: read as meant, and a departure from standard GQL, so the badge has problems to list
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";

/** The views of the Obsidian host: each draws itself with `open(env)` and gives the element to check; `uninstall` follows. */
const OBSIDIAN = {
  'a card (reading view)': async () => {
    const env = await load();
    const { el } = await show(env, `# N\n\n${fence(GRAPH)}\n`);
    return { env, el };
  },
  'a card with its problems listed': async () => {
    const env = await load();
    const { el } = await show(env, `# N\n\n${fence(SLIP)}\n`);
    el.querySelector('.graph-note-badge').click();
    return { env, el };
  },
  'the details of a thing, as a sheet': async () => {
    const env = await load();
    const { el } = await show(env, `# N\n\n${fence(GRAPH)}\n`);
    tapKey(el, 'q');
    assert.ok(el.querySelector('.graph-note-details'), 'the details open');
    return { env, el };
  },
  'the details after a choice, with the trail': async () => {
    const env = await load();
    const { el } = await show(env, `# N\n\n${fence(GRAPH)}\n`);
    tapKey(el, 'q');
    el.querySelector('button.graph-note-link-thing').click();
    assert.ok(labelled(el, 'Back to Which device?') ?? el.querySelector('.graph-note-trail button'), 'a trail');
    return { env, el };
  },
  'a card being edited in place': async () => {
    const env = await load({ files: { [cardNotes.PATH]: cardNotes.NOTE } });
    const el = await cardNotes.show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    return { env, el };
  },
  'the properties form of a thing, while editing in place': async () => {
    const env = await load({ files: { [cardNotes.PATH]: cardNotes.NOTE } });
    const el = await cardNotes.show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    tapKey(el, 'large');
    assert.ok(el.querySelector('.metadata-property'), 'the form opens');
    return { env, el };
  },
  'the edit pane': async () => {
    const env = await paneNotes.open();
    await until(() => env.el.querySelectorAll('g.node').length === 3);
    return { env, el: env.el };
  },
  'the settings page': async () => {
    const env = await load({
      files: { 'S.md': `# S\n\n${fence(SLIP)}\n` },
      data: {
        aiModels: [
          { name: 'Local', purpose: 'summaries', ceiling: 'Public', model: 'm', endpoint: 'http://localhost:1/v1' },
        ],
      },
    });
    const tab = env.state.settingTabs[0];
    tab.display();
    nameControlsByRow(tab.containerEl);
    return { env, el: tab.containerEl };
  },
};

/** Each control in a settings row is named by the row's name, as a screen reader reads Obsidian's page. */
function nameControlsByRow(page) {
  page.querySelectorAll('.setting-item').forEach((row, n) => {
    const name = row.querySelector('.setting-item-name');
    if (!name?.textContent) return;
    name.setAttribute('id', `setting-name-${n}`);
    for (const c of row.querySelectorAll('input, select, textarea'))
      if (!c.getAttribute('aria-label')) c.setAttribute('aria-labelledby', `setting-name-${n}`);
  });
}

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
  const open = (hash) => {
    const page = openEditorPage(dir, hash);
    opened.push(page);
    return page;
  };
  const withNote = '#token=t&note=Reader.md';
  const drawn = (page) => until(() => !!page.window.document.querySelector('.gn-drawing img'));

  const STATES = {
    'before the note is opened, saying how to open it': async () => open(''),
    'the note: words, a code block, a link, and the graph drawn with its words': async () => {
      const page = open(withNote);
      await drawn(page);
      return page;
    },
    'the export form open': async () => {
      const page = open(withNote);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('.graph-note-bar button'));
      page.window.document.querySelector('.graph-note-bar button').click();
      await until(() => !!page.window.document.querySelector('.graph-note-export'));
      return page;
    },
    'a notice shown': async () => {
      const page = open(withNote);
      await drawn(page);
      browserHost(page.window).notice('Exported two files.');
      return page;
    },
    'a menu open': async () => {
      const page = open(withNote);
      await drawn(page);
      browserHost(page.window).menu(
        [
          { title: 'Export as SVG', icon: 'download', onClick() {} },
          'separator',
          { title: 'Delete', icon: 'trash', warning: true, onClick() {} },
        ],
        { x: 20, y: 20 },
        page.window.document,
      );
      return page;
    },
  };

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
