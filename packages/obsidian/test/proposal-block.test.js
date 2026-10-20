// A proposal in a note (editor spec §17, AI proposals — accepted or rejected in the editor).
// - A change set block is drawn over its graph. What it adds, changes and removes is marked in words as well as drawn
//   (proposal_shown_not_applied).
// - Who proposed it, when, and what it read are shown. A notice comes first if the graph has moved since (proposal_provenance).
// - Each change is listed in plain language with Accept and Reject (proposal_one_by_one, proposals_read_back). There are
//   groups when there are many (big_proposal).
// - Nothing is written until a person presses one (person_decides).
// - An Accept writes the change as an edit that can be undone (accepting_is_an_edit).
// - A Reject writes only the record in the change set (rejecting_recorded).
// - On a phone the list is a bottom sheet, one row to a change (proposals_phone).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalReview, basisOf, makeProposal, thingChange } from '@thoughtknot/core';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question)`;
const noteOf = (...blocks) => ['# Reader', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const CHANGES = [
  { op: 'add', gql: "(small_reader:Option {name: 'Small reader'})" },
  { op: 'add', gql: '(small_reader)-[:ANSWERS]->(question)' },
  { op: 'set', thing: 'large_reader', key: 'price', value: '4' },
  { op: 'remove-link', from: 'large_reader', type: 'ANSWERS', to: 'question' },
  { op: 'remove-thing', thing: 'alice' },
];

/** The graph that says what the proposer is: the graph spec's check wants its author to be a known person or model. */
const PEOPLE = "// graph: people\n(ada:Model {name: 'Ada'}),\n(you:Model {name: 'you'})";
/** The ids of the five changes above, derived from their statements. */
const [C1, C2] = makeProposal({
  id: 'ids',
  graph: 'reader',
  by: { name: 'ada', kind: 'model' },
  basis: '0123456789abcdef',
  changes: CHANGES,
}).changes.map((c) => c.id);

/** The change set of a proposal made against the graph as the note holds it, and the note that holds both. */
function proposed(changes = CHANGES, over = {}) {
  const base = noteOf(GRAPH);
  const p = makeProposal({
    id: 'cs1',
    graph: 'reader',
    by: { name: 'ada', kind: 'model' },
    at: '2026-10-13T09:00:00Z',
    read: ['reader'],
    basis: basisOf(base, 'reader'),
    changes,
    ...over,
  });
  const block = new ProposalReview(p).changeSetText();
  return { block, note: noteOf(GRAPH, block, PEOPLE) };
}

async function card(note, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  const shown = await show(env, note, 1);
  await until(() => !!shown.el.querySelector('svg') || !!shown.el.querySelector('.thoughtknot-banner'));
  return { env, el: shown.el };
}
const node = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const rows = (el) => el.querySelectorAll('li.thoughtknot-proposal-row');
// a change by its place in the list, 'c1' the first row: ids are derived from each statement, so no test writes one
const row = (el, place) => rows(el)[Number(place.slice(1)) - 1];
const press = (el, label) => {
  const b = el.querySelectorAll('button').find((x) => x.getAttribute('aria-label')?.startsWith(label));
  assert.ok(b, `a button ${label}`);
  b.click();
};
const noteNow = (env) => env.state.files.get(PATH);

describe('a change set in a note is a proposal, shown over its graph', () => {
  test('is drawn with the things it adds, changes and removes marked, each in words as well as in the drawing', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.deepEqual(
        el
          .querySelectorAll('g.node')
          .map((g) => g.getAttribute('data-key'))
          .sort(),
        ['alice', 'large_reader', 'question', 'small_reader'],
      );
      assert.ok(node(el, 'small_reader').classList.contains('is-add'));
      assert.ok(node(el, 'large_reader').classList.contains('is-change'));
      assert.ok(node(el, 'alice').classList.contains('is-remove'));
      assert.equal(node(el, 'question').classList.contains('thoughtknot-proposed'), false);
      assert.match(node(el, 'small_reader').getAttribute('aria-label'), /added by the proposal/);
      assert.match(node(el, 'alice').getAttribute('aria-label'), /removed by the proposal/);
      const words = (g) => g.querySelector('.thoughtknot-proposal-mark').textContent;
      assert.deepEqual(
        [words(node(el, 'small_reader')), words(node(el, 'large_reader')), words(node(el, 'alice'))],
        ['+ added', '~ changed', '− removed'],
      );
      const links = el.querySelectorAll('g.edge[data-link]');
      assert.deepEqual(
        links.map((g) =>
          g
            .getAttribute('class')
            .split(' ')
            .filter((c) => c.startsWith('is-'))
            .join(),
        ),
        ['is-remove', 'is-add'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('writes nothing: showing it leaves the note as it was, every change waiting', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.equal(noteNow(env), note);
      assert.equal(env.state.writes, undefined);
      assert.deepEqual(
        rows(el).map((r) => r.classList.contains('is-pending')),
        [true, true, true, true, true],
      );
    } finally {
      env.uninstall();
    }
  });

  test('says who proposed it, when and what it read', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.deepEqual(
        el.querySelectorAll('.thoughtknot-proposal-provenance li').map((li) => li.textContent),
        [
          'The change set says it was proposed by ada, a model.',
          'It says it was proposed on 13 Oct 2026, 09:00 UTC.',
          'It says it read: reader.',
        ],
      );
      assert.match(el.querySelector('.thoughtknot-proposal-head').textContent, /nothing is written until you accept/);
    } finally {
      env.uninstall();
    }
  });

  test('lists the changes one to a row, each read back in plain English, with Accept and Reject', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.deepEqual(
        rows(el).map((r) => r.querySelector('.thoughtknot-proposal-said').textContent),
        [
          'Added: Small reader is an Option',
          'Added: Small reader —ANSWERS→ Which device?',
          'Changed: Large reader: price is 4',
          'Removed: Large reader —ANSWERS→ Which device?',
          'Removed: Alice is a Person',
        ],
      );
      for (const r of rows(el)) {
        const labels = r.querySelectorAll('button').map((b) => b.getAttribute('aria-label'));
        assert.equal(labels.length, 2);
        assert.match(labels[0], /^Accept: /);
        assert.match(labels[1], /^Reject: /);
      }
      // what each change writes is shown as it is written, in a code span, and is in the buttons' names
      assert.deepEqual(
        rows(el).map((r) => r.querySelector('code').textContent),
        [
          "(small_reader:Option {name: 'Small reader'})",
          '(small_reader)-[:ANSWERS]->(question)',
          'SET large_reader.price = 4',
          "MATCH (a {id: 'large_reader'})-[r:ANSWERS]->(b {id: 'question'}) DELETE r",
          "MATCH (v {id: 'alice'}) DETACH DELETE v",
        ],
      );
      const accept = row(el, 'c3').querySelector('.thoughtknot-proposal-accept');
      assert.equal(
        accept.getAttribute('aria-label'),
        'Accept: Changed: Large reader: price is 4 (SET large_reader.price = 4)',
      );
    } finally {
      env.uninstall();
    }
  });

  test('a change that links a thing another adds is refused alone, saying which to accept first, and writes nothing', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(row(el, 'c2'), 'Accept');
      await until(() => env.state.notices.length > 0);
      assert.match(
        env.state.notices.at(-1),
        new RegExp(`Nothing was decided: ${C2} needs ${C1}, which adds small_reader: accept ${C1} first`),
      );
      assert.equal(noteNow(env), note);
    } finally {
      env.uninstall();
    }
  });
});

