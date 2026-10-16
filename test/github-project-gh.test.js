// The thin layer between the GitHub mirror's plan and the gh command: reading what GitHub holds, and doing the plan with
// gh issue, gh label, gh project and gh api graphql. Every case runs against an in-memory stand-in for gh
// (test/repository/github-project-fake.js) handed in as the runner, so no network is touched. Editor spec §12,
// requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { BANNER_START, desiredState, idOfBody, markerOf } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, ghRunner, readRemote } from '../scripts/github-project-gh.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { path } from './repository/repo.js';
import {
  FIXTURE,
  FIXTURE_WITH_QUESTIONS,
  WORKSTREAMS,
  WORKSTREAMS_WITH_QUESTIONS,
} from './repository/github-project-fixture.js';

const board = readBoard(FIXTURE);
const desiredFor = (slices = [3, 4]) => desiredState(board, WORKSTREAMS, slices);
const REPO = 'rogerbucks/graph-note';
const noSleep = () => {};
const generated = (id) => `an old rule\n\n${BANNER_START} old.\n\n${markerOf(id)}\n`;

/** One whole apply: read GitHub, plan, do the plan. Gives the plan it did. */
const apply = (gh, desired = desiredFor()) => {
  const plan = buildPlan(desired, readRemote(gh.run, REPO));
  executePlan(gh.run, REPO, plan, { sleep: noSleep });
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

  test('creates the project with its Slice, Workstream and Proof fields, each a single choice', () => {
    const [project] = gh.hub.projects;
    assert.equal(project.title, 'graph-note requirements');
    const options = (name) => project.fields.find((f) => f.name === name).options.map((o) => o.name);
    assert.deepEqual(options('Slice'), ['Slice 3', 'Slice 4']);
    assert.deepEqual(options('Workstream'), ['W0: Zoom', 'W1: Focus, hover and untangle', 'S3: Slice end']);
    assert.deepEqual(options('Proof'), ['open', 'part', 'proved']);
  });

  test('leaves the built-in Status field as GitHub made it, its options kept, and gives each item the seed Todo', () => {
    const [project] = gh.hub.projects;
    const status = project.fields.find((f) => f.name === 'Status');
    assert.deepEqual(
      status.options.map((o) => o.name),
      ['Todo', 'In Progress', 'Done'],
    );
    // Todo is the seed, except for a requirement part proved (status:part), which starts In Progress
    const partNumber = issueOf(gh, 'focus_neighbours').number;
    for (const i of project.items) assert.equal(i.values.Status, i.number === partNumber ? 'In Progress' : 'Todo');
    assert.ok(gh.hub.mutations.every((m) => !/ProjectV2Field.* Status$/.test(m)));
  });

  test('adds every issue to the project, with its four field values', () => {
    const [project] = gh.hub.projects;
    assert.equal(project.items.length, 5);
    const number = issueOf(gh, 'focus_neighbours').number;
    assert.deepEqual(project.items.find((i) => i.number === number).values, {
      Slice: 'Slice 3',
      Workstream: 'W1: Focus, hover and untangle',
      Proof: 'part',
      'Build status': 'Not started',
      Status: 'In Progress',
    });
  });

  test('never deletes anything', () => {
    assert.ok(gh.hub.calls.every((c) => !c.args.some((a) => /delete|remove/i.test(a))));
  });
});

