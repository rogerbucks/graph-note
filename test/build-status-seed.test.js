// The values the mirror gives an item that has none, from where its requirement stands on GitHub: Released and Done for what
// is proved on main and in a published release, Merged and Done for what is proved on main only, In PR and In Progress for
// what an open pull request of this repository holds (by its copy's diff or its Requirements line), Not started and Todo for
// the rest. A draft release does not count. The built-in Status may have Todo replaced by In Progress or Done, since Todo is
// the board's default and no choice; any other value is never overwritten. Every case runs against in-memory stand-ins for gh,
// so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { seedOf } from '../scripts/build-status-seed.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { fakeRepoSide, pull } from './repository/build-status-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/graph-note';
const HEAD = 'a'.repeat(40);
const OTHER = 'e'.repeat(40);
const written = (id, file) =>
  `(${id}:Test {proves: 'a proof', file: '${file}', where: 'repo', status: 'written'}),\n// ── Links ──`;
const proving = (text, requirement, test) =>
  text.replace('// ── Links ──', `${written(test, `test/${test}.test.js`)}\n(${requirement})-[:PROVED_BY]->(${test}),`);
/** Main: zoom_out_to_fit and old_thing proved as in the fixture, and done_means_proved proved now. */
const MAIN = proving(FIXTURE, 'done_means_proved', 'test_dmp');
const noSleep = () => {};

/** GitHub as it stands: main, a published release v0.5.0 whose copy is the fixture, a draft release whose copy is main's, and two open pull requests. */
function scene() {
  const side = fakeRepoSide();
  const { hub } = side;
  hub.files.main = MAIN;
  hub.releases = [
    { tag_name: 'v0.5.0', draft: false, published_at: '2026-10-14T10:00:00Z' },
    { tag_name: 'v0.6.0', draft: true, published_at: null },
  ];
  hub.files['v0.5.0'] = FIXTURE;
  hub.files['v0.6.0'] = MAIN;
  // pull request 7 proves focus_link in its copy; pull request 8, a draft, names stray_new on its line
  hub.pulls[7] = pull(7, { head: HEAD });
  hub.files[HEAD] = proving(MAIN, 'focus_link', 'test_link');
  hub.pulls[8] = pull(8, { head: OTHER, draft: true, body: 'Requirements: stray_new' });
  hub.files[OTHER] = MAIN;
  return side;
}
const board = readBoard(MAIN);
const seeded = (side) => seedOf(side.run, REPO, { write: () => {} });

describe('what is proved on main', () => {
  test('is read from main through the API, not from a copy in the checkout the mirror is run from', () => {
    const side = scene();
    side.hub.files.main = FIXTURE;
    side.hub.files[HEAD] = proving(FIXTURE, 'focus_link', 'test_link');
    side.hub.files[OTHER] = FIXTURE;
    const { seed } = seeded(side);
    assert.equal(seed.has('done_means_proved'), false, 'a local copy proving it, which main does not, seeds nothing');
    assert.equal(seed.get('zoom_out_to_fit').buildStatus, 'Released');
    const reads = side.hub.calls.filter((c) => c.args.includes('-H') && c.args.includes('ref=main'));
    assert.ok(reads.length >= 1);
  });

  test('is a warning, and nothing taken to be proved, when main’s file cannot be read', () => {
    const side = scene();
    side.hub.files.main = 'this is not a graph (((';
    const { seed, warnings } = seeded(side);
    assert.equal(seed.has('zoom_out_to_fit'), false);
    assert.match(warnings.join('\n'), /main.*could not be read/);
  });
});

