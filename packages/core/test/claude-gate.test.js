// What the browser editor may show Claude (editor spec §26, cc_classified_asks, cc_credential_never): a note above the
// level set for Claude is asked about first, the highest classification never opens, a note with none counts as the
// level set for unlabelled notes, and a credential never reaches Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gateModule from '../src/claude-gate.ts';

import { sha256 } from '../src/ai-digest.ts';

const { claudeGate, noteClassification } = gateModule;
const classificationOf = (text) => gateModule.classificationOf(text);

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const claude = (ceiling) => ({ name: 'Claude', purpose: '', ceiling, endpoint: '', model: '', keyName: '' });
const settings = (over = {}) => ({
  classifications: LEVELS,
  aiUnlabelled: 'Restricted',
  aiModels: [claude('Internal')],
  ...over,
});
const note = (level, body = 'Some text.') => (level === null ? body : `---\nclassification: ${level}\n---\n${body}`);
// built here, so no line of this file has the shape of a secret
const value = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);

test('a note’s classification is its front matter classification, whatever the case, quotes or line ends', () => {
  assert.equal(noteClassification(note('Internal')), 'Internal');
  assert.equal(noteClassification('---\r\nClassification: "Internal"\r\n---\r\nText'), 'Internal');
  assert.equal(noteClassification("---\ntitle: x\nclassification: 'Public' \n---\n"), 'Public');
  assert.equal(noteClassification('﻿---\nclassification: Public\n---\n'), 'Public');
});

test('a note with no front matter, no classification, an empty one, or one only in the body has none', () => {
  assert.equal(noteClassification('Text'), null);
  assert.equal(noteClassification('---\ntitle: x\n---\nText'), null);
  assert.equal(noteClassification('---\nclassification:\n---\nText'), null);
  assert.equal(noteClassification('Text\n---\nclassification: Public\n---\n'), null);
  assert.equal(noteClassification('---\nclassification: Public\nno end to the front matter'), null);
});

test('a note at or below Claude’s ceiling opens', () => {
  for (const level of ['Public', 'Internal', 'internal'])
    assert.deepEqual(claudeGate(note(level), settings()), { open: true }, level);
});

test('a note above Claude’s ceiling is asked about, naming its classification and the ceiling, never its text', () => {
  const gate = claudeGate(note('Confidential', 'The secret plan.'), settings());
  assert.ok('ask' in gate, 'asks');
  assert.match(gate.ask, /Confidential/);
  assert.match(gate.ask, /Internal/);
  assert.match(gate.ask, /Claude/);
  assert.ok(!gate.ask.includes('secret plan'));
});

test('the highest classification is refused, whatever Claude’s ceiling is set to', () => {
  for (const ceiling of ['Public', 'Internal', 'Confidential', 'Restricted']) {
    const gate = claudeGate(note('Restricted'), settings({ aiModels: [claude(ceiling)] }));
    assert.ok('refuse' in gate, ceiling);
    assert.match(gate.refuse, /highest/);
  }
});

test('a note with no classification counts as the level set for unlabelled notes, the highest until chosen', () => {
  assert.ok('refuse' in claudeGate(note(null), settings()), 'refused by default');
  assert.ok('refuse' in claudeGate(note(null), settings({ aiUnlabelled: 'Restricted' })));
  assert.ok('ask' in claudeGate(note(null), settings({ aiUnlabelled: 'Confidential' })));
  assert.deepEqual(claudeGate(note(null), settings({ aiUnlabelled: 'Internal' })), { open: true });
  assert.match(claudeGate(note(null), settings()).refuse, /no classification/);
});

test('a classification that is not one of those set is refused, as above every ceiling', () => {
  const gate = claudeGate(note('Top Secret'), settings());
  assert.ok('refuse' in gate);
  assert.match(gate.refuse, /not one of the classifications/);
});

