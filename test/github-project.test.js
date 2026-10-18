// The GitHub mirror of the requirements, as a person runs it: the real requirements copy and the real workstreams file,
// and the command line — dry run by default, with no network call. Applying is proved against a stand-in for gh in
// github-project-gh.test.js; nothing here applies anything. Editor spec §12, requirements_checked_in_ci.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import {
  BANNER_START,
  assignWorkstreams,
  desiredState,
  markerOf,
  readWorkstreams,
} from '../scripts/github-project-desired.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';
import { read, path, readJSON } from './repository/repo.js';

const board = readBoard(read(REQUIREMENTS));
const workstreams = readWorkstreams(read('requirements/workstreams.json'));
const inSlices = (slices) => board.requirements.filter((r) => slices.includes(r.slice));

const emptyPath = mkdtempSync(join(tmpdir(), 'github-project-sync-'));
after(() => rmSync(emptyPath, { recursive: true, force: true }));
/** Runs the command with no gh on the path, so a call to gh could not work, and with any token removed. */
const command = (...args) =>
  spawnSync(process.execPath, [path('scripts/github-project.mjs'), ...args], {
    encoding: 'utf8',
    env: { PATH: emptyPath, HOME: emptyPath },
  });

describe('the workstreams file', () => {
  test('names the workstreams W0 to W15, the slice-end workstream S3, the graph mesh workstreams W16 to W33, the WCAG workstream W34, the test-files workstream W35, the moving-boxes workstream W36, the roadmap workstreams A1, R1, R2, L1, H1, H2, V1 and D1, the design-review workstreams G1, T1, P1 and U1, the open-questions workstream Q, the whiteboard workstreams B1 to B4, the Copilot Cowork workstream M1, the text-to-graph workstream X1 and the home page workstream D2, with the titles agreed', () => {
    assert.deepEqual(Object.keys(workstreams), [
      ...Array.from({ length: 16 }, (_, n) => `W${n}`),
      ...Array.from({ length: 9 }, (_, n) => `C${n}`),
      'S3',
      ...Array.from({ length: 21 }, (_, n) => `W${n + 16}`),
      'A1',
      'R1',
      'R2',
      'L1',
      'H1',
      'H2',
      'V1',
      'D1',
      'G1',
      'T1',
      'P1',
      'U1',
      'Q',
      'B1',
      'B2',
      'B3',
      'B4',
      'M1',
      'X1',
      'D2',
      'D3',
    ]);
    assert.deepEqual(
      Object.values(workstreams).map((w) => w.title),
      [
        'Slice switch and zoom',
        'Focus, hover and untangle',
        'Details navigation and sheet',
        'Folding, routing and the View menu',
        'Arrows and inline properties',
        'Diagram types',
        'Data export',
        'Links, attachments and rich details',
        'Proposals',
        'AI',
        'Sources, steps and views across notes',
        'Link flow and path play',
        'Animated images',
        'Notes reader parity',
        'Notes in the editor',
        'Viewer aids',
        'Editor server and its security',
        'Editor note store',
        'Editor in the Claude Code mod',
        'Classification in the core and the Claude ceiling',
        'Shared display layer',
        'Browser host shell',
        'Editor export',
        'Proposals from Claude',
        'Editor accessibility and motion',
        'Slice end',
        'Type and instance',
        'Certainty and contested links',
        'Time and provenance',
        'Mesh join',
        'Clusters and centroids',
        'Altitude and audience profiles',
        'Lenses as graph data',
        'Process core and views',
        'Runs, tests and debugger',
        'Trust in the drawing and the theme graph',
        'AI query contract and write scoring',
        'Export gaps and secrets',
        'Permissions',
        'Personal profiles',
        'Encrypted local store and CRDT transport',
        'Peer-to-peer network fabric',
        'iOS app',
        'Web layer and corporate boundary',
        'WCAG 2.2 AA for every interface',
        'Tests make their own files',
        'Moving boxes',
        'Automated quality checks',
        'Library release on GitHub',
        'Obsidian community release',
        'Host and storage contracts',
        'Standalone app',
        'VS Code plugin',
        'Changes view and pull request review',
        'Project wiki and user guide',
        'Language, culture and direction',
        'Layer and contract tests, and tests picked by imports',
        'Plug-in interface',
        'Theming and the standard interface needs',
        'Open questions',
        'Whiteboard: the board',
        'Whiteboard: board and graph',
        'Whiteboard: brainstorming',
        'Whiteboard: working together',
        'Copilot Cowork skill',
        'Text to graph with AI',
        'Project home page',
        'Developer site',
      ],
    );
  });

  test('is a plain JSON map, so a person or a model can edit it', () => {
    for (const [id, w] of Object.entries(readJSON('requirements/workstreams.json')))
      assert.deepEqual(Object.keys(w), ['title', 'requirements'], id);
  });

  test('puts every requirement of slices 3 and 4 in exactly one workstream', () => {
    const listed = Object.values(workstreams).flatMap((w) => w.requirements);
    assert.equal(new Set(listed).size, listed.length, 'no requirement is listed twice');
    const placed = assignWorkstreams(inSlices([3, 4]), workstreams);
    assert.equal(placed.size, inSlices([3, 4]).length);
    for (const r of inSlices([3, 4])) assert.ok(Object.hasOwn(workstreams, placed.get(r.id)), r.id);
  });

  test('may name a requirement the current copy does not hold: it is waiting for a later copy', () => {
    const held = new Set(board.requirements.map((r) => r.id));
    const waiting = Object.values(workstreams)
      .flatMap((w) => w.requirements)
      .filter((id) => !held.has(id));
    for (const id of waiting) assert.equal(assignWorkstreams(board.requirements, workstreams).has(id), false, id);
    assert.doesNotThrow(() => desiredState(board, workstreams, [3, 4]));
  });

  test('keeps the slice-end requirement in S3 and puts a requirement nobody listed there too', () => {
    const placed = assignWorkstreams(board.requirements, workstreams);
    assert.equal(placed.get('done_means_proved'), 'S3');
    const unlisted = board.requirements.filter(
      (r) => !Object.values(workstreams).some((w) => w.requirements.includes(r.id)),
    );
    for (const r of unlisted) assert.equal(placed.get(r.id), 'S3', r.id);
  });
});

