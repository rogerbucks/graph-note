// Lists sorted for the reader (editor spec §42, locale_sorting): in the collation of the reader's locale, digits as
// numbers. An order written into text keeps one order in every locale.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, setLocale, sortedForReader } from '../src/locale-formats.ts';

afterEach(() => setLocale(DEFAULT_LOCALE));

describe('sorted for the reader', () => {
  test('digits sort as numbers, so wave 10 comes after wave 9', () => {
    assert.deepEqual(sortedForReader(['Wave 10', 'Wave 9', 'Wave 1']), ['Wave 1', 'Wave 9', 'Wave 10']);
  });

  test('each locale sorts its own letters where its readers expect them', () => {
    setLocale('sv-SE');
    assert.deepEqual(sortedForReader(['ö', 'z', 'a']), ['a', 'z', 'ö'], 'ö after z in Swedish');
    setLocale('de-DE');
    assert.deepEqual(sortedForReader(['ö', 'z', 'a']), ['a', 'ö', 'z'], 'ö with o in German');
  });

  test('the list it is given is left as it was', () => {
    const texts = ['b', 'a'];
    sortedForReader(texts);
    assert.deepEqual(texts, ['b', 'a']);
  });
});
