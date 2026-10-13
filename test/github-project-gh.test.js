// The thin layer between the GitHub mirror's plan and the gh command: reading what GitHub holds, and doing the plan with
// gh issue, gh label, gh project and gh api graphql. Every case runs against an in-memory stand-in for gh
// (test/repository/github-project-fake.js) handed in as the runner, so no network is touched. Editor spec §12,
// requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, idOfBody } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, ghRunner, readRemote, repoOwner } from '../scripts/github-project-gh.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const board = readBoard(FIXTURE);
const desiredFor = (slices = [3, 4]) => desiredState(board, WORKSTREAMS, slices);

/** One whole apply: read GitHub, plan, do the plan. Gives the plan it did. */
const apply = (gh, desired = desiredFor()) => {
  const plan = buildPlan(desired, readRemote(gh.run, 'rogerbucks'));
  executePlan(gh.run, 'rogerbucks', plan);
  return plan;
};
const issueOf = (gh, id) => gh.hub.issues.find((i) => idOfBody(i.body) === id);
const labelsOf = (issue) => issue.labels.map((l) => l.name).sort();
const quiet = (gh) => {
  gh.hub.mutations.length = 0;
};

describe('the first apply, against an empty GitHub', () => {
  const gh = fakeGithub();
  const plan = apply(gh);

  test('creates one issue for each desired requirement, with its title, body and labels', () => {
    assert.equal(gh.hub.issues.length, 5);
    const issue = issueOf(gh, 'focus_neighbours');
    const want = plan.desired.issues.find((i) => i.id === 'focus_neighbours');
    assert.equal(issue.title, want.title);
    assert.equal(issue.body, want.body);
    assert.deepEqual(labelsOf(issue), ['slice-3', 'status:part', 'workstream:W1']);
  });

  test('closes the issue of the proved requirement, and only that one', () => {
    assert.deepEqual(
      gh.hub.issues.filter((i) => i.state === 'CLOSED').map((i) => idOfBody(i.body)),
      ['zoom_out_to_fit'],
    );
  });

  test('creates the labels the issues carry, before the issues', () => {
    assert.deepEqual(gh.hub.labels.map((l) => l.name).sort(), [
      'slice-3',
      'slice-4',
      'status:open',
      'status:part',
      'status:proved',
      'workstream:S3',
      'workstream:W0',
      'workstream:W1',
    ]);
    const first = gh.hub.mutations.findIndex((m) => m.startsWith('issue create'));
    assert.ok(gh.hub.mutations.slice(0, first).every((m) => m.startsWith('label create')));
  });

  test('creates the project with its Slice, Workstream and Status fields, each a single choice', () => {
    const [project] = gh.hub.projects;
    assert.equal(project.title, 'graph-note requirements');
    const options = (name) => project.fields.find((f) => f.name === name).options.map((o) => o.name);
    assert.deepEqual(options('Slice'), ['Slice 3', 'Slice 4']);
    assert.deepEqual(options('Workstream'), ['W0: Zoom', 'W1: Focus, hover and untangle', 'S3: Slice end']);
    assert.deepEqual(options('Status'), ['Todo', 'In Progress', 'Done', 'open', 'part', 'proved']);
  });

  test('adds every issue to the project, with its three field values', () => {
    const [project] = gh.hub.projects;
    assert.equal(project.items.length, 5);
    const number = issueOf(gh, 'focus_neighbours').number;
    assert.deepEqual(project.items.find((i) => i.number === number).values, {
      Slice: 'Slice 3',
      Workstream: 'W1: Focus, hover and untangle',
      Status: 'part',
    });
  });

  test('never deletes anything', () => {
    assert.ok(gh.hub.calls.every((c) => !c.args.some((a) => /delete|remove/i.test(a))));
  });
});

describe('a second apply', () => {
  test('changes nothing at all: it reads GitHub and finds the plan empty', () => {
    const gh = fakeGithub();
    apply(gh);
    quiet(gh);
    const again = apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
    assert.equal(again.issues.unchanged.length, 5);
    assert.deepEqual([again.project.create, again.project.itemsAdd, again.project.sets], [false, [], []]);
  });

  test('pages through a project with more items than one page holds', () => {
    const gh = fakeGithub({ pageSize: 2 });
    apply(gh);
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });
});

