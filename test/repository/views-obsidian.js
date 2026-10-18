// The views of the Obsidian host, each drawn in the fake host in the state a check needs (editor spec §11, §41): the one
// list every accessibility check of every view goes through (test/wcag.test.js, test/a11y-semantics.test.js and
// test/a11y-keyboard.test.js), so a view a later workstream adds gets its case here once, with the same commit as the
// view, and every check covers it.
import assert from 'node:assert/strict';
import { load, until } from '../../packages/obsidian/test/host/load-plugin.js';
import { GRAPH, show } from '../../packages/obsidian/test/host/view-notes.js';
import { fence, labelled } from '../../packages/obsidian/test/host/notes.js';
import { editing, tapKey } from '../../packages/obsidian/test/host/inspector-steps.js';
import {
  clock,
  open as tipOpen,
  pointerOver,
  thing,
  tipOf,
} from '../../packages/obsidian/test/host/quick-info-steps.js';
import {
  cmState,
  cmView,
  editorInfoField,
  editorLivePreviewField,
} from '../../packages/obsidian/test/host/fake-obsidian.js';
import { ProposalReview, basisOf, makeProposal, word } from '@graph-note/core';
import * as cardNotes from '../../packages/obsidian/test/host/card-notes.js';
import * as paneNotes from '../../packages/obsidian/test/host/pane-notes.js';

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
export const OBSIDIAN = {
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
    labelled(el, word('bar.edit-here')).click();
    await until(() => !!el.querySelector('textarea'));
    return { env, el };
  },
  'the properties form of a thing, while editing in place': async () => {
    const env = await load({ files: { [cardNotes.PATH]: cardNotes.NOTE } });
    const el = await cardNotes.show(env);
    labelled(el, word('bar.edit-here')).click();
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
    labelled(el, word('bar.export')).click();
    assert.ok(el.querySelector('.graph-note-export'), 'the Export form');
    return { env, el };
  },
  'the export form asking first, for a note above its classification': async () => {
    const { env, el } = await shownBlock(`---\nclassification: Internal\n---\n${noteOf(TRIP)}`, 0);
    labelled(el, word('bar.export')).click();
    const form = el.querySelector('.graph-note-export');
    labelled(form, word('export.it')).click();
    await until(() => !!labelled(form, word('export.anyway')));
    return { env, el };
  },
  'the AI send dialog, showing what will be sent': async () => {
    const { env, el } = await sendDialog();
    const shower = el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === word('ai.show'));
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
  'a card in full screen': async () => {
    const env = await load();
    const { el } = await show(env, `# N\n\n${fence(GRAPH)}\n`);
    labelled(el, word('bar.full-screen')).click();
    const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
    assert.ok(overlay?.querySelector('g.node'), 'the drawing in full screen');
    return { env, el: overlay };
  },
  'the mini-map, once zoomed in past the fit': async () => {
    const { env, el } = await shownBlock(noteOf(GRAPH), 0, { width: 300 });
    labelled(el, word('bar.zoom-in')).click();
    assert.equal(el.querySelector('.graph-note-mini-map')?.hidden, false, 'the mini-map');
    return { env, el };
  },
  'a path playing, its step said': async () => {
    const walk = `${TRIP},\n(tour:Path {title: 'Sunday walk'}),\n(tour)-[:STEP {seq: 1}]->(home),\n(tour)-[:STEP {seq: 2}]->(park)`;
    const { env, el } = await shownBlock(noteOf(walk), 0);
    clock(env);
    labelled(el, word('walk.play', { title: 'Sunday walk' })).click();
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
    labelled(el, word('type.choose')).click();
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
export function nameControlsByRow(page) {
  page.querySelectorAll('.setting-item').forEach((row, n) => {
    const name = row.querySelector('.setting-item-name');
    if (!name?.textContent) return;
    name.setAttribute('id', `setting-name-${n}`);
    for (const c of row.querySelectorAll('input, select, textarea'))
      if (!c.getAttribute('aria-label')) c.setAttribute('aria-labelledby', `setting-name-${n}`);
  });
}
