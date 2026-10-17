// A translation is checked against the source before it is used (editor spec §42, translations_as_files): the same keys,
// the same placeholders, and plural forms where the source has them, each problem said on its own line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { translationProblems } from '../src/words.ts';

const SOURCE = {
  'a.copied': 'Copied',
  'a.type-of': 'Type of {name}: {type}',
  'a.found': { one: '{count} thing found.', other: '{count} things found.' },
};

describe('a translation checked against the source', () => {
  test('one with the source’s keys, placeholders and plural forms, or fewer keys, has no problem', () => {
    assert.deepEqual(translationProblems(SOURCE, { 'a.copied': 'Copié' }, 'fr'), []);
    const full = {
      'a.copied': 'Copié',
      'a.type-of': '{type} : type de {name}',
      'a.found': { other: '{count} trouvées' },
    };
    assert.deepEqual(translationProblems(SOURCE, full, 'fr'), []);
  });

  test('a key the source lacks, or a tag that is no language, is a problem', () => {
    assert.deepEqual(translationProblems(SOURCE, { 'a.gone': 'x' }, 'not a language!'), [
      '"not a language!" is not a language tag',
      'a.gone: the source has no such word',
    ]);
  });

  test('a placeholder lost, added or renamed is a problem, in a word or in any plural form', () => {
    assert.deepEqual(
      translationProblems(SOURCE, { 'a.type-of': 'Typ von {name}', 'a.found': { other: '{n} gefunden' } }, 'de'),
      [
        'a.type-of: has the placeholders [name], the source [name, type]',
        'a.found: has the placeholders [n], the source [count]',
      ],
    );
  });

  test('plural forms for a single word, one word for plural forms, or a form with no name are problems', () => {
    assert.deepEqual(
      translationProblems(
        SOURCE,
        { 'a.copied': { other: 'Copié' }, 'a.found': '{count} trouvées', 'a.type-of': 7 },
        'fr',
      ),
      [
        'a.copied: the source has one word',
        'a.found: the source changes with a count',
        'a.type-of: is neither a word nor plural forms with "other"',
      ],
    );
    assert.deepEqual(translationProblems(SOURCE, { 'a.found': { other: '{count}', several: '{count}' } }, 'fr'), [
      'a.found: "several" is not a plural form',
    ]);
  });
});
