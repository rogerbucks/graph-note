// What the browser editor may show Claude (editor spec §26, cc_classified_asks, cc_credential_never): a note above the
// level set for Claude is asked about first, the highest classification never opens, a note with none counts as the
// level set for unlabelled notes, and a credential never reaches Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeGate, noteClassification } from '../src/claude-gate.ts';

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
