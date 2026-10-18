// A small GitHub for the build status tests to act in: a repository with pull request 7 open, main holding the fixture’s
// requirements, the pull request’s head writing one more test, and the project mirrored. Test code only — nothing here
// ships, and nothing here touches the network.
import { handleEvent } from '../../scripts/build-status-run.mjs';
import { FIXTURE } from './github-project-fixture.js';
import { fakeRepoSide, mirroredProject, pull } from './build-status-fake.js';

export const REPO = 'rogerbucks/thoughtknot';
export const RUN = 'https://github.com/rogerbucks/thoughtknot/actions/runs/99';
export const HEAD = 'a'.repeat(40);
export const MERGE = 'c'.repeat(40);
export const PARENT = 'd'.repeat(40);
export const TOKEN = `ghp_FakeTokenForTest1234`;
const PLANNED =
  "(test_later:Test {proves: 'a planned proof', file: 'test/later.test.js', where: 'repo', status: 'planned'})";
export const HEAD_TEXT = FIXTURE.replace(PLANNED, PLANNED.replace("'planned'", "'written'"));
export const MOVED = ['focus_link', 'focus_neighbours'];
export const IDS = ['focus_link', 'focus_neighbours', 'zoom_out_to_fit', 'stray_new'];
const noSleep = () => {};

/** A passing, failing or running run of CI on a commit, as the API gives it. */
export const ci = (status, conclusion = null, extra = {}) => ({
  name: 'CI',
  path: '.github/workflows/ci.yml',
  run_number: 1,
  status,
  conclusion,
  ...extra,
});

/** The workflow_run event of a pull request’s checks, for a head commit and the numbers it names. */
export const checksOf = (numbers, head = HEAD) => ({
  workflow_run: { event: 'pull_request', head_sha: head, pull_requests: numbers.map((number) => ({ number })) },
});

/**
 * The world: `side` (the repository, `hub` to set up and read back), `gh` (the project), `deps` for handleEvent,
 * `annotations`, `writes` (the lines the run logs), and `send(eventName, payload)`, `trigger()` (the checks of pull request 7), `value(id, field)`,
 * `values()` (the Build status of the fixture’s ids), `comments(n)`.
 */
export function world({ token = TOKEN } = {}) {
  const gh = mirroredProject();
  const side = fakeRepoSide({ issues: () => gh.hub.issues });
  side.hub.pulls[7] = pull(7, { head: HEAD });
  side.hub.files.main = FIXTURE;
  side.hub.files[HEAD] = HEAD_TEXT;
  side.hub.workflowRuns[HEAD] = [ci('in_progress')];
  const annotations = [];
  const writes = [];
  const deps = {
    github: side.run,
    project: token ? gh.run : null,
    projectToken: token,
    annotate: (level, text) => annotations.push([level, text]),
    write: (text) => writes.push(text),
    sleep: noSleep,
  };
  const send = (eventName, payload) => handleEvent({ eventName, payload, repo: REPO, runUrl: RUN }, deps);
  const trigger = () => send('workflow_run', checksOf([7]));
  const value = (id, field = 'Build status') => {
    const [project] = gh.hub.projects;
    const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
    return project.items.find((i) => i.number === issue.number).values[field];
  };
  const values = (field) => Object.fromEntries(IDS.map((id) => [id, value(id, field)]));
  const comments = (number = 7) => side.hub.comments[number] ?? [];
  return { side, gh, deps, annotations, writes, send, trigger, value, values, comments };
}
