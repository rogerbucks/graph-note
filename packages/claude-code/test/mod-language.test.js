// The mod says its words in the system's language (editor spec §42, words_catalogue). The mod API names no language,
// so the language the system runs in is the one followed. A language with no translation is said in UK English.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addTranslation, currentLanguage, setLanguage, SOURCE_WORDS } from '@thoughtknot/core';
import { followSystemLanguage } from '../src/mod-language.ts';

describe('the language of the mod', () => {
  test('follows the language the system runs in, and its base language where only that is translated', () => {
    addTranslation('de', { ...SOURCE_WORDS });
    try {
      assert.equal(followSystemLanguage('de-AT'), 'de');
      assert.equal(currentLanguage(), 'de');
      assert.equal(followSystemLanguage('ja-JP'), 'en-GB');
      assert.equal(followSystemLanguage(), setLanguage(Intl.DateTimeFormat().resolvedOptions().locale));
    } finally {
      setLanguage('en-GB');
    }
  });
});