describe('an apply after a requirement’s proof changed', () => {
  test('changes only what differs: the status label, the issue state and the project value', () => {
    const gh = fakeGithub();
    apply(gh);
    quiet(gh);
    // focus_neighbours is now proved; zoom_out_to_fit lost a test and is part again
    const [a, b] = [issueOf(gh, 'focus_neighbours'), issueOf(gh, 'zoom_out_to_fit')];
    const next = desiredFor();
    const swap = (id, status, state) => {
      const issue = next.issues.find((i) => i.id === id);
      issue.status = status;
      issue.state = state;
      issue.labels = issue.labels.map((l) => (l.startsWith('status:') ? `status:${status}` : l)).sort();
      issue.body = issue.body.replace(/\*\*Status:\*\* \w+/, `**Status:** ${status}`);
    };
    swap('focus_neighbours', 'proved', 'closed');
    swap('zoom_out_to_fit', 'part', 'open');
    apply(gh, next);
    assert.equal(a.state, 'CLOSED');
    assert.equal(b.state, 'OPEN');
    assert.ok(labelsOf(a).includes('status:proved') && !labelsOf(a).includes('status:part'));
    assert.deepEqual(
      gh.hub.mutations.map((m) => m.split(' ').slice(0, 2).join(' ')).sort(),
      ['issue close', 'issue edit', 'issue edit', 'issue reopen', 'project item-edit', 'project item-edit'].sort(),
    );
    const items = gh.hub.projects[0].items;
    assert.equal(items.find((i) => i.number === a.number).values.Status, 'proved');
    assert.equal(items.find((i) => i.number === b.number).values.Status, 'part');
  });

  test('puts back a title or body somebody edited by hand', () => {
    const gh = fakeGithub();
    apply(gh);
    const issue = issueOf(gh, 'focus_link');
    const { title, body } = issue;
    issue.title = 'my own title';
    issue.body = `${body}\nsomething I added`;
    quiet(gh);
    apply(gh);
    assert.deepEqual([issue.title, issue.body], [title, body]);
    assert.equal(gh.hub.mutations.length, 1, 'one edit, giving both');
  });
});

describe('an apply when the project’s options had to change', () => {
  test('adds the options and sets the values again, though replacing options gives them new ids', () => {
    const gh = fakeGithub();
    apply(gh);
    const status = gh.hub.projects[0].fields.find((f) => f.name === 'Status');
    status.options = status.options.filter((o) => o.name !== 'proved');
    for (const item of gh.hub.projects[0].items) if (item.values.Status === 'proved') delete item.values.Status;
    quiet(gh);
    apply(gh);
    assert.deepEqual(
      status.options.map((o) => o.name),
      ['Todo', 'In Progress', 'Done', 'open', 'part', 'proved'],
      'the options already there are kept, in order',
    );
    const statuses = gh.hub.projects[0].items.map((i) => i.values.Status).sort();
    assert.deepEqual(statuses, ['open', 'open', 'open', 'part', 'proved']);
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });
});

describe('an apply when a requirement went', () => {
  const marked = (id) => `an old rule\n\n<!-- requirement:${id} -->\n`;
  const withGone = () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.issues.push({
      number: 70,
      title: 'old_one: An old rule',
      body: marked('old_one'),
      state: 'OPEN',
      labels: [{ name: 'slice-3' }],
      url: 'https://github.com/o/r/issues/70',
    });
    return gh;
  };

  test('labels the issue requirement:removed, comments, and closes it; it is never deleted', () => {
    const gh = withGone();
    quiet(gh);
    apply(gh);
    const gone = gh.hub.issues.find((i) => i.number === 70);
    assert.equal(gone.state, 'CLOSED');
    assert.deepEqual(labelsOf(gone), ['requirement:removed', 'slice-3']);
    assert.equal(gone.comments.length, 1);
    assert.match(gone.comments[0], /old_one/);
    assert.match(gone.comments[0], /no longer in `requirements\/editor-requirements\.gql`/);
    assert.ok(gh.hub.labels.some((l) => l.name === 'requirement:removed'));
  });

  test('does it once: a second apply neither comments nor closes again', () => {
    const gh = withGone();
    apply(gh);
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
    assert.equal(gh.hub.issues.find((i) => i.number === 70).comments.length, 1);
  });

  test('leaves the issue of a requirement outside the chosen slices alone', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.issues.push({
      number: 71,
      title: 'old_thing: x',
      body: marked('old_thing'),
      state: 'OPEN',
      labels: [],
      url: 'https://github.com/o/r/issues/71',
    });
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });
});

