// The mod says its words in the system's language (editor spec §42, words_catalogue). The mod API names no language,
// so the language the system runs in is the one followed. A language with no translation is said in UK English. The
// editor server and the /graph command follow it too: each is run here in a test language set by the system's locale.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addTranslation,
  currentLanguage,
  isPseudoWord,
  setLanguage,
  SOURCE_LANGUAGE,
  SOURCE_WORDS,
} from '@thoughtknot/core';
import { followSystemLanguage } from '../src/mod-language.ts';
import { ENTRY } from './editor-threats-support.js';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

/** The environment of a process whose system runs in `locale`, as the C library names it. */
const inLocale = (locale, more = {}) => ({ ...process.env, LC_ALL: locale, LANG: locale, ...more });

describe('the language of the mod', () => {
  // the core can add a translation but not take one away, so the language is put back to UK English after
  after(() => setLanguage(SOURCE_LANGUAGE));

  test('follows the language the system runs in, and its base language where only that is translated', () => {
    addTranslation('de', { ...SOURCE_WORDS });
    assert.equal(followSystemLanguage('de-AT'), 'de');
    assert.equal(currentLanguage(), 'de');
    assert.equal(followSystemLanguage('ja-JP'), 'en-GB');
    assert.equal(followSystemLanguage(), setLanguage(Intl.DateTimeFormat().resolvedOptions().locale));
  });

  test('the /graph command’s words follow the system’s language, set before the command is registered', () => {
    const script =
      "import { word } from '@thoughtknot/core'; import { followSystemLanguage } from './src/mod-language.ts';" +
      "followSystemLanguage(); console.log(JSON.stringify([word('cc.command'), word('cc.usage')]));";
    const said = (locale) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: PACKAGE,
        env: inLocale(locale),
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    assert.ok(said('en_XA.UTF-8').every(isPseudoWord), 'in the test language');
    assert.deepEqual(said('en_GB.UTF-8'), [SOURCE_WORDS['cc.command'], SOURCE_WORDS['cc.usage']]);
    const register = readFileSync(new URL('../mod/hooks/register.tsx', import.meta.url), 'utf8');
    assert.match(register, /export const register: Register = \(on\) => \{\s*\/\/[^\n]*\n\s*followSystemLanguage\(\);/);
  });

  test('the editor server says its words in the system’s language', () => {
    const vault = mkdtempSync(join(tmpdir(), 'mod-language-'));
    try {
      // a vault with no note to open: the server refuses to start, in words of the catalogue
      const refusal = (locale) => {
        const env = inLocale(locale, { THOUGHTKNOT_EDITOR_VAULT: vault });
        delete env.THOUGHTKNOT_EDITOR_NOTE;
        delete env.THOUGHTKNOT_EDITOR_DRAFTS;
        const r = spawnSync(process.execPath, [ENTRY], { env, encoding: 'utf8', timeout: 30_000, input: '' });
        assert.equal(r.status, 2, r.stderr);
        return r.stderr;
      };
      assert.ok(isPseudoWord(refusal('en_XA.UTF-8')), 'in the test language');
      assert.equal(refusal('en_GB.UTF-8'), `editor server: ${SOURCE_WORDS['server.no-note-or-drafts']}\n`);
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
