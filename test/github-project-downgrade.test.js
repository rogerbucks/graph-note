// The GitHub mirror when a requirement's proof goes down (proved to part, or to open). Also, when GitHub is slow to
// list the issues the bot has just made. The two met in run 38891890822:
// - A new issue was made, and the creator list had not caught up.
// - The creating stopped.
// - The downgrade of cc_editor_opens (reopen, relabel, Status) was never done, because the issues were edited after the
//   creating.
// Every case runs against the in-memory stand-in for gh (test/repository/github-project-
// fake.js), so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, idOfBody } from '../scripts/github-project-desired.mjs';
import { buildPlan, planProject } from '../scripts/github-project-plan.mjs';
import { executePlan, readAdoptable, readRemote } from '../scripts/github-project-gh.mjs';
import { GAPS_ALLOWED, createGuard, readsWhole } from '../scripts/github-project-issues.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/thoughtknot';
const BOT = 'github-actions[bot]';
const board = readBoard(FIXTURE);
const desiredFor = () => desiredState(board, WORKSTREAMS, [3, 4]);
const apply = (gh, desired = desiredFor(), run = gh.run, creator = undefined) => {
  const plan = buildPlan(desired, readRemote(run, REPO, { creator }));
  executePlan(run, REPO, plan, { sleep: () => {} });
  return plan;
};
const issueOf = (gh, id) => gh.hub.issues.find((i) => idOfBody(i.body) === id);
const itemOf = (gh, id) => gh.hub.projects[0].items.find((i) => i.number === issueOf(gh, id).number);
const valueOf = (gh, id, field) => itemOf(gh, id).values[field];
const labelsOf = (gh, id) => issueOf(gh, id).labels.map((l) => l.name);
/** The desired state with one requirement at `status`, as the copy would say, its issue and project values to match. */
const standing = (desired, id, status) => ({
  ...desired,
  issues: desired.issues.map((i) =>
    i.id !== id
      ? i
      : {
          ...i,
          status,
          state: status === 'proved' ? 'closed' : 'open',
          progress: status === 'part' ? 'In Progress' : status === 'open' ? 'Todo' : 'Done',
          labels: i.labels.map((l) => (l.startsWith('status:') ? `status:${status}` : l)).sort(),
        },
  ),
});
/** A world where zoom_out_to_fit was proved and closed, and the board's own workflow set its Status to Done. */
const provedWorld = () => {
  const gh = fakeGithub();
  apply(gh);
  itemOf(gh, 'zoom_out_to_fit').values.Status = 'Done';
  gh.hub.mutations.length = 0;
  return gh;
};

