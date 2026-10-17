// WCAG 2.2 Level AA in every interface of every host (editor spec §11; wcag_aa, wcag_new_hosts, wcag_checked). Every view
// and page of every host is put through an automated check, in the light and the dark theme: axe-core's rules for WCAG 2.0,
// 2.1 and 2.2 at A and AA (names, roles, labels, language, headings, ARIA and the like), and the contrast of every piece of
// text (SC 1.4.3), worked out from the real stylesheet with the theme's own colours. The check itself is tried first, on
// planted faults, so a pass means it looked. Test support: test/repository/wcag.js and wcag-page.js.
//
// A view a later workstream adds gets its case in OBSIDIAN or STATES below, with the same commit as the view.
//
// Not done here, because jsdom has no layout or paint: the contrast of lines and controls (SC 1.4.11), target size
// (SC 2.5.8; the details sheet's 44-point cases hold it), reflow and text spacing (SC 1.4.10, 1.4.12). The release
// walk-through (RELEASING.md, "Accessibility walk-through") covers those by hand, with the keyboard and a screen reader.
// Obsidian draws its own settings page from the plugin's definitions; the stand-in for it labels each control by its row's
// name, which is how a screen reader reads a settings row, and the plugin's part (every row named, no two alike) is held
// directly. Obsidian draws its own menus too, from the items the plugin gives it: the stand-in for one lists them as a
// screen reader reads a menu, and the plugin's part (every item named) is held directly. The drawing's own colours are
// held by test/accessibility.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';
import { GRAPH, show, styles } from '../packages/obsidian/test/host/view-notes.js';
import { fence, labelled } from '../packages/obsidian/test/host/notes.js';
import { editing, row, tapKey } from '../packages/obsidian/test/host/inspector-steps.js';
import { clock, open as tipOpen, pointerOver, thing, tipOf } from '../packages/obsidian/test/host/quick-info-steps.js';
import {
  cmState,
  cmView,
  editorInfoField,
  editorLivePreviewField,
} from '../packages/obsidian/test/host/fake-obsidian.js';
import { ProposalReview, basisOf, makeProposal } from '@graph-note/core';
import * as cardNotes from '../packages/obsidian/test/host/card-notes.js';
import * as paneNotes from '../packages/obsidian/test/host/pane-notes.js';
import { built, cleanUp } from '../packages/claude-code/test/editor-page-support.js';
import { browserHost } from '../packages/claude-code/page/browser-host.ts';
import { THEMES, audit, auditView, openWindow, pageFor, obsidianVariables } from './repository/wcag.js';
import { auditPage, openEditorPage, PAGE_NOTE } from './repository/wcag-page.js';

const here = new URL('../', import.meta.url).pathname;

/** What a check found, as text for a failure message: nothing is the pass. */
const found = (r) => r.problems;

// a missing comma on line 2: read as meant, and a departure from standard GQL, so the badge has problems to list
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";

const PATH = 'Some note.md';
/** A note of the given blocks, each fenced, under a heading. */
const noteOf = (...blocks) => ['# N', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
/** Block `n` of `note` drawn from the vault, once its drawing (or its table, or its card) is there. */
async function shownBlock(note, n, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  const { el } = await show(env, note, n);
  return { env, el };
}
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe)`;
const ROUND_PARK = "// graph: trip · QUERY view round_park\nMATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m";
const TEAM = `// graph: team
(ada:Person {name: 'Ada'}),
(bob:Person {name: 'Bob'}),
(atlas:Project {name: 'Atlas'}),
(ada)-[:WORKS_ON]->(atlas), (bob)-[:WORKS_ON]->(atlas)`;
const STEP = `// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)`;
const STYLE = `// graph: trip_style · STYLE trip
(down:Nudge {word: 'direction', direction: 'TB'})`;
const TABLE = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'table'})";
const PEOPLE = "// graph: people\n(ada:Model {name: 'Ada'}),\n(you:Model {name: 'you'})";

/** A note with a graph, a proposal against it from the model Ada, and the graph that names Ada. */
function proposalNote() {
  const base = noteOf(GRAPH);
  const p = makeProposal({
    id: 'cs1',
    graph: 'reader',
    by: { name: 'ada', kind: 'model' },
    at: '2026-10-13T09:00:00Z',
    read: ['reader'],
    basis: basisOf(base, 'reader'),
    changes: [
      { op: 'add', gql: "(small:Option {name: 'Small reader'})" },
      { op: 'add', gql: '(small)-[:ANSWERS]->(q)' },
    ],
  });
  return noteOf(GRAPH, new ProposalReview(p).changeSetText(), PEOPLE);
}

