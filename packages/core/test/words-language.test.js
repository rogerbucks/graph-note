// The language the words are said in follows the host (editor spec §42, language_follows_host). A host says its
// language as it is installed. A translation for it, or for its base language, is used. A word a translation lacks is
// said in UK English, never as its key. The language setting can name one in place of the host's.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addTranslation, currentLanguage, setLanguage, SOURCE_LANGUAGE, word } from '../src/words.ts';
import { chooseLanguage, installHost } from '../src/display/host.ts';
import { currentDirection } from '../src/words.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';
import { languageChoice } from '../src/settings-language.ts';

const FRENCH = {
  'code.copied': 'Copié',
  'find.found': { one: '{count} chose trouvée.', other: '{count} choses trouvées.' },
};

const host = (language) => ({
  icon: () => {},
  isPhone: () => false,
  notice: () => {},
  menu: () => {},
  ...(language && { language: () => language }),
});

afterEach(() => setLanguage(SOURCE_LANGUAGE));

describe('the language of the words', () => {
  test('is UK English until a language with a translation is set', () => {
    assert.equal(currentLanguage(), 'en-GB');
    assert.equal(setLanguage('sw'), 'en-GB');
    assert.equal(word('code.copied'), 'Copied');
  });

  test('a translation added is used for its language and for each of its regions', () => {
    addTranslation('fr', FRENCH);
    assert.equal(setLanguage('fr'), 'fr');
    assert.equal(word('code.copied'), 'Copié');
    assert.equal(setLanguage('fr-CA'), 'fr');
    assert.equal(word('find.found', { count: 0 }), '0 chose trouvée.');
    assert.equal(word('find.found', { count: 2 }), '2 choses trouvées.');
  });

  test('a word the translation leaves out is said in UK English, never as its key', () => {
    addTranslation('fr', FRENCH);
    setLanguage('fr');
    assert.equal(word('find.none'), 'No thing matches.');
    assert.equal(word('find.found', { count: 0 }), '0 chose trouvée.');
  });

  test('a translation that does not hold to the source is refused, saying why, and none of it is used', () => {
    assert.throws(
      () => addTranslation('de', { 'code.copied': 'Kopiert', 'properties.type-of': 'Typ von {name}' }),
      /The translation de was not added:\nproperties\.type-of: has the placeholders \[name\], the source \[name, type\]/,
    );
    assert.equal(setLanguage('de'), 'en-GB');
    assert.equal(word('code.copied'), 'Copied');
  });

  test('the host says its language as it is installed, and a host that says none is UK English', () => {
    addTranslation('fr', FRENCH);
    installHost(host('fr-FR'));
    assert.equal(currentLanguage(), 'fr');
    assert.equal(word('code.copied'), 'Copié');
    installHost(host());
    assert.equal(currentLanguage(), 'en-GB');
  });
});

describe('the language setting', () => {
  test('follows the host until a language is chosen, and the locale and direction follow the language', () => {
    addTranslation('fr', FRENCH);
    installHost({ ...host('fr-FR'), direction: () => 'rtl' });
    assert.equal(chooseLanguage('host'), 'fr');
    assert.equal(currentDirection(), 'rtl', 'the host says its direction');
    assert.equal(chooseLanguage('en-GB'), 'en-GB');
    assert.equal(word('code.copied'), 'Copied');
    assert.equal(currentDirection(), 'ltr', 'the language chosen says its own');
    assert.equal(chooseLanguage('host'), 'fr');
    installHost(host());
  });

  test('is saved as one of its choices: the host’s, UK English or a language with a translation file', () => {
    const o = OPTIONS.find((x) => x.key === 'language');
    assert.equal(DEFAULT_SETTINGS.language, 'host');
    assert.deepEqual(
      o.choices.slice(0, 2).map((c) => c.value),
      ['host', 'en-GB'],
    );
    assert.equal(settingsFrom({ language: 'en-GB' }).language, 'en-GB');
    assert.equal(settingsFrom({ language: 'xx-unknown' }).language, 'host');
  });

  test('names a language with a translation in itself, the same in every language', () => {
    assert.deepEqual(languageChoice('fr'), { value: 'fr', name: 'Français', own: true });
    assert.deepEqual(languageChoice('pt-BR'), { value: 'pt-BR', name: 'Português (Brasil)', own: true });
  });
});
