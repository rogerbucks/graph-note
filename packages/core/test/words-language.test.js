// The language the words are said in follows the host (editor spec §42, language_follows_host): a host says its language
// as it is installed, a translation for it, or for its base language, is used, and a word a translation lacks is said in
// UK English, never as its key.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addTranslation, currentLanguage, setLanguage, SOURCE_LANGUAGE, word } from '../src/words.ts';
import { installHost } from '../src/display/host.ts';

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
