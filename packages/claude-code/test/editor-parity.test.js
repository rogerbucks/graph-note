// The same edit writes the same bytes in the browser editor and in Obsidian (editor spec §26, cc_same_bytes), proved by
// shared cases: each case is the text typed into a note's block, and the note that results is read from both hosts, the
// browser editor's `EditorSession` (what the page sends the server) and the Obsidian plugin's edit pane (what it writes
// to the vault), loaded as its own tests load it. Both take the write from the core's session, and the display layer
// they now share (workstream C4) must not change it: the cases hold that, byte for byte, and for Undo and Redo too.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EditorSession } from '../src/editor-session.ts';
import { build, until } from '../../obsidian/test/host/load-plugin.js';
import { NOTE, READER, open, type, note } from '../../obsidian/test/host/pane-notes.js';
import { parityPageCases } from './editor-parity-page.js';

before(() => build());

const sha = (bytes) => `"${createHash('sha256').update(bytes).digest('hex')}"`;

/** The shared cases: a name, and the block as it is typed. Every one is a write the page and the pane both make. */
const CASES = [
  ['a thing renamed', READER.replace("'Large reader'", "'Small reader'")],
  ['a thing added', READER + ",\n(mine:Reason {title: 'Mine'})"],
  ['a link added', READER + ',\n(eyes)-[:FAVOURS]->(question)'],
  ['a line removed', READER.split('\n').slice(0, -1).join('\n')],
  ['text with quotes, an accent and an emoji', READER + ",\n(odd:Reason {title: 'It\\'s café ☕'})"],
  ['a block emptied to its graph line', '// graph: reader'],
  ['the same text typed again, which writes nothing', READER],
];

/** The note the browser editor would send the server for a block typed as `block`, or the note itself if unchanged. */
function browser(block) {
  const page = new EditorSession(NOTE, sha(NOTE));
  page.type({ text: block, start: block.length, end: block.length });
  const w = page.write();
  assert.equal(w.ok, true, 'the browser editor can write it');
  return { page, note: w.note };
}

/** The note the Obsidian plugin's pane leaves in the vault for the same typing. */
async function obsidian(block) {
  const env = await open();
  try {
    type(env.el, block);
    if (block !== READER) await until(() => note(env) !== NOTE);
    return note(env);
  } finally {
    env.uninstall();
  }
}

describe('the same edit writes the same bytes in the browser editor and in Obsidian', () => {
  for (const [name, block] of CASES) {
    test(name, async () => {
      const there = await obsidian(block);
      assert.equal(browser(block).note, there);
      assert.equal(there, NOTE.replace(READER, block));
    });
  }

  test('Undo and Redo write the same bytes in both', async () => {
    const block = READER + ",\n(mine:Reason {title: 'Mine'})";
    const env = await open();
    try {
      const { page, note: written } = browser(block);
      page.written(sha(written));
      type(env.el, block);
      await until(() => note(env) !== NOTE);
      const tools = () => env.el.querySelectorAll('.thoughtknot-pane-tools button');
      const undone = tools()[0];
      undone.click();
      await until(() => note(env) === NOTE);
      assert.equal(page.undo().note, NOTE);
      const redone = tools()[1];
      redone.click();
      await until(() => note(env) === written);
      assert.equal(page.redo().note, written);
    } finally {
      env.uninstall();
    }
  });
});

// C8: the edits the page makes through its own controls. The browser page's one control that writes is the proposal card's
// Accept and Reject; the details, the properties and the drawing's edits are not on the page (they are the Obsidian
// plugin's), so the page-control cases are these. Each is made on the same note in both hosts, and the bytes compared.
describe('a decision on a proposal writes the same bytes through the page’s card and Obsidian’s strip', () => {
  const GRAPH =
    "// graph: reader\n(question:Question {name: 'Which device?'}),\n(large_reader:Option {name: 'Large reader', price: 3}),\n(alice:Person {name: 'Alice'}),\n(large_reader)-[:ANSWERS]->(question)";
  const PEOPLE = "// graph: people\n(ada:Model {name: 'Ada'}),\n(you:Model {name: 'you'})";
  const CHANGES = [
    { op: 'add', gql: "(small_reader:Option {name: 'Small reader'})" },
    { op: 'set', thing: 'large_reader', key: 'price', value: '4' },
    { op: 'remove-thing', thing: 'alice' },
  ];
  const fenced = (t) => '```gql\n' + t + '\n```';
  const PATH = 'Some note.md';
  const proposal = async () => {
    const { ProposalReview, basisOf, makeProposal } = await import('@thoughtknot/core');
    const base = ['# Reader', '', fenced(GRAPH), ''].join('\n');
    const block = new ProposalReview(
      makeProposal({
        id: 'cs1',
        graph: 'reader',
        by: { name: 'ada', kind: 'model' },
        at: '2026-10-13T09:00:00Z',
        read: ['reader'],
        basis: basisOf(base, 'reader'),
        changes: CHANGES,
      }),
    ).changeSetText();
    return ['# Reader', '', fenced(GRAPH), '', fenced(block), '', fenced(PEOPLE), ''].join('\n');
  };
  /** A note with the time of each decision taken out: that is the one thing two decisions never share. */
  const untimed = (text) => text.replace(/at: '[^']*'/g, "at: 'T'");
  const press = (el, label) => {
    const b = el.querySelectorAll('button').find((x) => x.getAttribute('aria-label')?.startsWith(label));
    assert.ok(b, `a button ${label}`);
    b.click();
  };
  /** The note Obsidian's strip leaves after `act` is done on the card shown for `note`. */
  async function obsidianDecides(note, act) {
    const { load } = await import('../../obsidian/test/host/load-plugin.js');
    const { show } = await import('../../obsidian/test/host/view-notes.js');
    const env = await load({ files: { [PATH]: note } });
    try {
      const shown = await show(env, note, 1);
      await until(() => !!shown.el.querySelector('svg') || !!shown.el.querySelector('.thoughtknot-banner'));
      act(shown.el);
      await until(() => env.state.files.get(PATH) !== note);
      return env.state.files.get(PATH);
    } finally {
      env.uninstall();
    }
  }
  const row = (el, n) => el.querySelectorAll('li.thoughtknot-proposal-row')[n];

  for (const [name, kind, which, act] of [
    ['accepting one change', 'accept', (c) => [c.rows[1].id], (el) => press(row(el, 1), 'Accept')],
    ['rejecting one change', 'reject', (c) => [c.rows[2].id], (el) => press(row(el, 2), 'Reject')],
    ['accepting all', 'accept', () => ({ all: true }), (el) => press(el, 'Accept all')],
    ['rejecting all', 'reject', () => ({ all: true }), (el) => press(el, 'Reject all')],
  ]) {
    test(name, async () => {
      const { proposalsIn, decide } = await import('../page/proposal-review.ts');
      const note = await proposal();
      const [card] = proposalsIn(note);
      const here = decide(note, card.id, kind, which(card), undefined, false);
      assert.equal(here.ok, true);
      const there = await obsidianDecides(note, act);
      assert.equal(untimed(here.note), untimed(there));
      assert.notEqual(here.note, note, 'a decision writes');
    });
  }
});

// C9: every kind of edit, made on the page as built and in Obsidian's pane, writes the same bytes (editor-parity-page.js).
parityPageCases();