describe('a person decides, a change at a time', () => {
  test('Accept writes that change into the graph and no other, records it in the judgement graph, and says so', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(row(el, 'c1'), 'Accept');
      await until(() => noteNow(env) !== note);
      const now = noteNow(env);
      assert.match(now, /\(question:Question[^]*\(small_reader:Option \{name: 'Small reader'\}\)\n```/);
      assert.doesNotMatch(now.split('```gql')[1], /price: 4/);
      assert.match(now, /\/\/ graph: judgements\n\(decision_reader_cs1_\w+:Decision \{state: 'accepted',/);
      assert.match(now, /decided_by: 'you', at: '\d{4}-\d\d-\d\dT[\d:.]+Z'/);
      assert.doesNotMatch(now.split('```gql')[2], /small_reader:Option/, 'it left the change set');
      assert.match(env.state.notices.at(-1), /Accepted 1 change: written into the graph\. Undo takes them back\./);
      const again = await show(env, now, 1);
      await until(() => !!again.el.querySelector('svg'));
      assert.deepEqual(
        rows(again.el).map((r) => r.classList.contains('is-accepted')),
        [true, false, false, false, false],
      );
      assert.match(
        row(again.el, 'c1').querySelector('.thoughtknot-proposal-decision').textContent,
        /Accepted by you on /,
      );
      assert.equal(row(again.el, 'c1').querySelectorAll('button').length, 0);
      assert.equal(row(again.el, 'c2').querySelector('.thoughtknot-proposal-blocked'), null);
    } finally {
      env.uninstall();
    }
  });

  test('a card whose change set was edited since it was drawn decides nothing, and is drawn again from the note', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      const edited = note.replace("'Small reader'", "'Smaller reader'");
      assert.notEqual(edited, note);
      env.state.files.set(PATH, edited);
      press(row(el, 'c1'), 'Reject');
      await until(() => env.state.notices.length > 0);
      assert.equal(noteNow(env), edited, 'nothing was written');
      assert.match(
        env.state.notices.at(-1),
        /Nothing was decided: the change set has changed since this card was drawn/,
      );
      await until(() => /Smaller reader/.test(row(el, 'c1')?.querySelector('code')?.textContent ?? ''));
      // the card drawn again is the note's: a decision on it is written
      press(row(el, 'c1'), 'Accept');
      await until(() => noteNow(env) !== edited);
      assert.match(noteNow(env), /Smaller reader/);
    } finally {
      env.uninstall();
    }
  });

  test('Reject writes only the record in the judgement graph: the graph block is the same bytes, and the change leaves the set', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(row(el, 'c3'), 'Reject');
      await until(() => noteNow(env) !== note);
      const [, graph, set, judgement] = noteNow(env).split('```gql');
      assert.equal(graph.split('```')[0].trim(), GRAPH);
      assert.doesNotMatch(set, /SET large_reader\.price = 4/);
      assert.match(judgement, /state: 'rejected'[^\n]*statement: 'SET large_reader\.price = 4'/);
      assert.match(env.state.notices.at(-1), /Rejected 1 change: the graph is unchanged/);
    } finally {
      env.uninstall();
    }
  });

  test('Undo takes the last decision back, to the note as it was', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.equal(labelled(el, 'Undo the last decision'), undefined);
      press(row(el, 'c1'), 'Accept');
      await until(() => noteNow(env) !== note);
      const again = await show(env, noteNow(env), 1);
      await until(() => !!again.el.querySelector('svg'));
      labelled(again.el, 'Undo the last decision').click();
      await until(() => noteNow(env) === note);
      assert.match(env.state.notices.at(-1), /Undone/);
    } finally {
      env.uninstall();
    }
  });

  test('Accept all applies what can be accepted, in order, as one decision one Undo takes back', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(el, 'Accept all');
      await until(() => noteNow(env) !== note);
      const graph = noteNow(env).split('```gql')[1].split('```')[0];
      assert.match(graph, /price: 4/);
      assert.match(graph, /\(small_reader\)-\[:ANSWERS\]->\(question\)/);
      assert.doesNotMatch(graph, /alice/);
      assert.match(env.state.notices.at(-1), /Accepted 5 changes/);
    } finally {
      env.uninstall();
    }
  });

  test('Accept all, with a change among them that the graph spec’s check fails, writes nothing and says why on the card', async () => {
    const { note } = proposed([{ op: 'add', gql: "(alice:Person {name: 'Alicia'})" }, ...CHANGES.slice(0, 1)]);
    const { env, el } = await card(note);
    try {
      press(el, 'Accept all (1)');
      await until(() => env.state.notices.length > 0);
      assert.equal(noteNow(env), note, 'nothing was written');
      assert.match(env.state.notices.at(-1), /Nothing was decided: the graph spec’s check of this change set fails/);
      assert.match(el.querySelector('.thoughtknot-proposal-status').textContent, /check of this change set fails/);
    } finally {
      env.uninstall();
    }
  });

  test('Accept for a group is refused the same way, naming the check’s line', async () => {
    const changes = [
      { op: 'add', gql: "(alice:Person {name: 'Alicia'})", group: 'People' },
      thingChange('small_reader', 'Option', { name: 'Small reader' }, { group: 'People' }),
      ...Array.from({ length: 8 }, (_, i) => thingChange(`o${i + 1}`, 'Option', { name: `Option ${i + 1}` })),
    ];
    const { note } = proposed(changes);
    const { env, el } = await card(note);
    try {
      press(el, 'Accept People');
      await until(() => env.state.notices.length > 0);
      assert.equal(noteNow(env), note);
      assert.match(env.state.notices.at(-1), /check of this change set fails: /);
    } finally {
      env.uninstall();
    }
  });

  test('a proposal whose proposer the note does not declare shows the failed line on the card, and Accept is refused', async () => {
    const { note } = proposed(CHANGES, { by: { name: 'stranger', kind: 'model' } });
    const { env, el } = await card(note);
    try {
      assert.match(el.querySelector('.thoughtknot-proposal-checked').textContent, /fails 1 of \d+/);
      assert.match(
        el.querySelector('.thoughtknot-proposal-checked').textContent,
        /stranger is a known person or model/,
      );
      press(row(el, 'c3'), 'Accept');
      await until(() => env.state.notices.length > 0);
      assert.equal(noteNow(env), note);
      assert.match(el.querySelector('.thoughtknot-proposal-status').textContent, /stranger is a known person or model/);
    } finally {
      env.uninstall();
    }
  });

  test('a Reject that is refused, as a waiting change still needs the thing, says so on the card', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(row(el, 'c1'), 'Reject');
      await until(() => env.state.notices.length > 0);
      assert.equal(noteNow(env), note);
      assert.match(
        el.querySelector('.thoughtknot-proposal-status').textContent,
        /Nothing was decided: .* needs small_reader/,
      );
    } finally {
      env.uninstall();
    }
  });

  test('a proposer that is not a person, and is called "you", does not stop the person at the keyboard', async () => {
    const { note } = proposed(CHANGES, { by: { name: 'you', kind: 'model' } });
    const { env, el } = await card(note);
    try {
      press(row(el, 'c1'), 'Accept');
      await until(() => noteNow(env) !== note);
      assert.match(noteNow(env), /small_reader:Option/);
    } finally {
      env.uninstall();
    }
  });

  test('Reject all records every change as rejected and leaves the graph alone', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      press(el, 'Reject all');
      await until(() => noteNow(env) !== note);
      const [, graph, , judgement] = noteNow(env).split('```gql');
      assert.equal(graph.split('```')[0].trim(), GRAPH);
      assert.equal(judgement.match(/state: 'rejected'/g).length, 5);
    } finally {
      env.uninstall();
    }
  });

  test('a change the edit check refuses is not written, and the refusal is said in the check’s words', async () => {
    const { note } = proposed([{ op: 'add', gql: "(alice:Person {name: 'Alicia'})" }]);
    const { env, el } = await card(note);
    try {
      assert.match(row(el, 'c1').querySelector('.thoughtknot-proposal-blocked').textContent, /alice is already a name/);
      assert.equal(row(el, 'c1').querySelector('.thoughtknot-proposal-accept').disabled, true);
      assert.equal(noteNow(env), note);
    } finally {
      env.uninstall();
    }
  });
});

