// Many problems are grouped by kind (spec §8). The kind comes from the problem's code, or from the core that raised it.
// It never comes from its English words, so the groups hold in every language (editor spec §42, words_catalogue). The
// signs and headings of the list are words from the catalogue too.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { problemKind, severityWords } from '../src/display/graph-view/problems-list.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const SHOP = `// graph: shop
(a:T {name: 'A'}),
(bob:T {name: 'B'}),
(a)-[:LIKES]->(bob),
(bob)-[:LIKES]->(a),
(a)-[:LIKES]->(bobb),
(a)-[:LIKES]->(gone),
(a)-[:LIKS]->(bob),
(x:T {v: })`;

/** Each problem of the shop graph, by the start of the name or type it is about, with its kind. */
const kinds = () =>
  readNote([SHOP]).problems.map((p) => [/bobb|gone|LIKS|'}'/.exec(p.message)?.[0] ?? p.message, problemKind(p)]);

describe('the kind of a problem', () => {
  test('is the same in a pseudo language as in UK English: grouped by code or by what raised it, not by words', () => {
    const english = kinds();
    setLanguage('en-XA');
    const reading = readNote([SHOP]);
    assert.ok(
      reading.problems.some((p) => isPseudoWord(p.message)),
      'some problem is said in the pseudo language',
    );
    assert.deepEqual(kinds(), english);
  });

  test('a link to a missing thing, near miss or not, is a broken link; a bad value is unreadable', () => {
    const k = Object.fromEntries(kinds());
    assert.equal(k.bobb, 'broken-links');
    assert.equal(k.gone, 'broken-links');
    assert.equal(k["'}'"], 'unreadable');
  });

  test('a near miss of a relationship type is an unknown type, though the reader raised no code for it', () => {
    assert.equal(Object.fromEntries(kinds()).LIKS, 'unknown-types');
  });
});

describe('the signs and headings of the problems list', () => {
  test('come from the catalogue, so a pseudo language changes them all', () => {
    setLanguage('en-XA');
    for (const severity of ['error', 'warning', 'hint']) {
      const w = severityWords(severity);
      assert.ok(isPseudoWord(w.sign) && isPseudoWord(w.heading), `${severity}: ${w.sign}, ${w.heading}`);
    }
  });
});