describe('reading GitHub', () => {
  test('gives the label names, the issues with plain label names, and no project when there is none', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.projects.length = 0;
    const remote = readRemote(gh.run, 'rogerbucks');
    assert.ok(remote.labelNames.includes('slice-3'));
    assert.equal(remote.issues.length, 5);
    assert.deepEqual(remote.issues[0].labels, labelsOf(gh.hub.issues[0]).sort());
    assert.equal(remote.issues[0].url, 'https://github.com/o/r/issues/1');
    assert.equal(remote.project, null);
  });

  test('finds the project by its title and gives its fields, and its items by requirement id', () => {
    const gh = fakeGithub();
    apply(gh);
    const { project } = readRemote(gh.run, 'rogerbucks');
    assert.equal(project.number, 1);
    assert.deepEqual(Object.keys(project.fields).sort(), ['Slice', 'Status', 'Workstream']);
    assert.equal(project.items.length, 5);
    const item = project.items.find((i) => i.id === 'focus_link');
    assert.deepEqual(item.values, { Slice: 'Slice 4', Workstream: 'W1: Focus, hover and untangle', Status: 'open' });
  });

  test('ignores a project with another title', () => {
    const gh = fakeGithub();
    gh.run(['project', 'create', '--owner', 'rogerbucks', '--title', 'something else', '--format', 'json']);
    assert.equal(readRemote(gh.run, 'rogerbucks').project, null);
  });
});

describe('the gh runner', () => {
  const spawned = (result) => {
    const seen = [];
    const spawn = (command, args, options) => {
      seen.push({ command, args, options });
      return result;
    };
    return { seen, spawn };
  };

  test('runs gh with the arguments and the input given, and gives back its output', () => {
    const { seen, spawn } = spawned({ status: 0, stdout: 'out', stderr: '' });
    assert.equal(ghRunner(spawn)(['issue', 'list'], 'body'), 'out');
    assert.equal(seen[0].command, 'gh');
    assert.deepEqual(seen[0].args, ['issue', 'list']);
    assert.equal(seen[0].options.input, 'body');
    assert.equal(seen[0].options.encoding, 'utf8');
  });

  test('fails with gh’s own words when gh fails', () => {
    const { spawn } = spawned({ status: 1, stdout: '', stderr: 'HTTP 403: missing the project scope' });
    assert.throws(() => ghRunner(spawn)(['project', 'list']), /gh project list.*HTTP 403: missing the project scope/s);
  });

  test('says gh is missing when it cannot be started', () => {
    const { spawn } = spawned({ error: new Error('spawn gh ENOENT'), status: null });
    assert.throws(() => ghRunner(spawn)(['issue', 'list']), /ENOENT/);
  });

  test('stops at the first failing call: nothing after it is done', () => {
    const gh = fakeGithub();
    const plan = buildPlan(desiredFor(), readRemote(gh.run, 'rogerbucks'));
    let calls = 0;
    const failing = (args, input) => {
      calls += 1;
      if (calls === 3) throw new Error('boom');
      return gh.run(args, input);
    };
    assert.throws(() => executePlan(failing, 'rogerbucks', plan), /boom/);
    assert.equal(calls, 3);
  });
});

describe('the repository owner', () => {
  test('is the login gh view gives', () => {
    assert.equal(repoOwner(fakeGithub({ owner: 'someone' }).run), 'someone');
  });
});