describe('a proposal whose graph has moved', () => {
  test('says so before anything is accepted, and nothing is accepted until the notice has been read', async () => {
    const { block } = proposed();
    const moved = noteOf(GRAPH.replace('price: 3', 'price: 5'), block, PEOPLE);
    const { env, el } = await card(moved);
    try {
      const notice = el.querySelector('.thoughtknot-proposal-stale');
      assert.equal(notice.getAttribute('role'), 'alert');
      assert.match(notice.textContent, /changed since this was proposed/);
      const accept = row(el, 'c1').querySelector('.thoughtknot-proposal-accept');
      assert.equal(accept.disabled, true);
      notice.querySelectorAll('button')[0].click();
      assert.equal(accept.disabled, false);
      accept.click();
      await until(() => noteNow(env) !== moved);
      assert.match(noteNow(env), /small_reader:Option/);
    } finally {
      env.uninstall();
    }
  });
});

/** A proposal of twelve things, a link for each and six prices. */
const MANY = [
  ...Array.from({ length: 12 }, (_, i) => thingChange(`o${i + 1}`, 'Option', { name: `Option ${i + 1}` })),
  ...Array.from({ length: 6 }, (_, i) => ({
    op: 'set',
    thing: 'large_reader',
    key: `p${i + 1}`,
    value: '1',
    group: 'Prices',
  })),
];

