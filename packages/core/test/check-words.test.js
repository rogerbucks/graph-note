// The graph spec's change-set check, said from the catalogue (editor spec §42, words_catalogue). Each line the check
// can say has a word, equal to the line in the graph spec's own code. This test reads those lines from that code, so
// a line added there fails here until it has a word. A line is said in the person's language, its values kept. The
// line that says the graph has moved is left out by its key, never by its English words.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';
import { CHECK_SOURCE_WORDS } from '../src/check-source-words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { checkWords } from '../src/check-words.ts';
import { checkProposal, checkRefusal } from '../src/proposals-check.ts';
import { NOTE, NOTE_WITH_ADA, blocksOf, noteWithChangeSet, proposalOf } from './proposals-fixtures.js';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const SRC = new URL('../../graph-spec/src/', import.meta.url);
/** The files whose rules the check runs on the graph after the set: their lines start with a section, `§`. */
const RULE_FILES = ['check.js', 'certainty.js', 'paths.js', 'provenance.js', 'judgements.js', 'servings.js'];

/** Every string in a file of the graph spec, as its words, a template's values as `{name}`, each with its node. */
function stringsIn(rel) {
  const file = ts.createSourceFile(rel, readFileSync(new URL(rel, SRC), 'utf8'), ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push({ text: node.text, node });
    else if (ts.isTemplateExpression(node)) {
      const name = (e) => (ts.isPropertyAccessExpression(e) ? e.name.text : e.getText());
      const text = node.head.text + node.templateSpans.map((s) => `{${name(s.expression)}}${s.literal.text}`).join('');
      found.push({ text, node });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The lines of changeset.js: each string of words, but its 'use strict' and the prefix of a rule after the set. */
const setStrings = stringsIn('changesets/changeset.js').filter(
  ({ text, node }) => /[a-z] [a-z]/.test(text) && !ts.isExpressionStatement(node.parent),
);
const prefixOf = (s) => ts.isBinaryExpression(s.node.parent) && s.node.parent.left === s.node;
const SET_LINES = setStrings.filter((s) => !prefixOf(s)).map((s) => s.text);
const PREFIXES = setStrings.filter(prefixOf).map((s) => s.text);
const RULE_LINES = RULE_FILES.flatMap((f) => stringsIn(`rules/${f}`))
  .map((s) => s.text)
  .filter((t) => t.startsWith('§'));

describe('editor spec §42: the change-set check’s lines in the catalogue', () => {
  test('the graph spec’s code was read: its lines, its rules and the one prefix of a rule after the set', () => {
    assert.ok(SET_LINES.length >= 20, String(SET_LINES.length));
    assert.ok(RULE_LINES.length >= 30, String(RULE_LINES.length));
    assert.deepEqual(PREFIXES, ['after it, ']);
  });

  test('every line the check can say has a word equal to it, and every word is a line it can say', () => {
    const words = Object.values(CHECK_SOURCE_WORDS);
    const lines = [...SET_LINES, ...RULE_LINES, `${PREFIXES[0]}{rule}`];
    assert.deepEqual(
      lines.filter((l) => !words.includes(l)),
      [],
      'give each new line of the graph spec’s check a word in check-source-words.ts',
    );
    assert.deepEqual(
      words.filter((w) => !lines.includes(w)),
      [],
      'a word the check no longer says',
    );
    for (const [key, text] of Object.entries(CHECK_SOURCE_WORDS)) assert.equal(SOURCE_WORDS[key], text, key);
  });

  test('every line, and every rule after the set, is found by its word and said the same in UK English', () => {
    for (const line of [...SET_LINES.filter((l) => !l.includes('{')), ...RULE_LINES]) {
      const { id, said } = checkWords(line);
      assert.equal(SOURCE_WORDS[id], line, line);
      assert.equal(said, line);
      const after = `after it, ${line}`;
      assert.deepEqual(checkWords(after), { id, said: after });
    }
  });

  test('a line that holds a value gives it back, in UK English and in a test language', () => {
    const graph = "its graph shop_x9 is one of the base's";
    const author = 'its author ada_x9 is a known person or model';
    assert.deepEqual(checkWords(graph), { id: 'check.graph-in-base', said: graph });
    assert.deepEqual(checkWords(author), { id: 'check.author-known', said: author });
    setLanguage('en-XA');
    for (const [line, value] of [
      [graph, 'shop_x9'],
      [author, 'ada_x9'],
    ]) {
      const { said } = checkWords(line);
      assert.ok(isPseudoWord(said), said);
      assert.ok(said.includes(value), said);
      assert.notEqual(said, line);
    }
  });

  test('a line said in a test language differs from its UK English, a rule after the set too', () => {
    setLanguage('en-XA');
    for (const line of [
      'it was made against the graph as it stands',
      'after it, §5: every element has a declared type',
    ]) {
      const { id, said } = checkWords(line);
      assert.ok(id, line);
      assert.ok(isPseudoWord(said), said);
      assert.notEqual(said, line);
    }
  });

  test('a line the core does not know has no key and is said as the check gave it, a rule after the set too', () => {
    setLanguage('en-XA');
    for (const line of ['something new is checked', 'after it, §99: something new', 'after it, '])
      assert.deepEqual(checkWords(line), { id: null, said: line });
  });
});

describe('editor spec §42: a proposal’s check, said in the person’s language', () => {
  /** The change set block of a note. */
  const setOf = (note) => blocksOf(note).find((b) => /CHANGE SET/.test(b.split('\n')[0]));
  /** A note whose graph has moved since its change set was made: the set's `against` no longer matches. */
  const moved = (note) => note.replace('price: 3', 'price: 5');

  test('every line of a real check has the key of its word', () => {
    const { note } = noteWithChangeSet(proposalOf(), NOTE_WITH_ADA);
    const check = checkProposal(note, setOf(note));
    assert.ok(check.results.length > 5);
    assert.deepEqual(
      check.results.filter((r) => !r.id),
      [],
    );
  });

  for (const language of [SOURCE_LANGUAGE, 'en-XA']) {
    test(`with the move seen, the line that says the graph moved is left out by its key (${language})`, () => {
      setLanguage(language);
      const note = moved(noteWithChangeSet(proposalOf(), NOTE_WITH_ADA).note);
      const check = checkProposal(note, setOf(note));
      const stale = check.results.find((r) => !r.ok);
      assert.equal(stale?.id, 'check.made-against-now');
      assert.equal(isPseudoWord(stale.label), language !== SOURCE_LANGUAGE, stale.label);
      assert.equal(checkRefusal(check, 'seen'), null);
      assert.ok(checkRefusal(check, 'counts')?.includes(stale.label));
    });

    test(`with the move seen, the other lines that failed are still said (${language})`, () => {
      setLanguage(language);
      const note = moved(noteWithChangeSet(proposalOf(), NOTE).note);
      const check = checkProposal(note, setOf(note));
      const failed = check.results.filter((r) => !r.ok);
      assert.deepEqual(
        failed.map((r) => r.id),
        ['check.made-against-now', 'check.author-known'],
      );
      const refusal = checkRefusal(check, 'seen') ?? '';
      assert.ok(refusal.includes(failed[1].label), refusal);
      assert.ok(!refusal.includes(failed[0].label), refusal);
    });
  }
});