test('with no Claude set up, or its ceiling no longer a classification, the ceiling is the lowest', () => {
  assert.ok('ask' in claudeGate(note('Internal'), settings({ aiModels: [] })));
  assert.deepEqual(claudeGate(note('Public'), settings({ aiModels: [] })), { open: true });
  assert.ok('ask' in claudeGate(note('Internal'), settings({ aiModels: [claude('Gone')] })));
  assert.deepEqual(claudeGate(note('Public'), settings({ aiModels: [claude('Gone')] })), { open: true });
});

test('Claude’s ceiling is found by its name in the models set, whatever its case, and others’ are not its own', () => {
  const other = { ...claude('Restricted'), name: 'Other' };
  assert.ok('ask' in claudeGate(note('Confidential'), settings({ aiModels: [other, claude('Internal')] })));
  assert.deepEqual(
    claudeGate(note('Confidential'), settings({ aiModels: [other, { ...claude('Confidential'), name: ' CLAUDE ' }] })),
    { open: true },
  );
});

test('a credential in the note is refused at any classification, named by kind and never quoted', () => {
  for (const level of ['Public', 'Internal', 'Confidential']) {
    const gate = claudeGate(note(level, `db_password: "${value}"`), settings());
    assert.ok('refuse' in gate, level);
    assert.match(gate.refuse, /password or secret/);
    assert.match(gate.refuse, /never/);
    assert.ok(!gate.refuse.includes(value), 'the value is not quoted');
  }
});

test('settings with no classifications at all refuse every note', () => {
  assert.ok('refuse' in claudeGate(note('Public'), settings({ classifications: [] })));
});

const front = (...lines) => `---\n${lines.join('\n')}\n---\nSome text.\n`;

test('only an unindented, top-level classification key counts: nested and block-scalar ones do not', () => {
  assert.equal(noteClassification(front('meta:', '  classification: Restricted')), null);
  assert.equal(
    noteClassification(front('about: |', '  classification: Restricted', 'classification: Public')),
    'Public',
  );
  assert.equal(noteClassification(front('about: >', '  classification: Restricted')), null);
  assert.equal(noteClassification(front(' classification: Restricted')), null, 'indented is not top level');
  assert.equal(noteClassification(front('- classification: Restricted')), null);
});

test('several classification keys, or a value that cannot be parsed, are unknown, and refuse', () => {
  const bad = [
    front('classification: Public', 'classification: Restricted'),
    front('classification: Public', 'Classification: Restricted'),
    front('classification: [Public, Restricted]'),
    front('classification: {a: b}'),
    front('classification: |', '  Public'),
    front('classification: "Public'),
    front('classification: &anchor Public'),
    front('classification: !!str Public'),
  ];
  for (const text of bad) {
    assert.equal(classificationOf(text).kind, 'unknown', text);
    const gate = claudeGate(text, settings({ aiUnlabelled: 'Public', aiModels: [claude('Confidential')] }));
    assert.ok('refuse' in gate, text);
    assert.match(gate.refuse, /unknown classification/);
  }
});

test('an empty classification followed by list or child lines is unknown; an empty one alone is none', () => {
  for (const text of [
    front('classification:', '  - Restricted'),
    front('classification:', '- Restricted'),
    front('classification:', '  level: Restricted'),
    front('classification:  ', '  Restricted'),
  ]) {
    assert.equal(classificationOf(text).kind, 'unknown', text);
    assert.ok('refuse' in claudeGate(text, settings({ aiUnlabelled: 'Public' })), text);
  }
  assert.equal(classificationOf(front('classification:', 'title: x')).kind, 'none');
  assert.equal(classificationOf(front('classification:')).kind, 'none');
});

test('a refusal or a question never quotes the note’s label or its text', () => {
  const label = 'tOp-SeCrEt-label';
  const texts = [
    note(label, 'The hidden plan.'),
    note(label.toUpperCase(), 'The hidden plan.'),
    front('classification: Public', `classification: ${label}`),
    front('classification:', `  - ${label}`),
    note('restricted', 'The hidden plan.'),
    note('CONFIDENTIAL', 'The hidden plan.'),
  ];
  for (const text of texts) {
    const gate = claudeGate(text, settings());
    const said = JSON.stringify(gate);
    assert.ok(!said.toLowerCase().includes(label.toLowerCase()), said);
    assert.ok(!said.includes('hidden plan'), said);
  }
  assert.match(claudeGate(note(label), settings()).refuse, /unknown classification/);
});

