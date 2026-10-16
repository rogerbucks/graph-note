// Whose issues the GitHub mirror and the build status take for their own: those the repository's owner wrote, and those
// the workflows' bot wrote, as the mirror running on main makes them; nobody else's, whatever the issue says. Every case
// runs against the in-memory stand-ins for gh, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import {
  BANNER_START,
  BOT_LOGIN,
  adoptedId,
  desiredState,
  idOfBody,
  markerOf,
} from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { authorOf, executePlan, readRemote } from '../scripts/github-project-gh.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { readBuildBoard } from '../scripts/build-status-board.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { fakeRepoSide } from './repository/build-status-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/graph-note';
const BOT = 'app/github-actions';
const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
/** One apply as the workflow does it: the bot makes the issues, and nobody asks GitHub who is signed in. */
const applyAsBot = (gh) => {
  const plan = buildPlan(desired, readRemote(gh.run, REPO, { creator: BOT_LOGIN }));
  executePlan(gh.run, REPO, plan, { sleep: () => {} });
  return plan;
};
const generated = (id) => `a rule\n\n${BANNER_START} old.\n\n${markerOf(id)}\n`;
const planted = (gh, number, login, id) =>
  gh.hub.issues.push({
    number,
    title: 't',
    body: generated(id),
    state: 'OPEN',
    labels: [],
    author: { login, ...(login.startsWith('app/') ? { is_bot: true } : {}) },
    url: `https://github.com/o/r/issues/${number}`,
    closedAt: null,
  });

describe('the logins the mirror adopts', () => {
  test('are the owner and the workflows’ bot, whose login gh gives as app/github-actions', () => {
    assert.equal(BOT_LOGIN, 'github-actions[bot]');
    assert.equal(authorOf({ login: 'app/github-actions', is_bot: true }), 'github-actions[bot]');
    assert.equal(authorOf({ login: 'github-actions[bot]' }), 'github-actions[bot]');
    assert.equal(authorOf({ login: 'rogerbucks', is_bot: false }), 'rogerbucks');
    assert.equal(authorOf(null), undefined);
  });

  test('a body the mirror made is adopted from either, and from nobody else', () => {
    const issue = (author) => ({ author, body: generated('focus_link') });
    const adopters = ['rogerbucks', BOT_LOGIN];
    assert.equal(adoptedId(issue('rogerbucks'), adopters), 'focus_link');
    assert.equal(adoptedId(issue(BOT_LOGIN), adopters), 'focus_link');
    assert.equal(adoptedId(issue('stranger'), adopters), null);
    assert.equal(adoptedId(issue('github-actions'), adopters), null, 'a user named like the bot is not the bot');
  });
});

describe('issues the workflows’ bot made', () => {
  test('are adopted by the next run: the bot’s first apply makes them, and its second changes nothing', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    assert.equal(gh.hub.issues.length, 5);
    assert.ok(gh.hub.issues.every((i) => i.author.login === BOT));
    gh.hub.mutations.length = 0;
    const again = applyAsBot(gh);
    assert.deepEqual(gh.hub.mutations, []);
    assert.equal(again.issues.unchanged.length, 5);
  });

  test('are adopted when the owner applies after the bot, and the owner’s own when the bot applies after the owner', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    gh.hub.login = 'rogerbucks';
    gh.hub.mutations.length = 0;
    executePlan(gh.run, REPO, buildPlan(desired, readRemote(gh.run, REPO)), { sleep: () => {} });
    assert.deepEqual(gh.hub.mutations, []);
    const mixed = fakeGithub();
    executePlan(mixed.run, REPO, buildPlan(desired, readRemote(mixed.run, REPO)), { sleep: () => {} });
    mixed.hub.login = BOT;
    mixed.hub.mutations.length = 0;
    applyAsBot(mixed);
    assert.deepEqual(mixed.hub.mutations, []);
  });

  test('never asks GitHub who is signed in, which the workflow’s token may not', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    assert.ok(!gh.hub.calls.some((c) => c.args[0] === 'api' && c.args[1] === 'user'));
  });

  test('are taken up again, never made twice, when a create timed out after GitHub made the issue', () => {
    const gh = fakeGithub({ login: BOT });
    const TIMEOUT = 'Post "https://api.github.com/graphql": i/o timeout';
    let failed = false;
    const run = (args, input) => {
      if (args[0] === 'issue' && args[1] === 'create' && !failed) {
        failed = true;
        gh.run(args, input);
        throw Object.assign(new Error(`gh issue create failed: ${TIMEOUT}`), { stderr: TIMEOUT });
      }
      return gh.run(args, input);
    };
    executePlan(run, REPO, buildPlan(desired, readRemote(run, REPO, { creator: BOT_LOGIN })), { sleep: () => {} });
    assert.equal(gh.hub.issues.length, 5);
  });
});

