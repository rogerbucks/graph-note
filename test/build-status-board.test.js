// The Build status field of the project, read and written for the build status: each requirement’s item and issue, its
// current value, the value set by the id of its option, and every trouble that is the board’s own (no project, no field,
// no option). The issues are read with the workflow’s token and only the project with the project token. Every case runs
// against in-memory stand-ins for gh, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BoardProblem, readBuildBoard, setBuildStatus, setProgress } from '../scripts/build-status-board.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { fakeRepoSide, mirroredProject } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/thoughtknot';
const noSleep = () => {};

/** The mirrored project, and the repository whose issues it was made from. */
const both = () => {
  const gh = mirroredProject();
  const side = fakeRepoSide({ issues: () => gh.hub.issues });
  return { gh, side, board: () => readBuildBoard(side.run, gh.run, REPO, { sleep: noSleep }) };
};

describe('the Build status field of the project', () => {
  test('is read as each requirement’s item, its issue and its current value', () => {
    const { board } = both();
    const read = board();
    assert.deepEqual([...read.items.keys()].sort(), [
      'done_means_proved',
      'focus_link',
      'focus_neighbours',
      'stray_new',
      'zoom_out_to_fit',
    ]);
    const got = read.items.get('focus_link');
    assert.equal(got.current, 'Not started');
    assert.equal(typeof got.number, 'number');
    assert.match(got.url, /\/issues\/\d+$/);
    assert.equal(read.owner, 'rogerbucks');
    assert.equal(read.projectNumber, 1);
  });

  test('is read with the project token for the project alone: the issues are the workflow’s token’s to read', () => {
    const { gh, side } = both();
    const before = gh.hub.calls.length;
    readBuildBoard(side.run, gh.run, REPO, { sleep: noSleep });
    const asked = gh.hub.calls.slice(before).map((c) => c.args.slice(0, 2).join(' '));
    assert.ok(asked.length > 0);
    assert.ok(
      asked.every((a) => a === 'api graphql'),
      asked.join(' | '),
    );
    assert.ok(side.hub.calls.some((c) => c.args[0] === 'api' && /\/issues\?/.test(c.args[1])));
    assert.ok(side.hub.calls.every((c) => !c.args.includes('user')));
  });

  test('is read and set with a token gh cannot resolve the owner’s type for: no `gh project` verb that needs an owner is used', () => {
    const { gh, side } = both();
    const unknownOwnerType = (args, input) => {
      if (args[0] === 'project')
        throw Object.assign(new Error('gh project failed: unknown owner type'), { stderr: 'unknown owner type' });
      return gh.run(args, input);
    };
    const read = readBuildBoard(side.run, unknownOwnerType, REPO, { sleep: noSleep });
    assert.equal(read.items.size, 5);
    setBuildStatus(unknownOwnerType, read, 'focus_link', 'In PR', { sleep: noSleep });
    assert.equal(readBuildBoard(side.run, gh.run, REPO).items.get('focus_link').current, 'In PR');
  });

  test('asks for only the issues the owner wrote, so issues others write cannot reach the cap of the list', () => {
    const { gh, side, board } = both();
    for (let n = 0; n < 5; n += 1)
      gh.hub.issues.push({
        number: 900 + n,
        title: 'spam',
        body: '',
        state: 'OPEN',
        labels: [],
        author: { login: 'spammer' },
        url: 'u',
      });
    const read = board();
    const list = side.hub.calls.find((c) => c.args[0] === 'api' && /\/issues\?/.test(c.args[1]));
    assert.equal(new URLSearchParams(list.args[1].split('?')[1]).get('creator'), 'rogerbucks');
    assert.equal(read.items.size, 5);
    assert.ok(![...read.issues.values()].some((i) => i.number >= 900));
  });

  test('takes only the issues the owner wrote as the mirror’s, since only the owner’s login runs the mirror', () => {
    const { gh, board } = both();
    for (const issue of gh.hub.issues) issue.author = { login: 'someone-else' };
    assert.equal(board().items.size, 0);
  });

  test('is set by the id of its option, on the item, and nothing else is touched', () => {
    const { gh, board } = both();
    const read = board();
    setBuildStatus(gh.run, read, 'focus_link', 'Checks failing');
    assert.equal(read.items.get('focus_link').current, 'Checks failing');
    assert.equal(board().items.get('focus_link').current, 'Checks failing');
    assert.equal(board().items.get('focus_neighbours').current, 'Not started');
    assert.equal(gh.hub.mutations.length, 1);
    assert.match(gh.hub.mutations[0], /updateProjectV2ItemFieldValue/);
    const [project] = gh.hub.projects;
    const mine = project.items.find((i) => i.values['Build status'] === 'Checks failing');
    assert.equal(mine.values.Proof, 'open');
    // a requirement part proved (status:part) starts In Progress; the rest Todo
    assert.ok(project.items.every((i) => i.values.Status === (i.values.Proof === 'part' ? 'In Progress' : 'Todo')));
  });

  test('is a problem to report, not a crash, when the project or the field is not there yet', () => {
    const none = fakeGithub();
    const side = fakeRepoSide();
    assert.throws(
      () => readBuildBoard(side.run, none.run, REPO),
      (e) => e instanceof BoardProblem && /ThoughtKnot requirements/.test(e.message),
    );
    const { gh, board } = both();
    gh.hub.projects[0].fields = gh.hub.projects[0].fields.filter((f) => f.name !== 'Build status');
    assert.throws(board, (e) => e instanceof BoardProblem && /no Build status field/.test(e.message));
  });

  test('is a problem to report when the field lacks the stage to set', () => {
    const { gh, board } = both();
    const field = gh.hub.projects[0].fields.find((f) => f.name === 'Build status');
    field.options = field.options.filter((o) => o.name !== 'Released');
    const read = board();
    assert.throws(
      () => setBuildStatus(gh.run, read, 'focus_link', 'Released'),
      (e) => e instanceof BoardProblem && /Released/.test(e.message),
    );
  });

  test('has the built-in Status beside it, read as each item’s current Todo, In Progress or Done, Todo from the mirror', () => {
    const { board } = both();
    assert.equal(board().items.get('focus_link').progress, 'Todo');
  });

  test('has an item’s Status read as none where it has none', () => {
    const { gh, board } = both();
    for (const item of gh.hub.projects[0].items) delete item.values.Status;
    assert.equal(board().items.get('focus_link').progress, null);
  });

  test('has the built-in Status set by the id of its option, and the Build status left as it was', () => {
    const { gh, board } = both();
    const read = board();
    setProgress(gh.run, read, 'focus_link', 'In Progress');
    assert.equal(read.items.get('focus_link').progress, 'In Progress');
    const fresh = board().items.get('focus_link');
    assert.deepEqual([fresh.progress, fresh.current], ['In Progress', 'Not started']);
    assert.equal(gh.hub.mutations.length, 1);
  });

  test('is a problem to report when the project has no Status field, or lacks the option to set', () => {
    const { gh, board } = both();
    const [project] = gh.hub.projects;
    const status = project.fields.find((f) => f.name === 'Status');
    status.options = status.options.filter((o) => o.name !== 'Done');
    assert.throws(
      () => setProgress(gh.run, board(), 'focus_link', 'Done'),
      (e) => e instanceof BoardProblem && /no option Done/.test(e.message),
    );
    project.fields = project.fields.filter((f) => f.name !== 'Status');
    assert.throws(
      () => setProgress(gh.run, board(), 'focus_link', 'In Progress'),
      (e) => e instanceof BoardProblem && /no Status field/.test(e.message),
    );
  });

  test('is waited for through a short failure of GitHub, as the mirror does', () => {
    const { gh, board } = both();
    let failures = 1;
    const flaky = (args, input) => {
      if (/updateProjectV2ItemFieldValue/.test(String(input)) && failures-- > 0)
        throw new Error('gh failed: HTTP 502 Bad Gateway');
      return gh.run(args, input);
    };
    setBuildStatus(flaky, board(), 'focus_link', 'Merged', { sleep: noSleep });
    assert.equal(board().items.get('focus_link').current, 'Merged');
  });
});