describe('the Build status field, applied', () => {
  const itemOf = (gh, id) => gh.hub.projects[0].items.find((i) => i.number === issueOf(gh, id).number);
  const eventValue = (gh, id, value) => {
    itemOf(gh, id).values['Build status'] = value;
  };
  const valueOf = (gh, id) => itemOf(gh, id).values['Build status'];

  test('is made with its six stages, and every item starts at Not started', () => {
    const gh = fakeGithub();
    apply(gh);
    const [project] = gh.hub.projects;
    assert.deepEqual(
      project.fields.find((f) => f.name === 'Build status').options.map((o) => o.name),
      ['Not started', 'In PR', 'Checks failing', 'Checks passing', 'Merged', 'Released'],
    );
    assert.ok(project.items.every((i) => i.values['Build status'] === 'Not started'));
  });

  test('keeps a value an event set, on a later apply that changes nothing else', () => {
    const gh = fakeGithub();
    apply(gh);
    eventValue(gh, 'focus_link', 'Checks failing');
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
    assert.equal(valueOf(gh, 'focus_link'), 'Checks failing');
  });

  test('is added to a project made before it existed, with the other values untouched, and sets nothing else', () => {
    const gh = fakeGithub();
    apply(gh);
    const [project] = gh.hub.projects;
    project.fields = project.fields.filter((f) => f.name !== 'Build status');
    for (const item of project.items) delete item.values['Build status'];
    quiet(gh);
    apply(gh);
    assert.ok(project.fields.some((f) => f.name === 'Build status'));
    assert.ok(project.items.every((i) => i.values['Build status'] === 'Not started'));
    assert.ok(gh.hub.mutations.every((m) => /createProjectV2Field Build status$|ProjectV2ItemFieldValue/.test(m)));
    assert.ok(project.items.every((i) => i.values.Proof && i.values.Slice && i.values.Workstream));
  });

  test('is never replaced when Workstream options change: the values events set stay', () => {
    const gh = fakeGithub();
    apply(gh);
    eventValue(gh, 'focus_link', 'Merged');
    const field = gh.hub.projects[0].fields.find((f) => f.name === 'Workstream');
    field.options = field.options.slice(0, 1);
    quiet(gh);
    apply(gh);
    assert.ok(gh.hub.mutations.some((m) => /updateProjectV2Field Workstream$/.test(m)));
    assert.ok(gh.hub.mutations.every((m) => !/ProjectV2Field.* Build status$/.test(m)));
    assert.equal(valueOf(gh, 'focus_link'), 'Merged');
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
  test('changes only what differs: the status label, the issue state and the project values, Proof and Closed on', () => {
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
    // Proof on each, Closed on set on the one closed and cleared on the one reopened
    const edits = Array(4).fill('api graphql');
    assert.deepEqual(
      gh.hub.mutations.map((m) => m.split(' ').slice(0, 2).join(' ')).sort(),
      ['issue close', 'issue edit', 'issue edit', 'issue reopen', ...edits].sort(),
    );
    const items = gh.hub.projects[0].items;
    assert.equal(items.find((i) => i.number === a.number).values.Proof, 'proved');
    assert.equal(items.find((i) => i.number === b.number).values.Proof, 'part');
    assert.equal(items.find((i) => i.number === a.number).values['Closed on'], '2026-10-15');
    assert.equal(items.find((i) => i.number === b.number).values['Closed on'], undefined);
  });

  test('puts back a title or body somebody edited by hand', () => {
    const gh = fakeGithub();
    apply(gh);
    const issue = issueOf(gh, 'focus_link');
    const { title, body } = issue;
    issue.title = 'my own title';
    issue.body = body.replace('Strength', 'Might');
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
    const field = gh.hub.projects[0].fields.find((f) => f.name === 'Workstream');
    field.options = field.options.filter((o) => o.name !== 'S3: Slice end');
    for (const item of gh.hub.projects[0].items)
      if (item.values.Workstream === 'S3: Slice end') delete item.values.Workstream;
    quiet(gh);
    apply(gh);
    assert.deepEqual(
      field.options.map((o) => o.name),
      ['W0: Zoom', 'W1: Focus, hover and untangle', 'S3: Slice end'],
      'the options already there are kept, in order',
    );
    const values = gh.hub.projects[0].items.map((i) => i.values.Workstream).sort();
    assert.deepEqual(values, [
      'S3: Slice end',
      'S3: Slice end',
      'W0: Zoom',
      'W1: Focus, hover and untangle',
      'W1: Focus, hover and untangle',
    ]);
    quiet(gh);
    apply(gh);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('does not touch the Proof field, and sets nothing on it again, when Workstream options changed', () => {
    const gh = fakeGithub();
    apply(gh);
    const field = gh.hub.projects[0].fields.find((f) => f.name === 'Workstream');
    field.options = field.options.filter((o) => o.name !== 'S3: Slice end');
    quiet(gh);
    apply(gh);
    assert.ok(gh.hub.mutations.every((m) => !/ProjectV2Field.* Proof$/.test(m)));
    assert.deepEqual(gh.hub.projects[0].items.map((i) => i.values.Proof).sort(), [
      'open',
      'open',
      'open',
      'part',
      'proved',
    ]);
  });
});

describe('an apply when a requirement went', () => {
  const withGone = () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.issues.push({
      number: 70,
      title: 'Viewing · old one',
      body: generated('old_one'),
      state: 'OPEN',
      labels: [{ name: 'slice-3' }],
      author: { login: 'rogerbucks' },
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
      title: 'Viewing · old thing',
      body: generated('old_thing'),
      state: 'OPEN',
      labels: [],
      author: { login: 'rogerbucks' },
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
    const remote = readRemote(gh.run, REPO);
    assert.ok(remote.labelNames.includes('slice-3'));
    assert.equal(remote.issues.length, 5);
    assert.deepEqual(remote.issues[0].labels, labelsOf(gh.hub.issues[0]).sort());
    assert.equal(remote.issues[0].url, 'https://github.com/o/r/issues/1');
    assert.equal(remote.project, null);
  });

  test('gives the signed-in login, the logins it adopts (the owner and the workflows’ bot), and each issue’s author', () => {
    const gh = fakeGithub();
    apply(gh);
    const remote = readRemote(gh.run, REPO);
    assert.equal(remote.login, 'rogerbucks');
    assert.deepEqual(remote.adopters, ['rogerbucks', 'github-actions[bot]']);
    assert.ok(remote.issues.every((i) => i.author === 'rogerbucks'));
  });

  test('asks for only the issues the owner and the workflows’ bot wrote, so issues others write cannot reach the cap of the list', () => {
    const gh = fakeGithub();
    apply(gh);
    gh.hub.issues.push({
      number: 900,
      title: 'spam',
      body: '',
      state: 'OPEN',
      labels: [],
      author: { login: 'spammer' },
      url: 'https://github.com/o/r/issues/900',
    });
    gh.hub.calls.length = 0;
    const remote = readRemote(gh.run, REPO);
    // through the REST list endpoint, by creator (test/github-project-adopt.test.js has the whole call)
    const lists = gh.hub.calls.filter((c) => c.args[0] === 'api' && /\/issues\?/.test(c.args[1]));
    const asked = lists.map((c) => new URLSearchParams(c.args[1].split('?')[1]).get('creator'));
    // then the newest issues of anyone, which has no creator, to catch an issue the lists by creator have not yet got
    assert.deepEqual(asked, ['rogerbucks', 'github-actions[bot]', null]);
    assert.ok(remote.issues.every((i) => i.author === 'rogerbucks'));
    assert.ok(!remote.issues.some((i) => i.number === 900));
  });

  test('finds the project by its title and gives its fields, and its items by requirement id', () => {
    const gh = fakeGithub();
    apply(gh);
    const { project } = readRemote(gh.run, REPO);
    assert.equal(project.number, 1);
    assert.deepEqual(Object.keys(project.fields).sort(), ['Build status', 'Proof', 'Slice', 'Status', 'Workstream']);
    assert.equal(project.items.length, 5);
    const item = project.items.find((i) => i.id === 'focus_link');
    assert.deepEqual(item.values, {
      Slice: 'Slice 4',
      Workstream: 'W1: Focus, hover and untangle',
      Proof: 'open',
      'Build status': 'Not started',
      Status: 'Todo',
    });
  });

  test('ignores a project with another title', () => {
    const gh = fakeGithub();
    gh.run(['project', 'create', '--owner', 'rogerbucks', '--title', 'something else', '--format', 'json']);
    assert.equal(readRemote(gh.run, REPO).project, null);
  });

  test('ignores the items of an issue it would not adopt, though the project holds them', () => {
    const gh = fakeGithub();
    apply(gh);
    issueOf(gh, 'focus_link').author = { login: 'stranger' };
    const { project } = readRemote(gh.run, REPO);
    assert.equal(
      project.items.some((i) => i.id === 'focus_link'),
      false,
    );
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

  test('runs gh in the repository’s own folder, with no repository or host named by the environment', () => {
    const before = { GH_REPO: process.env.GH_REPO, GH_HOST: process.env.GH_HOST };
    process.env.GH_REPO = 'someone/else';
    process.env.GH_HOST = 'github.example.com';
    try {
      const { seen, spawn } = spawned({ status: 0, stdout: '', stderr: '' });
      ghRunner(spawn)(['issue', 'list']);
      assert.equal(seen[0].options.cwd, path('.'));
      assert.equal('GH_REPO' in seen[0].options.env, false);
      assert.equal('GH_HOST' in seen[0].options.env, false);
      assert.equal(seen[0].options.env.PATH, process.env.PATH, 'the rest of the environment is kept');
    } finally {
      for (const [name, value] of Object.entries(before))
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
  });

  test('stops at the first failing call: nothing after it is done', () => {
    const gh = fakeGithub();
    const plan = buildPlan(desiredFor(), readRemote(gh.run, REPO));
    let calls = 0;
    const failing = (args, input) => {
      calls += 1;
      if (calls === 3) throw new Error('boom');
      return gh.run(args, input);
    };
    assert.throws(() => executePlan(failing, REPO, plan, { sleep: noSleep }), /boom/);
    assert.equal(calls, 3);
  });
});

describe('open questions, applied', () => {
  const asked = (slices = [3, 4]) =>
    desiredState(readBoard(FIXTURE_WITH_QUESTIONS), WORKSTREAMS_WITH_QUESTIONS, slices);

  test('are made as open issues with the question label, put in the project as open, and a second apply changes nothing', () => {
    const gh = fakeGithub();
    apply(gh, asked());
    const issue = issueOf(gh, 'q_01_ai_interface');
    assert.equal(issue.state, 'OPEN');
    assert.deepEqual(labelsOf(issue), ['kind:question', 'slice-3', 'workstream:Q']);
    const made = gh.hub.calls.find(
      (c) => c.args[0] === 'label' && c.args[1] === 'create' && c.args[2] === 'kind:question',
    );
    assert.equal(
      made.args[made.args.indexOf('--description') + 1],
      'An open question, generated from the requirements file',
    );
    const [project] = gh.hub.projects;
    assert.deepEqual(project.items.find((i) => i.number === issue.number).values, {
      Slice: 'Slice 3',
      Workstream: 'Q: Open questions',
      Proof: 'open',
      'Build status': 'Not started',
      Status: 'Todo',
    });
    quiet(gh);
    apply(gh, asked());
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('outside the chosen slices are left alone, and one that went is labelled removed and closed', () => {
    const gh = fakeGithub();
    apply(gh, asked());
    quiet(gh);
    apply(gh, asked([4]));
    assert.equal(issueOf(gh, 'q_01_ai_interface').state, 'OPEN', 'its question is only outside the chosen slices');
    const gone = desiredState(readBoard(FIXTURE), WORKSTREAMS_WITH_QUESTIONS, [3, 4]);
    apply(gh, gone);
    const removed = issueOf(gh, 'q_02_listed');
    assert.equal(removed.state, 'CLOSED');
    assert.ok(labelsOf(removed).includes('requirement:removed'));
  });
});