describe('a requirement whose proof goes down', () => {
  for (const [status, label, progress] of [
    ['part', 'status:part', 'In Progress'],
    ['open', 'status:open', 'Todo'],
  ]) {
    test(`proved to ${status}: the issue is reopened, relabelled ${label}, and the project follows`, () => {
      const gh = provedWorld();
      assert.equal(issueOf(gh, 'zoom_out_to_fit').state, 'CLOSED');
      apply(gh, standing(desiredFor(), 'zoom_out_to_fit', status));
      assert.equal(issueOf(gh, 'zoom_out_to_fit').state, 'OPEN');
      assert.ok(labelsOf(gh, 'zoom_out_to_fit').includes(label));
      assert.ok(!labelsOf(gh, 'zoom_out_to_fit').includes('status:proved'));
      assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Proof'), status);
      assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Status'), progress, 'no longer Done');
      assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Closed on'), undefined);
    });
  }

  test('a second apply after the downgrade changes nothing', () => {
    const gh = provedWorld();
    const down = standing(desiredFor(), 'zoom_out_to_fit', 'part');
    apply(gh, down);
    gh.hub.mutations.length = 0;
    apply(gh, down);
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('the project plan resets Done on an item whose requirement is not proved, whatever its Proof reads', () => {
    const issue = { ...desiredFor().issues[0], status: 'part', progress: 'In Progress' };
    const held = (proof) => ({
      fields: { Status: { id: 'F', options: ['Todo', 'In Progress', 'Done'].map((name) => ({ id: name, name })) } },
      items: [{ itemId: 'I', id: issue.id, values: { Proof: proof, Status: 'Done' } }],
    });
    const fieldsOf = desiredFor().fields;
    const statusSets = (proof) => planProject([issue], fieldsOf, held(proof)).sets.filter((s) => s.field === 'Status');
    assert.deepEqual(statusSets('proved'), [{ id: issue.id, field: 'Status', from: 'Done', to: 'In Progress' }]);
    assert.deepEqual(statusSets('part'), [{ id: issue.id, field: 'Status', from: 'Done', to: 'In Progress' }]);
    assert.deepEqual(statusSets(undefined), [{ id: issue.id, field: 'Status', from: 'Done', to: 'In Progress' }]);
    const proved = { ...issue, status: 'proved', progress: 'Done' };
    assert.deepEqual(
      planProject([proved], fieldsOf, held('proved')).sets.filter((s) => s.field === 'Status'),
      [],
      'a proved requirement stays Done',
    );
  });

  test('an item already stuck at Done with its Proof corrected is put right by the next apply', () => {
    const gh = provedWorld();
    const down = standing(desiredFor(), 'zoom_out_to_fit', 'part');
    apply(gh, down);
    itemOf(gh, 'zoom_out_to_fit').values.Status = 'Done';
    apply(gh, down);
    assert.equal(valueOf(gh, 'zoom_out_to_fit', 'Status'), 'In Progress');
  });

  test('is done even when the creating of a new issue is cut short: the edits come before the creates', () => {
    const gh = provedWorld();
    const down = standing(desiredFor(), 'zoom_out_to_fit', 'part');
    // one more requirement than GitHub holds: its issue is to be made
    gh.hub.issues.splice(
      gh.hub.issues.findIndex((i) => idOfBody(i.body) === 'focus_link'),
      1,
    );
    const calls = [];
    const run = (args, input) => {
      calls.push(args.slice(0, 2).join(' '));
      return gh.run(args, input);
    };
    apply(gh, down, run);
    assert.ok(calls.indexOf('issue reopen') < calls.indexOf('issue create'), 'reopen before create');
    assert.equal(issueOf(gh, 'zoom_out_to_fit').state, 'OPEN');
  });
});

describe('issues the bot makes that GitHub is slow to list', () => {
  /** gh as the workflow sees it, where the lists by creator miss an issue for `lag` calls after it is made. */
  const slow = (gh, lag) => {
    let missing = 0;
    return (args, input) => {
      if (args[0] === 'issue' && args[1] === 'create') missing = lag;
      const byCreator = args[0] === 'api' && /issues\?.*creator=/.test(String(args[1]));
      if (byCreator && missing > 0) {
        missing -= 1;
        return JSON.stringify([[]]);
      }
      return gh.run(args, input);
    };
  };
  const botWorld = () => fakeGithub({ login: 'app/github-actions' });

  test('the first one made is looked for again until the list gives it back, and the creating goes on', () => {
    const gh = botWorld();
    const plan = apply(gh, desiredFor(), slow(gh, 2), BOT);
    assert.equal(plan.issues.create.length, 5);
    assert.equal(gh.hub.issues.length, 5);
  });

  test('a creator list that never gives them back does not stop the creating: the newest issues show them', () => {
    const gh = botWorld();
    gh.hub.unlistedCreators = [BOT];
    apply(gh, desiredFor(), gh.run, BOT);
    assert.equal(gh.hub.issues.length, 5);
    gh.hub.mutations.length = 0;
    const again = apply(gh, desiredFor(), gh.run, BOT);
    assert.equal(again.issues.create.length, 0, 'no duplicate, push after push');
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('the issues to adopt are the creator lists and the newest issues of the adopters, once each', () => {
    const gh = botWorld();
    apply(gh, desiredFor(), gh.run, BOT);
    gh.hub.unlistedCreators = [BOT, 'rogerbucks'];
    const found = readAdoptable(gh.run, REPO, ['rogerbucks', BOT]);
    assert.deepEqual(
      found.map((i) => i.number),
      gh.hub.issues.map((i) => i.number),
    );
  });

  test('older mirror issues past the first hundred newest are still adopted: the newest are paged through', () => {
    const gh = botWorld();
    gh.hub.unlistedCreators = [BOT];
    for (let n = 1; n <= 150; n += 1)
      gh.hub.issues.push({
        number: n,
        title: `t${n}`,
        body: '',
        state: 'OPEN',
        labels: [],
        author: { login: 'app/github-actions' },
        url: `https://github.com/${REPO}/issues/${n}`,
      });
    const found = readAdoptable(gh.run, REPO, ['rogerbucks', BOT]);
    assert.equal(found.length, 150);
  });

  test('a creator list that misses an issue the newest read finds is a warning, so a broken filter stays visible', () => {
    const gh = botWorld();
    apply(gh, desiredFor(), gh.run, BOT);
    gh.hub.unlistedCreators = [BOT];
    const remote = readRemote(gh.run, REPO, { creator: BOT });
    assert.match(remote.warnings.join('\n'), /creator list.*missed.*issue/i);
    assert.match(buildPlan(desiredFor(), remote).warnings.join('\n'), /creator list.*missed/i);
    gh.hub.unlistedCreators = [];
    assert.deepEqual(readRemote(gh.run, REPO, { creator: BOT }).warnings, []);
  });

  test('creating stops, with the old words, when no list gives the first issue back however long it waits', () => {
    const plan = { creator: BOT, adopters: ['rogerbucks', BOT], issues: { create: [] } };
    const waits = [];
    const nothing = (args) => JSON.stringify(args.includes('--slurp') ? [[]] : []);
    const guard = createGuard(nothing, REPO, plan, { sleep: (ms) => waits.push(ms), delays: [1, 2] });
    assert.throws(
      () => guard.after(7),
      /bot-created issues aren’t listed by creator=github-actions\[bot\]; creating stopped to avoid duplicates/,
    );
    assert.deepEqual(waits, [1, 2]);
  });

  test('creating stops when the issues list comes back short, so the old issues are never made again', () => {
    const plan = { creator: BOT, adopters: ['rogerbucks', BOT], issues: { create: [{ id: 'mini_map' }] } };
    const user = { login: 'rogerbucks' };
    const page = (from, to) =>
      Array.from({ length: from - to + 1 }, (_, k) => ({
        number: from - k,
        title: 't',
        body: '',
        state: 'open',
        user,
      }));
    const short = () => JSON.stringify([page(100, 61)]);
    assert.throws(
      () => createGuard(short, REPO, plan).before(),
      /issues list came back short \(40 of #1 to #100\); creating stopped to avoid duplicates/,
    );
    const gaps = () => JSON.stringify([page(100, 31), page(25, 1)]);
    assert.doesNotThrow(() => createGuard(gaps, REPO, plan).before());
  });

  test('a read is whole when it lacks at most a few numbers from #1 to the newest, for deleted or moved issues', () => {
    const upTo = (n) => Array.from({ length: n }, (_, k) => k + 1);
    assert.equal(readsWhole([]), true);
    assert.equal(readsWhole(upTo(100)), true);
    assert.equal(readsWhole(upTo(100).slice(GAPS_ALLOWED)), true);
    assert.equal(readsWhole(upTo(100).slice(GAPS_ALLOWED + 1)), false);
  });
});