describe('the seed of an item with no value', () => {
  test('is Released and Done when it is proved on main and in a published release whose copy proves it', () => {
    const { seed } = seeded(scene());
    assert.deepEqual(seed.get('zoom_out_to_fit'), { buildStatus: 'Released', progress: 'Done' });
  });

  test('is Merged and Done when it is proved on main and in no published release', () => {
    const { seed } = seeded(scene());
    assert.deepEqual(seed.get('done_means_proved'), { buildStatus: 'Merged', progress: 'Done' });
  });

  test('is In PR and In Progress when an open pull request of this repository holds it, by its copy’s diff', () => {
    const { seed } = seeded(scene());
    assert.deepEqual(seed.get('focus_link'), { buildStatus: 'In PR', progress: 'In Progress' });
  });

  test('is In PR and In Progress when an open pull request holds it by its Requirements line, as a draft does', () => {
    const { seed } = seeded(scene());
    assert.deepEqual(seed.get('stray_new'), { buildStatus: 'In PR', progress: 'In Progress' });
  });

  test('is none, so Not started and Todo, otherwise', () => {
    const { seed } = seeded(scene());
    assert.equal(seed.has('focus_neighbours'), false);
  });

  test('does not count a draft release, whose copy would prove the item, so it is Merged and not Released', () => {
    const side = scene();
    const { seed } = seeded(side);
    assert.equal(seed.get('done_means_proved').buildStatus, 'Merged');
    const read = side.hub.calls.filter((c) => c.args.includes('ref=v0.6.0'));
    assert.deepEqual(read, [], 'the draft release’s tag was not even read');
  });

  test('does not count a published release whose copy does not prove the item', () => {
    const side = scene();
    side.hub.files['v0.5.0'] = 'this is not a graph (((';
    const { seed, warnings } = seeded(side);
    assert.equal(seed.get('zoom_out_to_fit').buildStatus, 'Merged', 'a release that cannot be read releases nothing');
    assert.match(warnings.join('\n'), /v0\.5\.0.*could not be read/);
  });

  test('is taken from the newest published release that proves it, older ones being read only while some are still unreleased', () => {
    const side = scene();
    side.hub.releases.push({ tag_name: 'v0.4.0', draft: false, published_at: '2026-09-01T10:00:00Z' });
    side.hub.files['v0.4.0'] = MAIN;
    const { seed } = seeded(side);
    assert.equal(seed.get('done_means_proved').buildStatus, 'Released', 'an older published release proves it');
  });

  test('stays Merged, not In PR, when an open pull request also names an item already proved on main', () => {
    const side = scene();
    side.hub.pulls[8].body = 'Requirements: done_means_proved, stray_new';
    const { seed } = seeded(side);
    assert.equal(seed.get('done_means_proved').buildStatus, 'Merged');
  });

  test('is not held by a pull request from a fork, nor by a closed one', () => {
    const side = scene();
    side.hub.pulls[7].head.repo.full_name = 'someone/graph-note';
    side.hub.pulls[8].state = 'closed';
    const { seed } = seeded(side);
    assert.equal(seed.has('focus_link'), false);
    assert.equal(seed.has('stray_new'), false);
  });

  test('is not held by an open pull request whose copy cannot be read, which holds nothing it can be shown to', () => {
    const side = scene();
    side.hub.files[HEAD] = 'this is not a graph (((';
    const { seed } = seeded(side);
    assert.equal(seed.has('focus_link'), false);
  });

  test('never names an id the board does not hold', () => {
    const side = scene();
    side.hub.pulls[8].body = 'Requirements: stray_new, not_in_main';
    const { seed } = seeded(side);
    assert.equal(seed.has('not_in_main'), false);
  });
});

