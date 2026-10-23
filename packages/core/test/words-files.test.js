// A translation is checked against the source before it is used (editor spec §42, translations_as_files). It needs the
// same keys, the same placeholders, and plural forms where the source has them. Each problem is said on its own line.
// Each translation is a plain JSON file in packages/core/translations/, named by its language tag. The core reads them
// through one list, which scripts/translations.mjs writes, so a translator writes no code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translatedLanguages, translationProblems } from '../src/words.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';
import { TRANSLATION_FILES } from '../src/translation-files.ts';
import { languageChoice } from '../src/settings-language.ts';
import { optionSaid, optionWordKeys } from '../src/settings-words.ts';
import { FOLDER, LIST, listText, translationTags } from '../../../scripts/translations.mjs';

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

describe('the translation files', () => {
  test('each is a JSON file named by its language tag, holding to the source', () => {
    for (const tag of translationTags()) {
      assert.equal(Intl.getCanonicalLocales(tag)[0], tag, `${tag}.json: name it by its language tag, such as pt-BR`);
      const file = JSON.parse(readFileSync(join(FOLDER, `${tag}.json`), 'utf8'));
      assert.ok(file && typeof file === 'object' && !Array.isArray(file), `${tag}.json: keys and their words`);
      assert.deepEqual(translationProblems(SOURCE_WORDS, file, tag), [], `${tag}.json`);
    }
  });

  test('every one is listed for the core, and nothing else: run node scripts/translations.mjs', () => {
    const listed = [...readFileSync(LIST, 'utf8').matchAll(/'\.\.\/translations\/(.+)\.json'/g)].map((m) => m[1]);
    assert.deepEqual(listed.sort(), translationTags());
    assert.deepEqual(Object.keys(TRANSLATION_FILES).sort(), translationTags());
    assert.deepEqual(translatedLanguages(), translationTags());
  });

  test('a file listed is imported by its tag, from the folder, as JSON', () => {
    const text = listText(['fr', 'pt-BR']);
    assert.match(text, /import t_fr from '\.\.\/translations\/fr\.json' with \{ type: 'json' \};/);
    assert.match(text, /import t_pt_BR from '\.\.\/translations\/pt-BR\.json' with \{ type: 'json' \};/);
    assert.match(text, /'fr': t_fr, 'pt-BR': t_pt_BR/);
  });

  test('the folder has a guide for translators', () => {
    const guide = readFileSync(join(FOLDER, 'README.md'), 'utf8');
    for (const step of ['--new', 'node scripts/translations.mjs', 'placeholder', 'npm run test:ai'])
      assert.ok(guide.includes(step), step);
  });

  test('a language offered in the settings keeps its own name in every language, with no catalogue word', () => {
    const o = {
      key: 'language',
      section: 'Language',
      name: 'Language',
      sentence: 's',
      choices: [languageChoice('fr')],
    };
    assert.deepEqual(optionWordKeys(o), ['settings.language.name', 'settings.language.sentence']);
    assert.deepEqual(optionSaid(o).choices, [{ value: 'fr', name: 'Français', own: true }]);
  });
});
