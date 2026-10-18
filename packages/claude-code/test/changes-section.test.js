// The changes view in the browser editor (editor spec §41, changes_view). The page runs as built, in a DOM. It runs
// against the real server over a vault that is a git repository.
// - "Compare with…" lists the note's earlier versions only once pressed.
// - The one picked is drawn with the note as it now is.
// - Each change is marked by its line as well as its hue in the scheme's colours, and listed in words.
// - A note kept in no repository says why.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { NOTE_PATH, livePage } from './editor-page-live.js';

after(cleanUp);

const NOTE =
  '# Reading\n```gql\n// graph: reader\n' +
  "(question:Question {title: 'Which reader?'}),\n(tablet:Option {name: 'Tablet'}),\n" +
  "(alice:Person {name: 'Alice'}),\n(tablet)-[:ANSWERS]->(question)\n```\n";
const NOW = NOTE.replace("(alice:Person {name: 'Alice'}),\n", "(small:Option {name: 'Small reader'}),\n");

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  });

/** The page open on the note, every call to the server and every image made kept. */
async function opened() {
  const asked = [],
    images = [];
  const page = await livePage(NOTE, {
    before: (window) => {
      const fetching = window.fetch;
      window.fetch = (url, init) => (asked.push(url), fetching(url, init));
      window.URL.createObjectURL = (blob) => (images.push(blob), `blob:${images.length}`);
    },
  });
  await page.ready();
  return { page, asked, images };
}

const pressNamed = (doc, text) => Array.from(doc.querySelectorAll('button')).find((b) => b.textContent === text);

describe('the changes view in the browser editor', () => {
  // proves: changes_view
  test('compares the note with its last commit: drawn with every change marked, and listed in words', async () => {
    const { page, asked, images } = await opened();
    try {
      git(page.vault, 'init', '-q', '-b', 'main');
      git(page.vault, 'add', NOTE_PATH);
      git(page.vault, 'commit', '-q', '-m', 'The first reading');
      page.write(NOW);
      await until(() => page.doc.querySelector('.gn-prose')?.textContent.includes('Small reader') ?? true, 8000);
      // nothing of the history is read until the user asks
      assert.equal(asked.filter((u) => /\/versions$/.test(u)).length, 0);
      pressNamed(page.doc, 'Compare with…').click();
      await until(() => !!page.doc.querySelector('#gn-changes-pick'), 8000);
      const pick = page.doc.querySelector('#gn-changes-pick');
      assert.match(pick.options[0].textContent, /^Last commit: The first reading/);
      assert.equal(page.doc.querySelector('label[for="gn-changes-pick"]')?.textContent, 'Version to compare with');
      const drawnBefore = images.length;
      pressNamed(page.doc, 'Show changes').click();
      await until(() => !!page.doc.querySelector('.gn-changes-result img'), 8000);
      const items = Array.from(page.doc.querySelectorAll('#gn-changes-list > li')).map(
        (li) => li.firstChild.textContent,
      );
      assert.deepEqual(items, ['Added: Small reader (Option)', 'Removed: Alice (Person)']);
      const img = page.doc.querySelector('.gn-changes-result img');
      assert.match(img.getAttribute('alt'), /2 changes, added drawn heavy, changed dashed, removed dotted/);
      assert.equal(img.getAttribute('aria-describedby'), 'gn-changes-list');
      const svg = await images.at(-1).text();
      assert.ok(images.length > drawnBefore);
      assert.match(svg, /stroke-width:3/);
      assert.match(svg, /stroke-dasharray:2 3/);
      assert.doesNotMatch(svg, /var\(--/);
    } finally {
      await page.stop();
    }
  });

  // proves: changes_view
  test('a note kept in no repository says why, and offers nothing to pick', async () => {
    const { page } = await opened();
    try {
      pressNamed(page.doc, 'Compare with…').click();
      await until(() => /git repository/.test(page.doc.querySelector('.gn-changes-result')?.textContent ?? ''), 8000);
      assert.equal(page.doc.querySelector('#gn-changes-pick'), null);
    } finally {
      await page.stop();
    }
  });
});
