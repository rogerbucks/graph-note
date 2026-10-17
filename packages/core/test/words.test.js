// The words the person reads, from one catalogue by key (editor spec §42, words_catalogue): UK English is the source, a
// word is said with its placeholders filled and its plural form for a count, and the places brought to the catalogue say
// the same words as before.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { placeholdersOf, sayWords, setLanguage, SOURCE_LANGUAGE, translationProblems, word } from '../src/words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';
import { DEFAULT_LOCALE, setLocale } from '../src/locale-formats.ts';

afterEach(() => {
  setLanguage(SOURCE_LANGUAGE);
  setLocale(DEFAULT_LOCALE);
});

describe('the catalogue of words', () => {
  test('is UK English, every key dotted lower-case words, every entry a word or plural forms with "other"', () => {
    assert.equal(SOURCE_LANGUAGE, 'en-GB');
    for (const key of Object.keys(SOURCE_WORDS)) assert.match(key, /^[a-z]+(?:[.-][a-z]+)+$/, key);
    assert.deepEqual(translationProblems(SOURCE_WORDS, SOURCE_WORDS, SOURCE_LANGUAGE), []);
  });

  test('says a word by its key, with the words the places brought to it said before', () => {
    assert.equal(word('code.copied'), 'Copied');
    assert.equal(
      word('code.copy-refused'),
      'Could not copy: the device did not allow it. Select the text and copy it instead.',
    );
    assert.equal(word('properties.type.datetime'), 'Date & time');
    assert.equal(word('find.none'), 'No thing matches.');
  });

  test('fills each placeholder, and leaves one with no value as written, so nothing is said as undefined', () => {
    assert.equal(word('properties.type-of', { name: 'due', type: 'Date' }), 'Type of due: Date');
    assert.equal(word('properties.type-of', { name: 'due' }), 'Type of due: {type}');
    assert.deepEqual(placeholdersOf(SOURCE_WORDS['properties.type-of']), ['name', 'type']);
  });

  test('picks the plural form for a count, and shows the count in the reader’s locale', () => {
    assert.equal(word('find.found', { count: 1 }), '1 thing found.');
    assert.equal(word('find.found', { count: 2 }), '2 things found.');
    assert.equal(word('find.found', { count: 12345 }), '12,345 things found.');
    setLocale('de-DE');
    assert.equal(word('find.found', { count: 12345 }), '12.345 things found.');
  });

  test('a language with more plural forms than English has each said', () => {
    const forms = { one: '{count} rzecz', few: '{count} rzeczy', many: '{count} rzeczy!', other: '{count} rzeczy?' };
    assert.deepEqual(
      [1, 3, 5, 1.5].map((count) => sayWords(forms, { count }, 'pl')),
      ['1 rzecz', '3 rzeczy', '5 rzeczy!', '1.5 rzeczy?'],
    );
    assert.equal(sayWords({ other: '{count} x' }, { count: 1 }, 'ja'), '1 x');
  });
});
