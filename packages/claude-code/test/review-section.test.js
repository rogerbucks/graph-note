// The repository's changes to review in the browser editor (editor spec §41, github_review_items). The page runs as
// built, in a DOM, against the real server. GitHub is read by a stand-in the test hands the store.
// - "Review a change from GitHub…" reads nothing until pressed.
// - The change picked is shown in levels. The top is a summary by section, workstream and requirement. Next is each
//   graph drawn in the changes view. Last is every line, each marked by a sign.
// - A repository that cannot be read says why.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(cleanUp);

const NOTE = "# Reading\n```gql\n// graph: reader\n(question:Question {title: 'Which reader?'})\n```\n";

const REQUIREMENTS = `// graph: reqs
(section_41:Section {num: '41', title: 'Every surface'}),
(changes_view:Requirement {section: '41', rule: 'Changes are drawn.'})`;
const AFTER =
  REQUIREMENTS.replace('drawn.', 'drawn and listed.') + ",\n(review_items:Requirement {section: '41', rule: 'Items.'})";

const PULL = { kind: 'pull', id: '7', title: 'Review items', author: 'roger' };
const COMMIT = { kind: 'commit', id: 'a'.repeat(40), title: 'Tidy', author: 'Ann' };

/** GitHub as the store reads it, each read counted. */
function stand(fail) {
  const asked = { items: 0, files: 0 };
  const github = {
    items: async () => (asked.items++, fail ? { ok: false, why: fail } : { ok: true, value: [PULL, COMMIT] }),
    files: async () => (
      asked.files++,
      {
        ok: true,
        value: {
          files: [
            { path: 'requirements/reqs.gql', before: REQUIREMENTS, after: AFTER },
            { path: 'README.md', before: '# Notes\n', after: '# Notes\n\nNow reviewed.\n' },
          ],
          workstreams: JSON.stringify({ V1: { title: 'Review', requirements: ['changes_view', 'review_items'] } }),
          unread: 0,
        },
      }
    ),
  };
  return { asked, github };
}

const named = (doc, text) => Array.from(doc.querySelectorAll('button')).find((b) => b.textContent === text);
const texts = (nodes) => Array.from(nodes).map((n) => n.textContent);

describe('reviewing a change from GitHub in the browser editor', () => {
  // proves: github_review_items
  test('lists the changes only once asked, and shows the one picked in levels down to every line', async () => {
    const { asked, github } = stand();
    const images = [];
    const page = await livePage(NOTE, {
      github,
      before: (w) => (w.URL.createObjectURL = (blob) => (images.push(blob), `blob:${images.length}`)),
    });
    try {
      await page.ready();
      assert.deepEqual(asked, { items: 0, files: 0 });
      named(page.doc, 'Review a change from GitHub…').click();
      await until(() => !!page.doc.querySelector('#gn-review-pick'), 8000);
      assert.equal(page.doc.querySelector('label[for="gn-review-pick"]')?.textContent, 'Change to review');
      assert.deepEqual(texts(page.doc.querySelectorAll('#gn-review-pick option')), [
        'Pull request #7: Review items (roger)',
        'Commit aaaaaaa: Tidy (Ann)',
      ]);
      assert.equal(asked.files, 0);
      named(page.doc, 'Review').click();
      await until(() => !!page.doc.querySelector('.gn-review-result h2'), 8000);
      const result = page.doc.querySelector('.gn-review-result');
      assert.equal(result.querySelector('h2').textContent, 'Pull request #7: Review items (roger)');
      // level 1: by section, by workstream and requirement
      assert.deepEqual(texts(result.querySelectorAll('.gn-review-summary li')), [
        '41 · Every surface: 1 added, 1 changed',
        'V1 · Review: 1 added, 1 changed',
        'Changed: changes_view (Requirement)',
        'Added: review_items (Requirement)',
      ]);
      assert.match(result.querySelector('.gn-review-summary').textContent, /1 other file changed/);
      // level 2: each graph in the changes view, drawn and listed
      await until(() => !!result.querySelector('.gn-review-graphs img'), 8000);
      const img = result.querySelector('.gn-review-graphs img');
      assert.match(
        img.getAttribute('alt'),
        /^Graph reqs in requirements\/reqs\.gql, Pull request #7.*: 2 changes, added drawn heavy/,
      );
      assert.equal(img.getAttribute('aria-describedby'), 'gn-review-list-0');
      assert.match(await images.at(-1).text(), /stroke-width:3/);
      // level 3: every line, each marked by a sign, not by colour alone
      const lines = texts(result.querySelectorAll('.gn-review-lines li.is-add'));
      assert.ok(lines.includes('+ 3 Now reviewed.'), lines.join('|'));
      assert.ok(texts(result.querySelectorAll('.gn-review-lines li.is-remove')).every((l) => l.startsWith('− ')));
      // opened again, it is read from what was kept
      named(page.doc, 'Review').click();
      await until(() => asked.files === 1 && !!page.doc.querySelector('.gn-review-result h2'), 8000);
      assert.equal(asked.files, 1);
    } finally {
      await page.stop();
    }
  });

  // proves: github_review_items
  test('a repository that cannot be read says why, and offers nothing to pick', async () => {
    const { github } = stand('Reviewing pull requests here needs GitHub’s command line, gh.');
    const page = await livePage(NOTE, { github });
    try {
      await page.ready();
      named(page.doc, 'Review a change from GitHub…').click();
      await until(() => /command line, gh/.test(page.doc.querySelector('.gn-review-result')?.textContent ?? ''), 8000);
      assert.equal(page.doc.querySelector('#gn-review-pick'), null);
    } finally {
      await page.stop();
    }
  });
});