describe('the desired issues for the real requirements', () => {
  const { issues } = desiredState(board, workstreams, [3, 4]);

  test('are one for each requirement of slices 3 and 4, with a distinct title and marker', () => {
    assert.equal(issues.length, inSlices([3, 4]).length);
    assert.equal(new Set(issues.map((i) => i.title)).size, issues.length);
  });

  test('have titles of at most 100 characters that say what the requirement is called', () => {
    for (const i of issues) {
      assert.ok(i.title.length <= 100, i.title);
      assert.ok(i.title.includes(i.id.replaceAll('_', ' ')), `${i.title} lacks the words of ${i.id}`);
    }
  });

  test('begin with the title of the requirement’s section, as the old first-clause titles did not', () => {
    for (const i of issues) {
      const r = board.requirements.find((x) => x.id === i.id);
      const section = board.sections.find((s) => s.num === r.section).title;
      assert.ok(i.title.startsWith(section.slice(0, 20)), i.title);
    }
  });

  test('open on the whole rule', () => {
    for (const i of issues) {
      const r = board.requirements.find((x) => x.id === i.id);
      assert.equal(i.body.split('\n')[0].replaceAll('`', ''), r.rule.replace(/\s+/g, ' ').replaceAll('`', ''), i.id);
    }
  });

  test('are closed exactly when the requirement is proved, by the status the slice board uses', () => {
    for (const issue of issues) {
      const r = board.requirements.find((x) => x.id === issue.id);
      assert.equal(issue.status, r.status, issue.id);
      assert.equal(issue.state, r.status === 'proved' ? 'closed' : 'open', issue.id);
    }
  });
});

