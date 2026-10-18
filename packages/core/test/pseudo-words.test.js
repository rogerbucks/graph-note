// The test languages (editor spec §42, pseudo_locales_checked): each word of the source said accented, bracketed and 40 per
// cent longer, its placeholders and plural forms kept, so it passes the check every translation passes; the right-to-left
// one is read right to left. Setting either makes it from the source words, so a host can be tried in it as it is.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord, PSEUDO_LANGUAGES, pseudoWords } from '../src/pseudo-words.ts';
import { directionOf, setLanguage, SOURCE_LANGUAGE, translationProblems, word } from '../src/words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

describe('the test languages', () => {
  for (const tag of Object.keys(PSEUDO_LANGUAGES))
    test(`${tag} holds the source’s keys, placeholders and plural forms`, () => {
      const made = pseudoWords(SOURCE_WORDS, tag);
      assert.deepEqual(Object.keys(made), Object.keys(SOURCE_WORDS));
      assert.deepEqual(translationProblems(SOURCE_WORDS, made, tag), []);
    });

  test('say each word accented, bracketed and at least 40 per cent longer than its words, its placeholders as they are', () => {
    const made = pseudoWords({ a: 'Type of {name}: {type}', b: 'Copy' }, 'en-XA');
    assert.match(made.a, /^⟦Ŧẏƥḗ ǿƒ \{name\}: \{type\} ·+⟧$/);
    assert.equal(made.b, '⟦Ƈǿƥẏ ··⟧');
    for (const [key, source] of Object.entries(SOURCE_WORDS)) {
      if (typeof source !== 'string') continue;
      const long = pseudoWords({ [key]: source }, 'en-XA')[key];
      const words = source.replace(/\{[a-zA-Z0-9]+\}/g, '').length;
      assert.ok(long.length - source.length >= words * 0.4, `${key}: ${long}`);
      assert.doesNotMatch(long.replace(/\{[a-zA-Z0-9]+\}/g, ''), /[a-zA-Z]/, `${key} keeps a plain letter`);
    }
  });

  test('say each plural form, so a count is said in the test language too', () => {
    setLanguage('en-XA');
    assert.match(word('find.found', { count: 1 }), /^⟦1 ŧħīƞɠ ƒǿŭƞḓ\. ·+⟧$/);
    assert.match(word('find.found', { count: 3 }), /^⟦3 ŧħīƞɠş ƒǿŭƞḓ\. ·+⟧$/);
  });

  test('right to left: read in that direction, its brackets kept on its own sides', () => {
    assert.equal(directionOf('ar-XB'), 'rtl');
    assert.equal(directionOf('en-XA'), 'ltr');
    assert.equal(PSEUDO_LANGUAGES['ar-XB'], 'rtl');
    assert.equal(pseudoWords({ b: 'Copy' }, 'ar-XB').b, '‏⟦Ƈǿƥẏ ··⟧‏');
  });

  test('are made from the source words when first set, and are told from a word the code says itself', () => {
    assert.equal(setLanguage('en-XA'), 'en-XA');
    assert.ok(isPseudoWord(word('code.copy')));
    assert.equal(setLanguage('ar-XB'), 'ar-XB');
    assert.ok(isPseudoWord(word('code.copy')));
    setLanguage(SOURCE_LANGUAGE);
    assert.equal(word('code.copy'), 'Copy');
    assert.equal(isPseudoWord('Copy'), false);
  });
});
