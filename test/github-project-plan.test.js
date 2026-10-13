// The plan of the GitHub mirror: what must be done to make GitHub hold the desired issues and project, found by comparing
// the desired state with what GitHub holds now. Pure — it reads two values and gives a third, so no network is touched.
// Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import {
  buildPlan,
  formatPlan,
  planIssues,
  planLabels,
  planProject,
  summarise,
} from '../scripts/github-project-plan.mjs';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const board = readBoard(FIXTURE);
const desired = desiredState(board, WORKSTREAMS, [3, 4]);
const KNOWN = new Set(board.requirements.map((r) => r.id));

/** The issues GitHub would hold had the desired ones been made: numbered in order, closed where desired closed. */
const issuesHeld = () =>
  desired.issues.map((issue, i) => ({
    number: i + 1,
    url: `https://github.com/o/r/issues/${i + 1}`,
    title: issue.title,
    body: issue.body,
    state: issue.state === 'closed' ? 'CLOSED' : 'OPEN',
    labels: [...issue.labels],
  }));
const held = (id) => issuesHeld().find((i) => i.title.startsWith(`${id}:`));
const replaceIssue = (id, change) => issuesHeld().map((i) => (i.title.startsWith(`${id}:`) ? { ...i, ...change } : i));
const plan = (remote) => planIssues(desired.issues, remote, KNOWN);
const ids = (list) => list.map((x) => x.id ?? x).sort();

describe('the issue plan against an empty GitHub', () => {
  const p = plan([]);

  test('creates every desired issue and changes nothing else', () => {
    assert.equal(p.create.length, desired.issues.length);
    for (const key of ['update', 'close', 'reopen', 'removed', 'unchanged']) assert.deepEqual(p[key], [], key);
  });

  test('counts how many of those are made closed, being proved', () => {
    assert.equal(summarise(buildPlan(desired, { labelNames: [], issues: [], project: null })).createdClosed, 1);
  });
});

describe('the issue plan against a GitHub that holds the desired issues', () => {
  test('has nothing to do', () => {
    const p = plan(issuesHeld());
    assert.equal(p.create.length + p.update.length + p.close.length + p.reopen.length + p.removed.length, 0);
    assert.equal(p.unchanged.length, desired.issues.length);
  });

  test('ignores line-ending and trailing-space differences GitHub may add to a body', () => {
    const body = `${held('focus_link').body.replaceAll('\n', '\r\n')}  \n`;
    assert.equal(plan(replaceIssue('focus_link', { body })).update.length, 0);
  });

  test('ignores the order of the labels', () => {
    const labels = [...held('focus_link').labels].reverse();
    assert.equal(plan(replaceIssue('focus_link', { labels })).update.length, 0);
  });

  test('leaves alone an issue somebody wrote with no marker', () => {
    const p = plan([
      ...issuesHeld(),
      { number: 99, title: 'A question', body: 'hand written', state: 'OPEN', labels: [] },
    ]);
    assert.equal(p.removed.length, 0);
    assert.equal(p.update.length, 0);
  });
});