describe('the mirror with the seed', () => {
  /** One runner for the repository's API calls and the project, as `gh` is one command. */
  // the repository's files and pull requests from `side`; the issues, listed through the same API, and the project from `gh`
  const together = (gh, side) => (args, input) =>
    args[0] === 'api' && String(args[1]).startsWith('repos/') && !/\/issues\?/.test(args[1])
      ? side.run(args, input)
      : gh.run(args, input);
  const desired = () => desiredState(board, WORKSTREAMS, [3, 4]);
  const mirrorWith = (mode, gh, side, { acceptWarnings = false } = {}) => {
    const out = [];
    mirror(
      {
        desired: desired(),
        mode,
        allowRemovals: false,
        acceptWarnings,
        seed: (run, repo) => seedOf(run, repo, { write: (t) => out.push(t) }),
      },
      { run: together(gh, side), originRepo: REPO, write: (t) => out.push(t), sleep: noSleep },
    );
    return out.join('');
  };
  const valueOf = (gh, id, field) => {
    const [project] = gh.hub.projects;
    const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
    return project.items.find((i) => i.number === issue.number).values[field];
  };

  test('--check tallies the values it would seed for each option, and changes nothing', () => {
    const gh = fakeGithub();
    const out = mirrorWith('check', gh, scene());
    assert.match(out, /^seeded Build status: Not started 1 · In PR 2 · Merged 1 · Released 1$/m);
    assert.match(out, /^seeded Status: In Progress 3 · Done 2$/m);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('--apply gives each item the value of its case', () => {
    const gh = fakeGithub();
    mirrorWith('apply', gh, scene());
    const got = (id) => [valueOf(gh, id, 'Build status'), valueOf(gh, id, 'Status')];
    assert.deepEqual(got('zoom_out_to_fit'), ['Released', 'Done']);
    assert.deepEqual(got('done_means_proved'), ['Merged', 'Done']);
    assert.deepEqual(got('focus_link'), ['In PR', 'In Progress']);
    assert.deepEqual(got('stray_new'), ['In PR', 'In Progress']);
    assert.deepEqual(got('focus_neighbours'), ['Not started', 'In Progress']); // part proved, so under way
  });

  test('--apply on a board with values already replaces Todo, and no other value of Status, and no Build status', () => {
    const gh = fakeGithub();
    const side = scene();
    mirrorWith('apply', gh, side);
    const set = (id, field, value) => {
      const [project] = gh.hub.projects;
      const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
      const item = project.items.find((i) => i.number === issue.number);
      if (value === null) delete item.values[field];
      else item.values[field] = value;
    };
    set('focus_link', 'Status', 'Todo');
    set('stray_new', 'Status', 'Todo');
    set('done_means_proved', 'Status', 'In Progress');
    set('zoom_out_to_fit', 'Status', 'Done');
    set('focus_neighbours', 'Build status', 'Merged');
    set('zoom_out_to_fit', 'Build status', null);
    mirrorWith('apply', gh, side);
    assert.equal(valueOf(gh, 'focus_link', 'Status'), 'In Progress', 'Todo is the board’s default: replaced');
    assert.equal(valueOf(gh, 'stray_new', 'Status'), 'In Progress');
    assert.equal(valueOf(gh, 'done_means_proved', 'Status'), 'In Progress', 'In Progress is a choice: kept');
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Status'), 'Done');
    assert.equal(valueOf(gh, 'focus_neighbours', 'Build status'), 'Merged', 'a value already set is never overwritten');
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Build status'), 'Released', 'one with no value is seeded');
  });

  test('--apply a second time changes nothing', () => {
    const gh = fakeGithub();
    const side = scene();
    mirrorWith('apply', gh, side);
    gh.hub.mutations.length = 0;
    mirrorWith('apply', gh, side);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('seeds from main on GitHub, not from the requirements file of the checkout it is run from', () => {
    const gh = fakeGithub();
    const side = scene();
    side.hub.files.main = FIXTURE;
    side.hub.files[HEAD] = proving(FIXTURE, 'focus_link', 'test_link');
    side.hub.files[OTHER] = FIXTURE;
    mirrorWith('apply', gh, side);
    assert.deepEqual(
      [valueOf(gh, 'done_means_proved', 'Build status'), valueOf(gh, 'done_means_proved', 'Status')],
      ['Not started', 'Todo'],
    );
  });

  describe('when the seed carries a warning, as when a release’s file cannot be read', () => {
    const unreadableRelease = () => {
      const side = scene();
      side.hub.files['v0.5.0'] = 'this is not a graph (((';
      return side;
    };

    test('--check says an apply would stop, and names --accept-warnings, and changes nothing', () => {
      const gh = fakeGithub();
      const out = mirrorWith('check', gh, unreadableRelease());
      assert.match(
        out,
        /^warning: an apply would stop: the seed was made despite 1 warning .*--accept-warnings if that is meant$/m,
      );
      assert.deepEqual(gh.hub.mutations, []);
    });

    test('--apply refuses, changing nothing, unless --accept-warnings is given', () => {
      const gh = fakeGithub();
      assert.throws(() => mirrorWith('apply', gh, unreadableRelease()), /1 warning.*--accept-warnings/s);
      assert.deepEqual(gh.hub.mutations, []);
      assert.equal(gh.hub.projects.length, 0);
    });

    test('--apply goes on with --accept-warnings, with the values the seed could be sure of', () => {
      const gh = fakeGithub();
      mirrorWith('apply', gh, unreadableRelease(), { acceptWarnings: true });
      assert.equal(
        valueOf(gh, 'zoom_out_to_fit', 'Build status'),
        'Merged',
        'a release it could not read releases nothing',
      );
      assert.equal(valueOf(gh, 'focus_link', 'Build status'), 'In PR');
    });

    test('and a seed with none is not stopped, --accept-warnings or not', () => {
      const gh = fakeGithub();
      const out = mirrorWith('check', gh, scene());
      assert.doesNotMatch(out, /an apply would stop/);
      mirrorWith('apply', gh, scene());
      assert.equal(gh.hub.projects.length, 1);
    });
  });

  test('never moves an item back from Released or Done, whatever GitHub now says', () => {
    const gh = fakeGithub();
    const side = scene();
    mirrorWith('apply', gh, side);
    side.hub.releases = [];
    side.hub.pulls[7].state = 'closed';
    mirrorWith('apply', gh, side);
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Build status'), 'Released');
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Status'), 'Done');
    assert.equal(valueOf(gh, 'focus_link', 'Build status'), 'In PR');
  });
});