describe('the command', () => {
  test('is a dry run by default: it prints the plan, says no network call was made, and exits 0', () => {
    const result = command();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run/i);
    assert.match(result.stdout, /no network call/i);
    assert.match(result.stdout, new RegExp(`issues: create ${inSlices([3, 4]).length} `));
    assert.match(result.stdout, /create project "graph-note requirements"/);
    assert.equal(result.stderr, '');
  });

  test('says --dry-run the same as saying nothing', () => {
    assert.equal(command('--dry-run').stdout, command().stdout);
  });

  test('plans the slices asked for with --slices', () => {
    const result = command('--slices', '4');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`issues: create ${inSlices([4]).length} `));
    assert.doesNotMatch(result.stdout, /slice-3/);
    assert.equal(command('--slices', '3,4').stdout, command().stdout);
  });

  test('prints the requirement counts of the slices, by status', () => {
    const { stdout } = command();
    const counts = { proved: 0, part: 0, open: 0 };
    for (const r of inSlices([3, 4])) counts[r.status] += 1;
    assert.match(
      stdout,
      new RegExp(
        `requirements: ${inSlices([3, 4]).length} in slices 3, 4 · ${counts.proved} proved · ${counts.part} part · ${counts.open} open`,
      ),
    );
  });

  test('refuses two of --apply, --check and --dry-run together', () => {
    for (const [a, b] of [
      ['--apply', '--dry-run'],
      ['--apply', '--check'],
      ['--check', '--dry-run'],
    ]) {
      const result = command(a, b);
      assert.equal(result.status, 1, `${a} ${b}`);
      assert.match(result.stderr, new RegExp(`github-project: .*${a}.*${b}|github-project: .*${b}.*${a}`));
    }
  });

  test('refuses an unknown option, a missing value and slices that are not whole numbers', () => {
    for (const args of [['--force'], ['--slices'], ['--slices', 'x'], ['--slices', '0'], ['--slices', '3,,4']]) {
      const result = command(...args);
      assert.equal(result.status, 1, args.join(' '));
      assert.match(result.stderr, /^github-project: /, args.join(' '));
      assert.equal(result.stdout, '');
    }
  });

  test('with --apply or --check and no git or gh to run, stops saying so and changes nothing', () => {
    for (const mode of ['--apply', '--check']) {
      const result = command(mode);
      assert.equal(result.status, 1, mode);
      assert.match(result.stderr, /github-project: .*(git|gh)/, mode);
    }
  });

  test('takes --allow-removals only to go with --apply', () => {
    assert.equal(command('--allow-removals').status, 1);
    assert.match(command('--allow-removals').stderr, /--allow-removals.*--apply/);
  });

  test('takes --accept-warnings only to go with --apply', () => {
    for (const mode of [[], ['--check'], ['--dry-run']]) {
      const result = command('--accept-warnings', ...mode);
      assert.equal(result.status, 1, mode.join(' '));
      assert.match(result.stderr, /--accept-warnings.*--apply/);
    }
  });
});

