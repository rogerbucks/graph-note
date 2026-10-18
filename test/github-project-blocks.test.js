// The blocked-by links of the GitHub mirror (spec §12, requirements_checked_in_ci). Each open question's issue blocks
// the issues of the requirements it blocks. It uses GitHub's own issue dependencies, kept one way from the requirements
// copy. Every case runs against the in-memory stand-in for gh, so no network is touched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, readRemote } from '../scripts/github-project-gh.mjs';
import { planBlocks } from '../scripts/github-project-blocks.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE_WITH_QUESTIONS, WORKSTREAMS_WITH_QUESTIONS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/thoughtknot';
const desired = desiredState(readBoard(FIXTURE_WITH_QUESTIONS), WORKSTREAMS_WITH_QUESTIONS, [3, 4]);
const apply = (gh, state = desired) =>
  executePlan(gh.run, REPO, buildPlan(state, readRemote(gh.run, REPO)), { sleep: () => {} });
const numberOf = (gh, id) => gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`)).number;
const blockersOf = (gh, id) => [...(gh.hub.issues.find((i) => i.number === numberOf(gh, id)).blockedBy ?? [])].sort();
const linkCalls = (gh) => gh.hub.mutations.filter((m) => m.includes('/dependencies/'));

describe('the blocked-by links', () => {
  test('mark each open question’s issue as blocking the issues of the requirements it blocks', () => {
    const gh = fakeGithub();
    const result = apply(gh);
    const q = numberOf(gh, 'q_01_ai_interface');
    assert.deepEqual(blockersOf(gh, 'zoom_out_to_fit'), [q]);
    assert.deepEqual(blockersOf(gh, 'focus_link'), [q]);
    assert.deepEqual(blockersOf(gh, 'focus_neighbours'), []);
    assert.deepEqual(result.warnings, []);
  });

  test('are made once: a second apply adds and removes none', () => {
    const gh = fakeGithub();
    apply(gh);
    const before = linkCalls(gh).length;
    apply(gh);
    assert.equal(linkCalls(gh).length, before);
  });

  test('a link the requirements no longer give is removed, and a person’s link to another issue is kept', () => {
    const gh = fakeGithub();
    apply(gh);
    const q = numberOf(gh, 'q_01_ai_interface');
    gh.hub.issues.push({
      number: 99,
      title: 'a person’s',
      body: 'mine',
      state: 'OPEN',
      labels: [],
      author: { login: 'x' },
    });
    gh.hub.issues.find((i) => i.number === 99).blockedBy = [q];
    const fewer = desiredState(
      readBoard(FIXTURE_WITH_QUESTIONS.replace(',\n(q_01_ai_interface)-[:BLOCKS]->(focus_link)', '')),
      WORKSTREAMS_WITH_QUESTIONS,
      [3, 4],
    );
    apply(gh, fewer);
    assert.deepEqual(blockersOf(gh, 'focus_link'), []);
    assert.deepEqual(blockersOf(gh, 'zoom_out_to_fit'), [q]);
    assert.deepEqual(gh.hub.issues.find((i) => i.number === 99).blockedBy, [q]);
  });

  test('refused by GitHub, they leave the issues and the project mirrored, with a warning', () => {
    const gh = fakeGithub();
    gh.hub.dependenciesRefused = true;
    const result = apply(gh);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /blocked-by links were not set: .*404/);
    assert.ok(gh.hub.projects[0].items.length > 0, 'the project was still mirrored');
  });

  test('are planned from what each question blocks and what GitHub holds', () => {
    const issues = [{ id: 'q', blocks: ['a', 'b', 'gone'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }];
    const known = { q: { number: 1 }, a: { number: 2 }, b: { number: 3 }, c: { number: 4 } };
    const blocking = new Map([[1, [2, 4, 50]]]);
    assert.deepEqual(planBlocks(issues, known, blocking), {
      add: [{ blocker: 1, blocked: 3 }],
      remove: [{ blocker: 1, blocked: 4 }],
    });
  });
});