/** The AI send dialog, opened from its command on a note the model may read, with what will be sent shown. */
async function sendDialog() {
  const note = `---\nclassification: Public\n---\n# N\n\n${fence(GRAPH)}\n`;
  const settings = {
    aiUse: 'on',
    aiModels: [
      {
        name: 'Local',
        purpose: 'Proposing changes',
        ceiling: 'Public',
        endpoint: 'http://localhost:11434/v1/chat/completions',
        model: 'llama3',
      },
    ],
  };
  const env = await load({ files: { [PATH]: note }, data: { settings } });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), note, 'source');
  await env.state.commands.find((c) => c.id === 'ask-ai-model').callback();
  const m = env.state.modals.at(-1);
  assert.ok(m, 'the send dialog');
  nameControlsByRow(m.contentEl);
  return { env, el: m.modalEl };
}

/** The card Live Preview draws for the first graph block of a note, as CodeMirror would put it on the page. */
async function livePreviewCard(note) {
  const env = await load({ files: { [PATH]: note } });
  const state = cmState.EditorState.create({
    doc: note,
    extensions: [
      editorLivePreviewField.init(() => true),
      editorInfoField.init(() => ({ file: { path: PATH } })),
      ...(env.state.editorExtensions ?? []).filter((e) => !e?.listener),
    ],
  });
  let widget;
  for (const source of state.facet(cmView.EditorView.decorations))
    if (typeof source !== 'function')
      source?.between(0, state.doc.length, (from, to, deco) => {
        widget ??= deco.spec.widget;
      });
  assert.ok(widget, 'a card for the block');
  const el = widget.toDOM();
  env.doc.body.appendChild(el);
  await until(() => !!el.querySelector('g.node'));
  return { env, el };
}

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
  'the export form open on a card': async () => {
    const { env, el } = await shownBlock(noteOf(TRIP), 0);
    labelled(el, 'Export').click();
    assert.ok(el.querySelector('.graph-note-export'), 'the Export form');
    return { env, el };
  },
  'the export form asking first, for a note above its classification': async () => {
    const { env, el } = await shownBlock(`---\nclassification: Internal\n---\n${noteOf(TRIP)}`, 0);
    labelled(el, 'Export').click();
    const form = el.querySelector('.graph-note-export');
    labelled(form, 'Export it').click();
    await until(() => !!labelled(form, 'Export anyway'));
    return { env, el };
  },
  'the AI send dialog, showing what will be sent': async () => {
    const { env, el } = await sendDialog();
    const shower = el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === 'Show what will be sent');
    shower.click();
    await until(() => !!el.querySelector('.graph-note-ai-body'));
    return { env, el };
  },
  'a proposal drawn over its graph, its changes listed': async () => {
    const { env, el } = await shownBlock(proposalNote(), 1);
    await until(() => el.querySelectorAll('li.graph-note-proposal-row').length > 0);
    return { env, el };
  },
  'the quick-info tooltip of a thing': async () => {
    const { env, el } = await shownBlock(noteOf(TRIP), 0);
    await until(() => !!el.querySelector('g.node'));
    const time = clock(env);
    pointerOver(thing(el, 'park'));
    time.fire();
    await until(() => tipOpen(env));
    return { env, el: tipOf(env) };
  },
  'a style block, opened': async () => {
    const { env, el } = await shownBlock(noteOf(TRIP, STYLE), 1);
    const fold = el.querySelector('details.graph-note-style');
    assert.ok(fold, 'the folded style');
    fold.setAttribute('open', '');
    return { env, el };
  },
  'a step’s card': async () => {
    const { env, el } = await shownBlock(noteOf(TEAM, STEP), 1);
    assert.ok(el.querySelector('.graph-note-step'), 'the step’s card');
    return { env, el };
  },
  'a view, read in plain English with what is outside it faded': async () => {
    const { env, el } = await shownBlock(noteOf(TRIP, ROUND_PARK), 1);
    await until(() => !!el.querySelector('.graph-note-view-reading'));
    return { env, el };
  },
  'a graph drawn as a table': async () => {
    const { env, el } = await shownBlock(noteOf(TRIP, TABLE), 0);
    assert.ok(el.querySelector('.graph-note-table table'), 'the table');
    return { env, el };
  },
  'a drawing untangled to a thing and its neighbours, behind its banner': async () => {
    const { env, el } = await shownBlock(noteOf(GRAPH), 0);
    tapKey(el, 'large');
    el.querySelectorAll('button')
      .find((b) => b.textContent.includes('Show only this and its neighbours'))
      .click();
    assert.ok(el.querySelector('.graph-note-untangle'), 'the banner');
    return { env, el };
  },
  'the mini-map, once zoomed in past the fit': async () => {
    const { env, el } = await shownBlock(noteOf(GRAPH), 0, { width: 300 });
    labelled(el, 'Zoom in').click();
    assert.equal(el.querySelector('.graph-note-mini-map')?.hidden, false, 'the mini-map');
    return { env, el };
  },
  'a path playing, its step said': async () => {
    const walk = `${TRIP},\n(tour:Path {title: 'Sunday walk'}),\n(tour)-[:STEP {seq: 1}]->(home),\n(tour)-[:STEP {seq: 2}]->(park)`;
    const { env, el } = await shownBlock(noteOf(walk), 0);
    clock(env);
    labelled(el, 'Play Sunday walk').click();
    assert.match(el.querySelector('.graph-note-walk [aria-live]').textContent, /Step 1 of 2/);
    return { env, el };
  },
  'adding a thing, while editing in place': async () => {
    const env = await load({ files: { [cardNotes.PATH]: cardNotes.NOTE } });
    const el = await editing(env);
    await until(() => !!labelled(el, 'Add a thing'));
    labelled(el, 'Add a thing').click();
    assert.equal(el.querySelector('.graph-note-add-thing')?.hidden, false, 'the strip');
    return { env, el };
  },
  'the diagram types listed': async () => {
    const { env, el } = await shownBlock(noteOf(TEAM), 0);
    labelled(el, 'Diagram type').click();
    assert.equal(el.querySelector('.graph-note-type-list').hidden, false, 'the list');
    return { env, el };
  },
  'the Live Preview card': async () => livePreviewCard(noteOf(GRAPH)),
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
  const withNote = '#token=t&note=Reader.md';
  const drawn = (page) =>
    until(() => !!page.window.document.querySelector('.graph-note-pane-drawing svg.graph-note-svg'), 8000);
  // a link naming a thing that is not there: a problem, listed with its fix, and an estimated link in the drawing
  const SLIPPED = PAGE_NOTE.replace(
    '(large)-[:ANSWERS]->(q)',
    "(large)-[:ANSWERS]->(q),\n(eyes:Reason {title: 'E'}),\n(eyes)-[:FAVOURS]->(larg)",
  );
  const TWO_BLOCKS = `${PAGE_NOTE}\n\`\`\`gql\n// graph: other\n(x:Thing {name: 'X'})\n\`\`\`\n`;

  const STATES = {
    'before the note is opened, saying how to open it': async () => open(''),
    'the note: words, a code block, a link, and the graph drawn with its words': async () => {
      const page = open(withNote);
      await drawn(page);
      return page;
    },
    // the editing states (C9): the edit pane of the Obsidian host, which the layer draws on the page
    'the edit pane with a problem listed and marked': async () => {
      const page = open(withNote, SLIPPED);
      await drawn(page);
      await until(() => page.window.document.querySelectorAll('.graph-note-pane-problems li').length > 0);
      return page;
    },
    'the edit pane with the picker of two graph blocks': async () => {
      const page = open(withNote, TWO_BLOCKS);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('select[aria-label="Graph block"]'));
      return page;
    },
    'the edit pane with a kept draft offered back': async () => {
      const page = open(withNote, PAGE_NOTE, { text: 'x', against: null });
      await drawn(page);
      await until(() => !page.window.document.querySelector('.graph-note-draft').hidden);
      return page;
    },
    'the details of a thing, opened beside the text': async () => {
      const page = open(withNote);
      await drawn(page);
      const box = page.window.document.querySelector('g.node[data-key]');
      box.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!page.window.document.querySelector('.graph-note-details'));
      return page;
    },
    'the details of an estimated link, with its quick fix': async () => {
      const page = open(withNote, SLIPPED);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('g.edge[data-estimate]'));
      page.window.document
        .querySelector('g.edge[data-estimate]')
        .dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => !!page.window.document.querySelector('.graph-note-details'));
      return page;
    },
    'the export form open': async () => {
      const page = open(withNote);
      await drawn(page);
      const exporter = () => page.window.document.querySelector('.graph-note-bar button[aria-label="Export"]');
      await until(() => !!exporter());
      exporter().click();
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
    // C8: the keyboard, the text version and reduced motion
    'the skip link focused': async () => {
      const page = open(withNote);
      await drawn(page);
      page.window.document.querySelector('.gn-skip').focus();
      return page;
    },
    'a menu open with the keyboard on its second row': async () => {
      const page = open(withNote);
      await drawn(page);
      const doc = page.window.document;
      browserHost(page.window).menu(
        [
          { title: 'Export as SVG', icon: 'download', onClick() {} },
          { title: 'Copy the address', icon: 'copy', onClick() {} },
        ],
        { x: 20, y: 20 },
        doc,
      );
      doc.activeElement.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      return page;
    },
    'the text version shown': async () => {
      const page = open(withNote);
      await drawn(page);
      await until(() => !!page.window.document.querySelector('.gn-text-version li'));
      return page;
    },
    'reduced motion asked for': async () => {
      const page = open(withNote);
      page.window.matchMedia = (media) => ({
        media,
        matches: /reduced-motion/.test(media),
        addEventListener() {},
        removeEventListener() {},
      });
      await drawn(page);
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