describe('the mirror, read-only with --check and changing with --apply, against a stand-in for gh', () => {
  const real = readBoard(FIXTURE);
  const desired = desiredState(real, WORKSTREAMS, [3, 4]);
  const ORIGIN = 'rogerbucks/graph-note';
  const run = (gh, mode, over = {}, desiredState_ = desired) => {
    const out = [];
    const sleeps = [];
    mirror(
      { desired: desiredState_, mode, allowRemovals: false, ...over },
      { run: gh.run, originRepo: ORIGIN, write: (t) => out.push(t), sleep: (ms) => sleeps.push(ms) },
    );
    return { text: out.join(''), sleeps };
  };
  const generated = (id) => `old\n\n${BANNER_START} old.\n\n${markerOf(id)}\n`;
  const vanished = (gh, n) =>
    gh.hub.issues.push(
      ...Array.from({ length: n }, (_, i) => ({
        number: 200 + i,
        title: 't',
        body: generated(`old_${i}`),
        state: 'OPEN',
        labels: [],
        author: { login: 'rogerbucks' },
        url: `https://github.com/o/r/issues/${200 + i}`,
      })),
    );

  test('--check reads GitHub and prints the real diff, changing nothing', () => {
    const gh = fakeGithub();
    const { text, sleeps } = run(gh, 'check');
    assert.deepEqual(gh.hub.mutations, []);
    assert.deepEqual(sleeps, []);
    assert.match(text, /github-project: check/);
    assert.match(text, /read-only/);
    assert.match(text, /rogerbucks\/graph-note/);
    assert.match(text, /issues: create 5 /);
  });

  test('--check of a GitHub that is in step says there is nothing to do', () => {
    const gh = fakeGithub();
    run(gh, 'apply');
    const { text } = run(gh, 'check');
    assert.match(
      text,
      /issues: create 0 \(0 closed at once\) · update 0 · close 0 · reopen 0 · mark removed 0 · unchanged 5/,
    );
    assert.match(text, /project: create 0 · fields create 0 · options add 0 · items add 0 · values set 0/);
  });

  test('--apply prints the target repository, then the same plan --check prints, and then does it', () => {
    const checked = run(fakeGithub(), 'check').text;
    const gh = fakeGithub();
    const { text } = run(gh, 'apply');
    const plan = (t) => t.slice(t.indexOf('labels: create'));
    assert.match(text, /github-project: apply/);
    assert.match(text, /target repository: rogerbucks\/graph-note/);
    assert.equal(plan(text).split('\ngithub-project: applied')[0] + '\n', plan(checked));
    assert.equal(gh.hub.issues.length, 5);
    assert.match(text, /github-project: applied\n$/);
  });

  test('refuses when gh points at another repository than the origin, having asked nothing else', () => {
    for (const mode of ['check', 'apply']) {
      const gh = fakeGithub({ name: 'other' });
      assert.throws(() => run(gh, mode), /gh points at rogerbucks\/other.*origin is rogerbucks\/graph-note/s);
      assert.equal(gh.hub.calls.length, 1, mode);
    }
  });

  test('--apply stops, changing nothing, when the plan removes more than 10 issues', () => {
    const gh = fakeGithub();
    run(gh, 'apply');
    vanished(gh, 11);
    gh.hub.mutations.length = 0;
    assert.throws(() => run(gh, 'apply'), /11 issues.*--allow-removals/s);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('--apply goes on with --allow-removals, labelling and closing them all and deleting none', () => {
    const gh = fakeGithub();
    run(gh, 'apply');
    vanished(gh, 11);
    run(gh, 'apply', { allowRemovals: true });
    const gone = gh.hub.issues.filter((i) => i.number >= 200);
    assert.ok(gone.every((i) => i.state === 'CLOSED' && i.labels.some((l) => l.name === 'requirement:removed')));
    assert.equal(gh.hub.issues.length, 5 + 11);
  });

  test('--apply stops for a board with no requirements, which would remove every issue', () => {
    const gh = fakeGithub();
    run(gh, 'apply');
    const empty = desiredState({ sections: [], requirements: [] }, WORKSTREAMS, [3, 4]);
    gh.hub.mutations.length = 0;
    assert.throws(() => run(gh, 'apply', {}, empty), /no requirements.*--allow-removals/s);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('--check shows that the guard would stop an apply, and does not itself stop', () => {
    const gh = fakeGithub();
    run(gh, 'apply');
    vanished(gh, 11);
    assert.match(run(gh, 'check').text, /warning: an apply would stop: .*--allow-removals/);
  });
});