describe('reading the issues', () => {
  const lists = (calls) => calls.filter((c) => c.args[0] === 'api' && /\/issues\?/.test(c.args[1])).map((c) => c.args);

  test('is through the REST list endpoint by creator, paged through, for the owner and the bot; never the search', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    gh.hub.calls.length = 0;
    readRemote(gh.run, REPO, { creator: BOT_LOGIN });
    assert.deepEqual(lists(gh.hub.calls), [
      ['api', `repos/${REPO}/issues?state=all&creator=rogerbucks&per_page=100`, '--paginate', '--slurp'],
      ['api', `repos/${REPO}/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100`, '--paginate', '--slurp'],
      // the newest issues too, in case the lists by creator are a moment behind an issue just made
      ['api', `repos/${REPO}/issues?state=all&sort=created&direction=desc&per_page=100`, '--paginate', '--slurp'],
    ]);
    assert.ok(!gh.hub.calls.some((c) => c.args[0] === 'issue' && c.args[1] === 'list'), 'gh issue list may search');
  });

  test('gives each issue as before: its state upper case, its labels’ names, its author, url and closedAt; a pull request is left out', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    gh.hub.pullsInIssues = [{ number: 50, title: 'a pull request', user: { login: 'rogerbucks' } }];
    const remote = readRemote(gh.run, REPO, { creator: BOT_LOGIN });
    assert.ok(!remote.issues.some((i) => i.number === 50));
    const closed = remote.issues.find((i) => i.state === 'CLOSED');
    assert.equal(closed.author, BOT_LOGIN);
    assert.equal(closed.closedAt, gh.hub.now);
    assert.ok(closed.labels.includes('status:proved'));
    assert.match(closed.url, /^https:\/\/github\.com\//);
  });

  test('is the same for the build status board', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    const side = fakeRepoSide({ issues: () => gh.hub.issues });
    readBuildBoard(side.run, gh.run, REPO, { sleep: () => {} });
    assert.deepEqual(
      lists(side.hub.calls).map((args) => args[1]),
      [
        `repos/${REPO}/issues?state=all&creator=rogerbucks&per_page=100`,
        `repos/${REPO}/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100`,
        `repos/${REPO}/issues?state=all&sort=created&direction=desc&per_page=100`,
      ],
    );
  });
});

describe('a stranger’s issue', () => {
  test('is never adopted, though it carries the generated banner and a marker: the mirror makes its own', () => {
    const gh = fakeGithub({ login: BOT });
    planted(gh, 1, 'stranger', 'focus_link');
    applyAsBot(gh);
    const mine = gh.hub.issues.filter((i) => idOfBody(i.body) === 'focus_link');
    assert.deepEqual(mine.map((i) => i.author.login).sort(), [BOT, 'stranger']);
    assert.equal(gh.hub.issues.find((i) => i.number === 1).state, 'OPEN', 'the stranger’s is left as it is');
  });

  test('is warned of when it is read some other way and carries a marker', () => {
    const plan = buildPlan(desired, {
      login: BOT_LOGIN,
      adopters: ['rogerbucks', BOT_LOGIN],
      labelNames: [],
      issues: [{ number: 1, title: 't', body: generated('focus_link'), state: 'OPEN', labels: [], author: 'stranger' }],
      project: null,
    });
    assert.ok(plan.warnings.some((w) => /#1 .*focus_link.*not written by rogerbucks or github-actions\[bot\]/.test(w)));
  });

  test('is not even read: only the owner’s and the bot’s issues are asked for', () => {
    const gh = fakeGithub({ login: BOT });
    planted(gh, 1, 'stranger', 'focus_link');
    const remote = readRemote(gh.run, REPO, { creator: BOT_LOGIN });
    assert.ok(!remote.issues.some((i) => i.number === 1));
  });

  test('is not adopted from another GitHub App either', () => {
    const gh = fakeGithub({ login: BOT });
    planted(gh, 1, 'app/someone-elses-app', 'focus_link');
    applyAsBot(gh);
    assert.equal(gh.hub.issues.filter((i) => idOfBody(i.body) === 'focus_link').length, 2);
  });
});

describe('an apply by a login whose issues would not be adopted', () => {
  test('is refused before anything changes, since its issues would be made again by every run', () => {
    const gh = fakeGithub({ login: 'stranger' });
    const deps = { run: gh.run, originRepo: REPO, write: () => {}, sleep: () => {} };
    assert.throws(
      () => mirror({ desired, mode: 'apply' }, deps),
      /stranger is signed in.*rogerbucks or github-actions\[bot\]/,
    );
    assert.deepEqual(gh.hub.mutations, []);
  });

  test('may still check, which changes nothing', () => {
    const gh = fakeGithub({ login: 'stranger' });
    const deps = { run: gh.run, originRepo: REPO, write: () => {}, sleep: () => {} };
    mirror({ desired, mode: 'check' }, deps);
    assert.deepEqual(gh.hub.mutations, []);
  });
});

describe('the build status board', () => {
  test('takes the issues the bot made as the mirror’s, and a stranger’s never', () => {
    const gh = fakeGithub({ login: BOT });
    applyAsBot(gh);
    planted(gh, 99, 'stranger', 'focus_link');
    const side = fakeRepoSide({ issues: () => gh.hub.issues });
    const board = readBuildBoard(side.run, gh.run, REPO, { sleep: () => {} });
    assert.equal(board.items.size, 5);
    assert.notEqual(board.issues.get('focus_link').number, 99);
  });
});
