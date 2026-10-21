// The graph spec reader's own problems, said from the catalogue (editor spec §42, words_catalogue and problem_codes).
// Each code's message and fix has a word, equal to its template in problem-codes.json. A problem's values are found by
// matching its words against its own code's template. Then they are said in the person's language. A code the core
// does not know, or words that do not fit, are said as the reader gave them.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import gs from '@thoughtknot/graph-spec';
import { placeholdersOf, sayWords, setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { readerKeys, readerValues, readerWords } from '../src/reader-words.ts';
import { readNote } from '../src/drawing.ts';
import { dataKind } from '../src/blocks.ts';
import { readStatement } from '../src/proposals-statements.ts';

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const TABLE = json('../../graph-spec/src/reader/problem-codes.json');
const CASES = json('../../graph-spec/test/problem-code-cases.json');

afterEach(() => setLanguage(SOURCE_LANGUAGE));

/** A sample value for each placeholder of a code: a number for `count`, else a word of its own name. */
const sampleOf = (c) =>
  Object.fromEntries(
    placeholdersOf(`${c.message} ${c.fix}`).map((name) => [name, name === 'count' ? 65 : `${name}_x9`]),
  );

describe('editor spec §42: the reader’s problems in the catalogue', () => {
  test('every problem code has a message and a fix word, each its template in UK English', () => {
    const wrong = [];
    for (const c of TABLE.codes) {
      const keys = readerKeys(c.code);
      if (!keys) {
        wrong.push(`${c.code}: no keys`);
        continue;
      }
      if (SOURCE_WORDS[keys.message] !== c.message) wrong.push(`${c.code}: the message is not its template`);
      if (SOURCE_WORDS[keys.fix] !== c.fix) wrong.push(`${c.code}: the fix is not its template`);
      assert.deepEqual(placeholdersOf(SOURCE_WORDS[keys.message] ?? ''), placeholdersOf(c.message), c.code);
      assert.deepEqual(placeholdersOf(SOURCE_WORDS[keys.fix] ?? ''), placeholdersOf(c.fix), c.code);
    }
    assert.deepEqual(wrong, []);
  });

  test('every code’s message and fix, filled with sample values, gives them back and is said the same', () => {
    for (const c of TABLE.codes) {
      const values = sampleOf(c);
      const problem = { code: c.code, msg: sayWords(c.message, values), fix: sayWords(c.fix, values) };
      assert.deepEqual(readerValues(problem), values, c.code);
      assert.deepEqual(readerWords(problem), { message: problem.msg, fix: problem.fix }, c.code);
    }
  });

  test('every block the reader refuses has its values found, and is said the same in UK English', () => {
    const ours = CASES.cases.filter(
      (c) => c.via !== 'to_gql' && TABLE.codes.find((t) => t.code === c.code)?.libraries.includes('js'),
    );
    assert.ok(ours.length > 30);
    for (const c of ours) {
      let e = null;
      try {
        if (c.via === 'change') gs.readChange(c.block);
        else new gs.Store().apply(c.block);
      } catch (err) {
        e = err;
      }
      assert.ok(e instanceof gs.ProfileError, c.name);
      assert.ok(readerValues(e), `${c.name}: ${e.msg} — ${e.fix}`);
      assert.deepEqual(readerWords(e), { message: e.msg, fix: e.fix }, c.name);
    }
  });

  test('an unknown code, no code, or words that do not fit their template are said as the reader gave them', () => {
    setLanguage('en-XA');
    for (const problem of [
      { code: 'GN999', msg: 'something new', fix: 'do this' },
      { msg: 'no thing called b in graph g', fix: 'check the spelling — or write it here with its kind: (b:Kind {…})' },
      { code: 'GN310', msg: 'not the template at all', fix: 'nor this' },
      {
        code: 'GN310',
        msg: 'no thing called b in graph g',
        fix: 'check the spelling — or write it here with its kind: (c:Kind {…})',
      },
    ]) {
      assert.equal(readerValues(problem), null);
      assert.deepEqual(readerWords(problem), { message: problem.msg, fix: problem.fix });
    }
  });

  test('a value the next words could split two ways is not guessed at: the reader’s words are kept', () => {
    // GN302's {types} and {last} are joined by " and ": a type called "A and B" could be split either way
    const msg = '[k] has no colon, and graph g has relationship types A and B and C, which differ only by case';
    const problem = { code: 'GN302', msg, fix: 'write the one meant with its colon, such as [:A]' };
    assert.equal(readerValues(problem), null);
    assert.deepEqual(readerWords(problem), { message: problem.msg, fix: problem.fix });
  });

  test('a count is given back as a number', () => {
    const problem = {
      code: 'GN604',
      msg: 'a join of 65 documents is over the limit of 64',
      fix: 'join at most 64 documents at a time, then join the results',
    };
    assert.deepEqual(readerValues(problem), { count: 65, limit: '64' });
  });
});

describe('editor spec §42: the reader’s problems, said in a test language', () => {
  test('a thing not in the graph (GN310) and a value no graph holds (GN207) are said in the test language', () => {
    setLanguage('en-XA');
    const { problems } = readNote([
      "// graph: shop\n(a:T {name: 'A'}),\n(a)-[:LIKES]->(zebra)",
      '// graph: other\n(x:T {v: })',
    ]);
    for (const code of ['GN310', 'GN207']) {
      const p = problems.find((q) => q.code === code);
      assert.ok(p, code);
      assert.ok(isPseudoWord(p.message), `${code}: ${p.message}`);
      assert.ok(isPseudoWord(p.fix), `${code}: ${p.fix}`);
      assert.doesNotMatch(p.message, /no thing called|is not a value/, code);
    }
  });

  test('a near miss (GN310) is still drawn as an estimate in the test language', () => {
    setLanguage('en-XA');
    const { problems } = readNote(["// graph: shop\n(a:T {name: 'A'}),\n(bob:T {name: 'B'}),\n(a)-[:LIKES]->(bobb)"]);
    const p = problems.find((q) => q.code === 'GN310');
    assert.equal(p?.severity, 'warning');
    assert.deepEqual(p?.replace, { written: 'bobb', with: ['bob'] });
  });

  test('a graph line and a change refused say the reader’s problem in it too', () => {
    setLanguage('en-XA');
    const header = dataKind('// graph: reader-choice\n(a:T)');
    assert.equal(header.code, 'GN102');
    assert.ok(isPseudoWord(header.message) && !/not one word/.test(header.message), header.message);
    assert.ok(isPseudoWord(header.fix) && !/use letters/.test(header.fix), header.fix);
    const refused = readStatement("MATCH (a:T {id: 'a'}) DETACH a");
    assert.ok('refused' in refused);
    assert.doesNotMatch(refused.refused, /DETACH is followed|write DETACH DELETE v$/);
    assert.ok(isPseudoWord(refused.refused), refused.refused);
  });
});
