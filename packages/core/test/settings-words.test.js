// The settings page's words, in the person's language (editor spec §42, words_catalogue): every word of every option is in
// the catalogue, as the option says it in UK English, so a translation reaches the whole page; each is said in the
// language set, and a word the catalogue lacks is said as the option has it.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS } from '../src/settings.ts';
import { optionSaid, optionWordKeys } from '../src/settings-words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

/** Each word of option `o` in UK English, in the order of its keys. */
const wordsOf = (o) => [
  o.name,
  o.sentence,
  ...(o.choices ?? []).flatMap((c) => [c.name, ...(c.sentence ? [c.sentence] : [])]),
];

/** The page's own words, kept beside the options': the action that converts a note to standard GQL. */
const OWN = ['settings.convert.sentence'];

describe('the settings page’s words', () => {
  test('every word of every option is in the catalogue, as the option says it', () => {
    for (const o of OPTIONS) {
      const keys = optionWordKeys(o);
      const words = wordsOf(o);
      keys.forEach((key, i) =>
        assert.equal(SOURCE_WORDS[key], words[i], `${key}: change settings-source-words.ts with the option`),
      );
    }
  });

  test('the catalogue keeps no word of an option that is gone', () => {
    const kept = new Set(OPTIONS.flatMap(optionWordKeys));
    const stray = Object.keys(SOURCE_WORDS).filter(
      (k) => /^settings\.[a-z-]+\.(?:name|sentence)$/.test(k) && !kept.has(k) && !OWN.includes(k),
    );
    assert.deepEqual(stray, []);
  });

  test('in UK English, each option is said as it is written', () => {
    for (const o of OPTIONS) assert.deepEqual(optionSaid(o), o, o.key);
  });

  test('in another language, its name, its sentence and every choice are said in it', () => {
    setLanguage('en-XA');
    for (const o of OPTIONS) {
      const s = optionSaid(o);
      assert.ok(wordsOf(s).every(isPseudoWord), o.key);
      assert.deepEqual(
        s.choices?.map((c) => c.value),
        o.choices?.map((c) => c.value),
        'the values stay as they are',
      );
    }
  });

  test('a word the catalogue lacks is said as the option has it', () => {
    setLanguage('en-XA');
    const made = { key: 'notAnOption', section: 'Drawing', name: 'Made up', sentence: 'Not kept.' };
    assert.deepEqual(optionSaid(made), made);
  });
});
