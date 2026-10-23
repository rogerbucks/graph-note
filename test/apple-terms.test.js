// Building for Apple (spec §41, apple_terms). docs/apple-terms.md lists the rules we keep for the Mac and iPhone apps.
// These tests hold the ones a machine can check:
// - nothing people read says Apple checked, approved or endorses ThoughtKnot.
// - the name page says Apple's names are Apple's, and that Apple does not make or endorse ThoughtKnot.
// - the app's id sits under a domain the project owns, so it never has to change.
// - no workflow holds a key for the App Store: those stay on Roger's Mac.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, readJSON, walk } from './repository/repo.js';

/** Words that would say Apple vouches for the app, such as "approved by Apple" or "Apple-certified". */
const VOUCHED = [
  /\b(?:approved|checked|endorsed|certified|verified|vetted|scanned|reviewed)\s+by\s+Apple\b/i,
  /\bApple[- ](?:approved|checked|endorsed|certified|verified|vetted|scanned)\b/i,
];

/** The text people read: the read-me, the home page, the wiki, the guides and the docs. */
const readerFiles = () =>
  [
    'README.md',
    'site/index.html',
    'site/words.json',
    ...walk('wiki').filter((f) => f.endsWith('.md')),
    ...walk('docs').filter((f) => f.endsWith('.md') && !f.endsWith('.local.md')),
    ...walk('packages').filter((f) => /\/GUIDE\.md$/.test(f)),
  ].filter((f) => !f.includes('node_modules'));

test('nothing people read says Apple checked, approved or endorses ThoughtKnot (Roger, 23 Oct 2026)', () => {
  const found = [];
  for (const file of readerFiles()) {
    const text = read(file);
    for (const rule of VOUCHED) {
      const hit = text.match(rule);
      if (hit) found.push(`${file}: "${hit[0]}"`);
    }
  }
  assert.deepEqual(found, [], 'Say the app is signed and notarised. Never that Apple checked or approved it.');
});

test('the name page says Apple names are Apple trademarks and that Apple does not make or endorse ThoughtKnot (Roger, 23 Oct 2026)', () => {
  const marks = read('TRADEMARKS.md');
  assert.match(marks, /^## Other companies' names$/m);
  assert.match(marks, /trademarks of Apple Inc/);
  assert.match(marks, /not made, sponsored or endorsed by Apple/);
  assert.match(marks, /never .*Apple logo/i);
});

test('the app id sits under thoughtknot.app, a domain the project owns, so the store listing never has to move (Roger, 23 Oct 2026)', () => {
  const conf = readJSON('packages/app/src-tauri/tauri.conf.json');
  assert.match(conf.identifier, /^app\.thoughtknot\.[a-z]+$/);
});

test("no workflow holds a key for App Store or TestFlight uploads: those stay on Roger's Mac (Roger, 23 Oct 2026)", () => {
  const storeKey = /secrets\.([A-Z0-9_]*(?:DISTRIBUTION|APP_STORE|APPSTORE|PROVISION|TESTFLIGHT)[A-Z0-9_]*)/g;
  const found = walk('.github/workflows')
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((f) => [...read(f).matchAll(storeKey)].map((m) => `${f}: ${m[1]}`));
  assert.deepEqual(found, []);
});
