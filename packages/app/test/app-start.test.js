// The app's first page speaks the system's language (editor spec §42, language_follows_host). The window says the
// system's language, as the browser editor's page takes it from the browser. The words, the page's language and its
// direction follow it. A language with no translation file is said in UK English.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PSEUDO_LANGUAGES, isPseudoWord } from '@thoughtknot/core';
import { cleanUpApp, openAppStart } from './app-window.js';
import { PRIVACY_PAGE } from '../src/app-start.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

after(cleanUpApp);

/** The first page with no folder picked, in `language`: its button's words, and the page's language and direction. */
async function firstPage(language) {
  const page = await openAppStart(null, language);
  try {
    await until(() => page.doc.querySelector('#gn-app button'), 8000);
    const root = page.doc.documentElement;
    return { button: page.doc.querySelector('#gn-app button').textContent, lang: root.lang, dir: root.dir };
  } finally {
    await page.stop();
  }
}

test('the first page is in the system’s language, read in its direction', async () => {
  for (const language of Object.keys(PSEUDO_LANGUAGES)) {
    const seen = await firstPage(language);
    assert.ok(isPseudoWord(seen.button), `${language}: the button says "${seen.button}"`);
    assert.equal(seen.lang, language);
    assert.equal(seen.dir, language === 'ar-XB' ? 'rtl' : 'ltr');
  }
});

test('a system language with no translation file is said in UK English', async () => {
  assert.deepEqual(await firstPage('en-US'), { button: 'Open a folder of notes', lang: 'en-GB', dir: 'ltr' });
});

test('the first page names the privacy page, where the site publishes it (LEGAL-2)', async () => {
  assert.equal(PRIVACY_PAGE, 'https://thoughtknot.app/privacy.html');
  const page = await openAppStart(null);
  try {
    await until(() => page.doc.querySelector('.gn-app-privacy'), 8000);
    assert.match(page.doc.querySelector('.gn-app-privacy').textContent, /keeps no data about you\. .*privacy\.html$/);
  } finally {
    await page.stop();
  }
});