describe('a big proposal', () => {
  test('is reviewed in groups, each with Accept and Reject for the group, and accept-all applies to one group at a time', async () => {
    const { note } = proposed(MANY);
    const { env, el } = await card(note);
    try {
      const groups = el.querySelectorAll('details.thoughtknot-proposal-group');
      assert.deepEqual(
        groups.map((g) => g.querySelector('summary').textContent),
        ['New Option — 12 changes, 12 waiting', 'Prices — 6 changes, 6 waiting'],
      );
      press(el, 'Accept Prices');
      await until(() => noteNow(env) !== note);
      const graph = noteNow(env).split('```gql')[1].split('```')[0];
      assert.match(graph, /p6: 1/);
      assert.doesNotMatch(graph, /o1:Option/);
    } finally {
      env.uninstall();
    }
  });
});

describe('on a phone', () => {
  test('the changes are listed in the bottom sheet, one to a row, each with Accept and Reject', async () => {
    const { note } = proposed();
    const { env, el } = await card(note, { mobile: true });
    try {
      const sheet = el.querySelector('.thoughtknot-proposal');
      assert.ok(sheet.classList.contains('is-sheet'));
      assert.equal(rows(sheet).length, 5);
      for (const r of rows(sheet)) assert.equal(r.querySelectorAll('button').length, 2);
    } finally {
      env.uninstall();
    }
  });

  test('on the desktop the list is under the bar, not a sheet', async () => {
    const { note } = proposed();
    const { env, el } = await card(note);
    try {
      assert.equal(el.querySelector('.thoughtknot-proposal').classList.contains('is-sheet'), false);
    } finally {
      env.uninstall();
    }
  });
});

