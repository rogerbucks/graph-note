// The GitHub mirror and the build status find, make and fill the project through GraphQL, by the owner’s login, and never with
// a `gh project` verb that asks gh to resolve the owner’s type first: for a token with only the project scope that fails
// with "unknown owner type". An owner that cannot be found, or an answer with no list of projects, is an error naming the
// owner, never taken for no projects (which would make the project a second time). Every case runs against an in-memory
// stand-in for gh, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState, idOfBody } from '../scripts/github-project-desired.mjs';
import { buildPlan } from '../scripts/github-project-plan.mjs';
import { executePlan, findProject, readProject, readRemote } from '../scripts/github-project-gh.mjs';
import { issueNodeId, ownerId } from '../scripts/github-project-read.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';

const REPO = 'rogerbucks/graph-note';
const noSleep = () => {};
const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
const issueOf = (gh, id) => gh.hub.issues.find((i) => idOfBody(i.body) === id);
const apply = (gh, run = gh.run) =>
  executePlan(run, REPO, buildPlan(desired, readRemote(run, REPO)), { sleep: noSleep });

/** gh as it answers for a token it cannot resolve the owner’s type with: every `gh project` verb fails. */
const unknownOwnerType = (gh) => (args, input) => {
  if (args[0] === 'project')
    throw Object.assign(new Error('gh project failed: unknown owner type'), { stderr: 'unknown owner type' });
  return gh.run(args, input);
};

describe('finding the project through GraphQL, whatever gh can tell of the owner’s type', () => {
  test('without `gh project list`, which is where gh says unknown owner type', () => {
    const gh = fakeGithub();
    apply(gh);
    const { project } = readRemote(unknownOwnerType(gh), REPO);
    assert.equal(project.number, 1);
    assert.equal(project.items.length, 5);
  });

  test('asks for the owner of the repository by login, whether a user or an organization', () => {
    const gh = fakeGithub();
    apply(gh);
    const asked = gh.hub.calls.filter((c) => c.args[0] === 'api' && c.args[1] === 'graphql');
    const lists = asked.filter((c) => /projectsV2/.test(JSON.parse(c.input).query));
    assert.ok(lists.length > 0);
    for (const c of lists) assert.equal(JSON.parse(c.input).variables.owner, 'rogerbucks');
    assert.match(
      JSON.parse(lists[0].input).query,
      /repositoryOwner\(login: \$owner\)[\s\S]*on User[\s\S]*on Organization/,
    );
    assert.equal(findProject(gh.run, 'rogerbucks').number, 1);
  });

  test('through every page of projects, a hundred to a page', () => {
    const gh = fakeGithub();
    apply(gh);
    const mine = gh.hub.projects[0];
    gh.hub.projects = [
      ...Array.from({ length: 150 }, (_, i) => ({
        number: 100 + i,
        title: `other ${i}`,
        id: `P${i}`,
        fields: [],
        items: [],
      })),
      mine,
    ];
    assert.equal(readRemote(gh.run, REPO).project.number, mine.number);
    const graphqlCalls = gh.hub.calls.filter((c) => c.args[0] === 'api' && c.args[1] === 'graphql');
    assert.ok(graphqlCalls.filter((c) => /projectsV2/.test(JSON.parse(c.input).query)).length >= 2);
  });
});

describe('making and filling the project through GraphQL', () => {
  test('needs no gh project verb at all, as a token that cannot resolve the owner’s type must', () => {
    const gh = fakeGithub();
    apply(gh, unknownOwnerType(gh));
    const [project] = gh.hub.projects;
    assert.equal(project.title, 'graph-note requirements');
    assert.equal(project.items.length, 5);
    const item = project.items.find((i) => i.number === issueOf(gh, 'focus_link').number);
    assert.equal(item.values.Proof, 'open');
    assert.ok(gh.hub.calls.every((c) => c.args[0] !== 'project'));
  });

  test('makes the project with the owner’s node id, and adds each issue by its node id', () => {
    const gh = fakeGithub();
    apply(gh);
    const queries = gh.hub.calls.filter((c) => c.args[1] === 'graphql').map((c) => JSON.parse(c.input));
    const made = queries.find((q) => /createProjectV2\(/.test(q.query));
    assert.deepEqual(made.variables, { owner: 'OWNER_rogerbucks', title: 'graph-note requirements' });
    const added = queries.filter((q) => /addProjectV2ItemById\(/.test(q.query));
    assert.equal(added.length, 5);
    assert.ok(added.every((q) => /^ISSUE_\d+$/.test(q.variables.content)));
  });

  test('adds an issue already in the project to nothing new, since GitHub answers with the item it has', () => {
    const gh = fakeGithub();
    apply(gh);
    const before = gh.hub.projects[0].items.length;
    const query =
      'mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } } }';
    const variables = { project: gh.hub.projects[0].id, content: `ISSUE_${issueOf(gh, 'focus_link').number}` };
    const again = gh.run(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables }));
    assert.ok(JSON.parse(again).data.addProjectV2ItemById.item.id);
    assert.equal(gh.hub.projects[0].items.length, before);
  });
});

describe('an owner or a list that is not there', () => {
  test('is an error that names the owner, never no projects, which would make the project twice', () => {
    const gh = fakeGithub();
    assert.throws(() => findProject(gh.run, 'someone-else'), /owner someone-else could not be found/);
    assert.throws(() => readProject(gh.run, 'someone-else', 1, new Map()), /owner someone-else could not be found/);
    assert.throws(() => ownerId(gh.run, 'someone-else'), /owner someone-else could not be found/);
    assert.equal(gh.hub.mutations.length, 0);
  });

  test('is an error where the answer has an owner but no list of projects, and for an owner that has gone', () => {
    const noList = (args) => {
      assert.equal(args[1], 'graphql');
      return JSON.stringify({ data: { repositoryOwner: {} } });
    };
    assert.throws(() => findProject(noList, 'rogerbucks'), /projects of rogerbucks could not be listed/);
    const gone = () => JSON.stringify({ data: { repositoryOwner: null } });
    assert.throws(() => findProject(gone, 'rogerbucks'), /owner rogerbucks could not be found/);
    assert.throws(() => readProject(gone, 'rogerbucks', 1, new Map()), /owner rogerbucks could not be found/);
  });

  test('is no bare TypeError when the project’s own answer has no owner', () => {
    const gone = () => JSON.stringify({ data: { repositoryOwner: null } });
    assert.throws(
      () => readProject(gone, 'rogerbucks', 1, new Map()),
      (e) => !(e instanceof TypeError) && /rogerbucks/.test(e.message),
    );
  });

  test('is an error naming the issue that cannot be found to add to the project', () => {
    const gh = fakeGithub();
    assert.throws(() => issueNodeId(gh.run, REPO, 99), /issue #99 of rogerbucks\/graph-note could not be found/);
  });
});