describe('the issue plan for an issue that drifted', () => {
  test('updates a title changed by hand, and only the title', () => {
    const [u] = plan(replaceIssue('focus_link', { title: 'my own title' })).update;
    assert.deepEqual([u.id, u.number, u.title, u.body], ['focus_link', held('focus_link').number, true, false]);
    assert.deepEqual([u.addLabels, u.removeLabels], [[], []]);
  });

  test('updates a body edited by hand', () => {
    const [u] = plan(replaceIssue('focus_link', { body: `${held('focus_link').body}\nan extra line` })).update;
    assert.deepEqual([u.id, u.title, u.body], ['focus_link', false, true]);
  });

  test('swaps a status label that is out of date, and leaves a label somebody added', () => {
    const labels = ['slice-4', 'workstream:W1', 'status:part', 'good first issue'];
    const [u] = plan(replaceIssue('focus_link', { labels })).update;
    assert.deepEqual([u.addLabels, u.removeLabels], [['status:open'], ['status:part']]);
  });

  test('adds a label that is missing', () => {
    const [u] = plan(replaceIssue('focus_link', { labels: ['slice-4', 'status:open'] })).update;
    assert.deepEqual([u.addLabels, u.removeLabels], [['workstream:W1'], []]);
  });

  test('closes an open issue whose requirement is now proved', () => {
    const p = plan(replaceIssue('zoom_out_to_fit', { state: 'OPEN' }));
    assert.deepEqual(p.close, [{ id: 'zoom_out_to_fit', number: held('zoom_out_to_fit').number }]);
    assert.equal(p.reopen.length, 0);
  });

  test('reopens a closed issue whose requirement is not proved', () => {
    const p = plan(replaceIssue('focus_link', { state: 'CLOSED' }));
    assert.deepEqual(p.reopen, [{ id: 'focus_link', number: held('focus_link').number }]);
    assert.equal(p.close.length, 0);
  });

  test('does both an update and a close for an issue that needs both', () => {
    const p = plan(replaceIssue('zoom_out_to_fit', { state: 'OPEN', title: 'x' }));
    assert.equal(p.update.length, 1);
    assert.equal(p.close.length, 1);
    assert.equal(p.unchanged.length, desired.issues.length - 1);
  });

  test('takes the lowest-numbered issue when two carry one marker, and says so', () => {
    const twin = { ...held('focus_link'), number: 50, title: 'twin' };
    const p = plan([...issuesHeld(), twin]);
    assert.equal(p.update.length, 0);
    assert.match(p.warnings.join('\n'), /focus_link.*#50/);
  });
});

describe('the issue plan for a requirement that went', () => {
  const gone = (extra = {}) => ({
    number: 70,
    title: 'old_one: Old rule',
    body: 'rule\n\n<!-- requirement:old_one -->\n',
    state: 'OPEN',
    labels: ['slice-3'],
    ...extra,
  });

  test('labels it requirement:removed, comments, and closes it, never deleting it', () => {
    const p = plan([...issuesHeld(), gone()]);
    assert.deepEqual(p.removed, [{ id: 'old_one', number: 70, label: true, comment: true, close: true }]);
    assert.equal(p.update.length, 0, 'its other labels and text are left as they were');
  });

  test('does nothing more once it is labelled and closed', () => {
    const done = gone({ state: 'CLOSED', labels: ['slice-3', 'requirement:removed'] });
    assert.deepEqual(plan([...issuesHeld(), done]).removed, []);
  });

  test('closes again, without a second comment, one that is labelled but open', () => {
    const open = gone({ labels: ['requirement:removed'] });
    assert.deepEqual(plan([...issuesHeld(), open]).removed, [
      { id: 'old_one', number: 70, label: false, comment: false, close: true },
    ]);
  });

  test('leaves alone an issue whose requirement is still in the file, in a slice not chosen', () => {
    const outside = gone({ title: 'old_thing: An old rule', body: '<!-- requirement:old_thing -->' });
    const p = plan([...issuesHeld(), outside]);
    assert.deepEqual(p.removed, []);
    assert.deepEqual(p.outside, ['old_thing']);
  });

  test('takes the label off an issue whose requirement came back, and reopens it unless proved', () => {
    const back = replaceIssue('focus_link', {
      state: 'CLOSED',
      labels: ['slice-4', 'status:open', 'workstream:W1', 'requirement:removed'],
    });
    const p = plan(back);
    assert.deepEqual(p.update[0].removeLabels, ['requirement:removed']);
    assert.equal(p.reopen.length, 1);
  });
});

describe('the label plan', () => {
  test('creates only the labels that are missing, once each, ignoring case', () => {
    assert.deepEqual(planLabels(['slice-3', 'status:open', 'status:open', 'workstream:W1'], ['Slice-3', 'bug']), [
      'status:open',
      'workstream:W1',
    ]);
  });

  test('is part of the whole plan: the desired issues’ labels, and the removed label when one is needed', () => {
    const remote = { labelNames: ['slice-3'], issues: [], project: null };
    assert.ok(buildPlan(desired, remote).labels.includes('workstream:W1'));
    assert.ok(!buildPlan(desired, remote).labels.includes('slice-3'));
    assert.ok(!buildPlan(desired, remote).labels.includes('requirement:removed'));
    const gone = { number: 70, title: 't', body: '<!-- requirement:old_one -->', state: 'OPEN', labels: [] };
    assert.ok(buildPlan(desired, { ...remote, issues: [gone] }).labels.includes('requirement:removed'));
  });
});

/** The project GitHub would hold had the desired one been made, each item set to its fields' options. */
const projectHeld = () => ({
  id: 'PVT_1',
  number: 7,
  fields: Object.fromEntries(
    Object.entries(desired.fields).map(([name, options]) => [
      name,
      { id: `F_${name}`, options: options.map((o) => ({ id: `O_${o}`, name: o })) },
    ]),
  ),
  items: desired.issues.map((i) => ({
    itemId: `I_${i.id}`,
    id: i.id,
    values: { Slice: i.slice, Workstream: i.workstream, Status: i.status },
  })),
});
const projectPlan = (project) => planProject(desired.issues, desired.fields, project);

describe('the project plan', () => {
  test('creates the project, its three fields with their options, and every item with its three values', () => {
    const p = projectPlan(null);
    assert.equal(p.create, true);
    assert.deepEqual(
      p.fields.map((f) => [f.name, f.create]),
      [
        ['Slice', true],
        ['Workstream', true],
        ['Status', true],
      ],
    );
    assert.deepEqual(p.fields[0].add, ['Slice 3', 'Slice 4']);
    assert.deepEqual(ids(p.itemsAdd), ids(desired.issues));
    assert.equal(p.sets.length, 3 * desired.issues.length);
    assert.deepEqual(
      p.sets.find((s) => s.id === 'focus_link' && s.field === 'Status'),
      {
        id: 'focus_link',
        field: 'Status',
        from: null,
        to: 'open',
      },
    );
  });

  test('has nothing to do for a project that holds all of it', () => {
    const p = projectPlan(projectHeld());
    assert.deepEqual([p.create, p.fields, p.itemsAdd, p.sets], [false, [], [], []]);
  });

  test('adds the options a field lacks, keeping the others, and creates a field that is missing', () => {
    const project = projectHeld();
    project.fields.Status.options = [
      { id: 'O_todo', name: 'Todo' },
      { id: 'O_open', name: 'open' },
    ];
    delete project.fields.Slice;
    const p = projectPlan(project);
    assert.deepEqual(
      p.fields.map((f) => [f.name, f.create, f.add]),
      [
        ['Slice', true, ['Slice 3', 'Slice 4']],
        ['Status', false, ['part', 'proved']],
      ],
    );
  });

  test('sets only the values that differ, saying what each was', () => {
    const project = projectHeld();
    project.items.find((i) => i.id === 'focus_link').values.Status = 'part';
    assert.deepEqual(projectPlan(project).sets, [{ id: 'focus_link', field: 'Status', from: 'part', to: 'open' }]);
  });

  test('adds an issue that is not yet an item, with its values', () => {
    const project = projectHeld();
    project.items = project.items.filter((i) => i.id !== 'focus_link');
    const p = projectPlan(project);
    assert.deepEqual(p.itemsAdd, ['focus_link']);
    assert.equal(p.sets.length, 3);
  });

  test('leaves alone an item that is no longer desired, never deleting', () => {
    const project = projectHeld();
    project.items.push({ itemId: 'I_old', id: 'old_one', values: {} });
    const p = projectPlan(project);
    assert.deepEqual([p.itemsAdd, p.sets], [[], []]);
  });
});

describe('the whole plan, printed', () => {
  const everything = buildPlan(desired, { labelNames: [], issues: [], project: null });

  test('counts what it would do', () => {
    assert.deepEqual(summarise(everything), {
      requirements: 5,
      labelsCreate: 8,
      create: 5,
      createdClosed: 1,
      update: 0,
      close: 0,
      reopen: 0,
      removed: 0,
      unchanged: 0,
      projectCreate: 1,
      fieldsCreate: 3,
      optionsAdd: 2 + 3 + 3,
      itemsAdd: 5,
      valuesSet: 15,
    });
  });

  test('prints a line for each change and the counts, in plain words', () => {
    const text = formatPlan(everything);
    assert.match(
      text,
      /create issue zoom_out_to_fit: Zoom out must fit the drawing \(closed; slice-3, status:proved, workstream:W0\)/,
    );
    assert.match(text, /create issue focus_link: Choosing a link must show it \(open;/);
    assert.match(text, /create label workstream:W1/);
    assert.match(text, /create project "graph-note requirements"/);
    assert.match(text, /create field Slice \(Slice 3, Slice 4\)/);
    assert.match(text, /add to project focus_link/);
    assert.match(text, /add to project focus_link \(Slice 4 · W1: Focus, hover and untangle · open\)/);
    assert.doesNotMatch(text, /\nset /, 'an item added is described once, with its values');
    assert.match(
      text,
      /issues: create 5 \(1 closed at once\) · update 0 · close 0 · reopen 0 · mark removed 0 · unchanged 0/,
    );
  });

  test('prints each kind of change for a GitHub that has drifted', () => {
    const project = projectHeld();
    project.items.find((i) => i.id === 'focus_link').values.Status = 'part';
    const remote = {
      labelNames: [],
      issues: [
        ...replaceIssue('focus_link', { title: 'mine' }),
        { number: 70, title: 'old', body: '<!-- requirement:old_one -->', state: 'OPEN', labels: [] },
      ],
      project,
    };
    const text = formatPlan(buildPlan(desired, remote));
    assert.match(text, /update issue #\d+ focus_link: title/);
    assert.match(text, /mark removed issue #70 old_one: label, comment, close/);
    assert.match(text, /set focus_link Status: part → open/);
  });

  test('is the same text each time', () => {
    assert.equal(formatPlan(everything), formatPlan(buildPlan(desired, { labelNames: [], issues: [], project: null })));
  });
});