test('a yes is for the digest of the text it was given about: that text opens, any other still asks', () => {
  const text = note('Confidential', 'Agreed.\n');
  assert.deepEqual(claudeGate(text, settings(), sha256(text)), { open: true });
  assert.ok('ask' in claudeGate(note('Confidential', 'Changed.\n'), settings(), sha256(text)));
  assert.ok('ask' in claudeGate(text, settings(), null));
  assert.ok('ask' in claudeGate(text, settings(), ''));
});

test('a yes never opens the highest classification, an unknown one, or a credential', () => {
  for (const text of [
    note('Restricted'),
    note('Nonsense'),
    front('classification: Public', 'classification: Public'),
    note('Confidential', `db_password: "${value}"\n`),
  ])
    assert.ok('refuse' in claudeGate(text, settings(), sha256(text)), text);
});

test('a label’s case is the settings’ own in what is said', () => {
  assert.match(claudeGate(note('cOnFiDeNtIaL'), settings()).ask, /Confidential/);
  assert.ok(!claudeGate(note('cOnFiDeNtIaL'), settings()).ask.includes('cOnFiDeNtIaL'));
});

// Claude's level from the matrix row picked for the model named Claude (model_ceiling), with the same fail-closed rules;
// with no row picked, the ceiling above stands.
const cell = (name, mark, condition) => ({ class: name, mark, ...(condition ? { condition } : {}) });
const ROWS = [
  {
    name: 'Claude chat',
    cells: [
      cell('Public', 'yes'),
      cell('Internal', 'conditional', 'history off'),
      cell('Confidential', 'no'),
      cell('Restricted', 'yes'),
    ],
  },
];
const withRow = (extra = {}, rows = ROWS) =>
  settings({
    aiModels: [{ ...claude('Restricted'), matrixRow: 'Claude chat', ...extra }],
    matrix: rows,
    aiClassMap: {},
  });

test('a picked row replaces Claude’s ceiling: yes opens, a conditional is asked until switched on, a no is asked', () => {
  assert.deepEqual(claudeGate(note('Public'), withRow()), { open: true });
  assert.match(claudeGate(note('Internal'), withRow()).ask, /Claude chat/);
  const on = withRow({ matrixOn: [{ class: 'Internal', condition: 'history off' }] });
  assert.deepEqual(claudeGate(note('Internal'), on), { open: true });
  const stale = withRow({ matrixOn: [{ class: 'Internal', condition: 'something else' }] });
  assert.ok('ask' in claudeGate(note('Internal'), stale));
  assert.ok(
    'ask' in claudeGate(note('Confidential'), withRow({ matrixOn: [{ class: 'Confidential', condition: '' }] })),
  );
});

test('the highest classification still never opens, whatever the row says', () => {
  assert.ok('refuse' in claudeGate(note('Restricted'), withRow()));
});

test('a row that is missing, named twice or unreadable asks for everything above the highest, never opens', () => {
  assert.ok('ask' in claudeGate(note('Public'), withRow({}, [])));
  assert.ok('ask' in claudeGate(note('Public'), withRow({ matrixRow: 'Nowhere' })));
  assert.ok('ask' in claudeGate(note('Public'), withRow({}, [...ROWS, ...ROWS])));
  assert.ok(
    'ask' in
      claudeGate(note('Public'), settings({ aiModels: [{ ...claude('Restricted'), matrixRow: 'Claude chat' }] })),
  );
});

test('with no row picked the ceiling stands, and a row picked for another model is not Claude’s', () => {
  assert.deepEqual(claudeGate(note('Internal'), settings()), { open: true });
  const other = { ...claude('Public'), name: 'Other', matrixRow: 'Claude chat' };
  assert.ok('ask' in claudeGate(note('Internal'), settings({ aiModels: [other], matrix: ROWS })));
});