describe('in reading view', () => {
  test('the proposal is shown and read, never decided: no Accept, no Reject, no Undo', async () => {
    const { note } = proposed();
    const env = await load({ files: { [PATH]: note } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const inner = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
      const el = inner.createDiv({ cls: 'block-language-gql' });
      const { fakeContext } = await import('./host/fake-obsidian.js');
      const fences = note.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      const block = note.split('```gql')[2].split('```')[0].trim();
      await env.state.processors.get('gql')(block, el, fakeContext(note, fences[1]));
      await until(() => !!el.querySelector('svg'));
      assert.equal(rows(el).length, 5);
      assert.equal(el.querySelectorAll('.thoughtknot-proposal button').length, 0);
    } finally {
      env.uninstall();
    }
  });

  test('a proposal with nothing to draw it over is listed with no buttons too, and a decision is not written', async () => {
    const { block } = proposed();
    const note = noteOf(block);
    const env = await load({ files: { [PATH]: note } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const inner = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
      const el = inner.createDiv({ cls: 'block-language-gql' });
      const { fakeContext } = await import('./host/fake-obsidian.js');
      await env.state.processors.get('gql')(block, el, fakeContext(note, 2));
      await until(() => rows(el).length === 5);
      assert.ok(el.querySelector('.thoughtknot-empty'), 'nothing to draw');
      assert.equal(el.querySelectorAll('.thoughtknot-proposal button').length, 0);
      assert.equal(noteNow(env), note);
    } finally {
      env.uninstall();
    }
  });

  test('a block drawn with no section information writes nothing: its proposal is shown, its buttons not offered', async () => {
    const { block } = proposed();
    const env = await load({ files: { [PATH]: noteOf(GRAPH, block) } });
    try {
      const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
      const { fakeContext } = await import('./host/fake-obsidian.js');
      const ctx = { ...fakeContext('', 0), getSectionInfo: () => null };
      await env.state.processors.get('gql')(block, el, ctx);
      await until(() => rows(el).length === 5);
      assert.equal(el.querySelectorAll('.thoughtknot-proposal button').length, 0);
    } finally {
      env.uninstall();
    }
  });
});

describe('a change set that is no proposal', () => {
  test('one with no change in it says why, and its text is shown', async () => {
    const base = noteOf(GRAPH);
    const empty = `// graph: reader · CHANGE SET cs9 · against sha-256-64:${basisOf(base, 'reader')} · by ada`;
    const { env, el } = await card(noteOf(GRAPH, empty));
    try {
      assert.match(el.querySelector('[role="alert"]').textContent, /cannot be shown: this change set holds no change/);
      assert.ok(el.querySelector('pre'));
    } finally {
      env.uninstall();
    }
  });
});
