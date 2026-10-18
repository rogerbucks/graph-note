// Pull requests, merges and commits as items to review (editor spec §41, github_review_items). They are listed as
// items, each opening in the changes view. They are reviewed in levels, from a summary by section, workstream and
// requirement down to each thing, link and line. Nothing is read from the source until the user asks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_LEVELS,
  ReviewItems,
  asNote,
  groupSaid,
  reviewLevels,
  workstreamsFrom,
} from '../src/github-review-items.ts';

const REQUIREMENTS = `// graph: reqs · SOURCE
(section_3:Section {num: '3', title: 'Viewing'}),
(section_41:Section {num: '41', title: 'Every surface'}),
(drawn:Requirement {section: '3', rule: 'Every block is drawn.'}),
(changes_view:Requirement {section: '41', rule: 'Changes are drawn.'}),
(test_drawn:Test {proves: 'drawn', status: 'written'}),
(drawn)-[:PROVED_BY]->(test_drawn)`;

const AFTER = REQUIREMENTS.replace("rule: 'Changes are drawn.'", "rule: 'Changes are drawn and listed.'").replace(
  '(drawn)-[:PROVED_BY]->(test_drawn)',
  "(review_items:Requirement {section: '41', rule: 'Items are listed.'}),\n(drawn)-[:PROVED_BY]->(test_drawn)",
);

const WORKSTREAMS = JSON.stringify({
  V1: { title: 'Changes view and pull request review', requirements: ['changes_view', 'review_items'] },
  W0: { title: 'Viewing', requirements: ['drawn'] },
  bad: { title: 3 },
});

const FILES = [
  { path: 'requirements/reqs.gql', before: REQUIREMENTS, after: AFTER },
  { path: 'README.md', before: '# Graph note\n', after: '# Graph note\n\nNow with changes.\n' },
];

const PULL = { kind: 'pull', id: '519', title: 'Add the changes view' };

/** A source that counts what it is asked. */
function counting(files = FILES) {
  const asked = { items: 0, files: 0 };
  return {
    asked,
    source: {
      items: async () => (asked.items++, [PULL, { kind: 'commit', id: 'a'.repeat(40), title: 'Fix' }]),
      files: async () => (asked.files++, files),
    },
  };
}

describe('the review items', () => {
  // proves: github_review_items
  test('read nothing until asked, then list pull requests, merges and commits once', async () => {
    const { asked, source } = counting();
    const items = new ReviewItems(source);
    assert.deepEqual(asked, { items: 0, files: 0 });
    const listed = await items.list();
    assert.deepEqual(
      listed.map((i) => i.kind),
      ['pull', 'commit'],
    );
    await items.list();
    assert.deepEqual(asked, { items: 1, files: 0 });
    await items.review(PULL);
    await items.review(PULL);
    assert.deepEqual(asked, { items: 1, files: 1 });
  });

  // proves: github_review_items
  test('a read that fails is not kept: asked again, it reads again', async () => {
    let calls = 0;
    const items = new ReviewItems({
      items: async () => {
        if (++calls === 1) throw new Error('offline');
        return [PULL];
      },
      files: async () => [],
    });
    await assert.rejects(items.list(), /offline/);
    assert.equal((await items.list()).length, 1);
  });

  // proves: github_review_items
  test('open in the changes view: each changed graph with its things and links marked', async () => {
    const levels = await new ReviewItems(counting().source).review(PULL);
    assert.deepEqual(REVIEW_LEVELS, ['summary', 'graphs', 'lines']);
    assert.deepEqual(
      levels.graphs.map((g) => [g.path, g.graph]),
      [['requirements/reqs.gql', 'reqs']],
    );
    const { shown } = levels.graphs[0];
    assert.equal(shown.marks.boxes.get('review_items')?.kind, 'add');
    assert.equal(shown.marks.boxes.get('changes_view')?.kind, 'change');
    assert.deepEqual(shown.changes.find((c) => c.id === 'thing:changes_view').details, [
      'rule: Changes are drawn. → Changes are drawn and listed.',
    ]);
  });

  // proves: github_review_items
  test('summarise at the top level by section, workstream and requirement', () => {
    const { summary } = reviewLevels(FILES, workstreamsFrom(WORKSTREAMS));
    assert.deepEqual(summary.sections.map(groupSaid), ['41 · Every surface: 1 added, 1 changed']);
    assert.deepEqual(summary.workstreams.map(groupSaid), [
      'V1 · Changes view and pull request review: 1 added, 1 changed',
    ]);
    assert.deepEqual(
      summary.requirements.map((r) => [r.key, r.mark]),
      [
        ['changes_view', 'change'],
        ['review_items', 'add'],
      ],
    );
    assert.equal(summary.otherFiles, 1);
  });

  // proves: github_review_items
  test('show every line at the lowest level, of every file, with its numbers', () => {
    const { lines } = reviewLevels(FILES);
    const readme = lines.find((f) => f.path === 'README.md').lines;
    assert.deepEqual(readme, [
      { kind: 'keep', text: '# Graph note', old: 1, new: 1 },
      { kind: 'add', text: '', new: 2 },
      { kind: 'add', text: 'Now with changes.', new: 3 },
    ]);
    const reqs = lines.find((f) => f.path === 'requirements/reqs.gql').lines;
    assert.deepEqual(
      reqs.filter((l) => l.kind !== 'keep').map((l) => l.kind),
      ['remove', 'add', 'add'],
    );
  });

  // proves: github_review_items
  test('a file added or deleted is all added or all removed, at every level', () => {
    const added = reviewLevels([{ path: 'new.gql', before: null, after: REQUIREMENTS }]);
    assert.ok(added.graphs[0].shown.changes.every((c) => c.mark === 'add'));
    assert.ok(added.lines[0].lines.every((l) => l.kind === 'add'));
    const gone = reviewLevels([{ path: 'old.gql', before: REQUIREMENTS, after: null }]);
    assert.ok(gone.graphs[0].shown.changes.every((c) => c.mark === 'remove'));
    assert.deepEqual(gone.summary.sections.map(groupSaid), ['3 · Viewing: 1 removed', '41 · Every surface: 1 removed']);
  });
});

describe('reading the repository’s files', () => {
  // proves: github_review_items
  test('a graph file is read as the one block it is, and a broken workstreams file gives no groups', () => {
    assert.equal(asNote('a.gql', '// graph: g\n(x:Thing)\n'), '```gql\n// graph: g\n(x:Thing)\n```\n');
    assert.equal(asNote('a.md', '# A\n'), '# A\n');
    assert.equal(workstreamsFrom('{').size, 0);
    assert.deepEqual([...workstreamsFrom(WORKSTREAMS).keys()], ['V1', 'W0']);
  });
});
