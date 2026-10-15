#!/usr/bin/env node
// Mirrors the editor's requirements into a GitHub Project, one issue for each requirement and one for each open
// question (spec §12, requirements_checked_in_ci). One way only: requirements/editor-requirements.gql stays the only
// source, and the issues and project items made from it are derivatives, regenerated and never edited by hand. A
// requirement's status (proved, part or open) is the one the slice board reads from the same file; its workstream is
// the one in requirements/workstreams.json. A question's issue is labelled kind:question, lists the requirements it
// blocks and stays open; its workstream is the one that lists it, or Q, Open questions. The planning is in
// github-project-plan.mjs and the gh calls in github-project-gh.mjs.
//
// When the options of Slice or Workstream change, as when workstreams are added or more slices are chosen, the next
// --apply replaces that field's options in GitHub. That clears the field on every item, and the run sets it again on
// each item it manages: growing Workstream from 17 options to 36 re-sets Workstream on every item, and choosing
// --slices 3,4,6,7,8,9 re-sets Slice too.
//
// Usage:
//   node scripts/github-project.mjs [--slices 3,4] [--dry-run]    print the plan; makes no network call (the default)
//   node scripts/github-project.mjs [--slices 3,4] --check        read GitHub and print the real diff; changes nothing
//   node scripts/github-project.mjs [--slices 3,4] --apply [--allow-removals] [--accept-warnings]
//                                                                  do the plan with gh, which needs a token that may
//                                                                  write issues and projects (the `project` scope)
//
// --check and --apply also work out the values an item with none is given (see scripts/build-status-seed.mjs), from main
// and the releases and open pull requests of GitHub, and print the tally of them. If a file they read could not be read, the
// seed carries a warning; --check says that an apply would stop, and --apply stops unless --accept-warnings is given.
//
// A dry run cannot see GitHub, so it compares with an empty one: every issue shows as a create. --check and --apply
// first confirm that gh points at this checkout's own origin repository, then read GitHub, find each issue it made by
// its hidden marker (only issues written by the signed-in login, with the generated banner and the marker at the end),
// change only what differs, and never delete: an issue whose requirement went is labelled requirement:removed and
// closed, with a comment. --apply stops, unless --allow-removals is given, when the requirements file holds no
// requirements or the plan removes more than 10 issues. It is safe to run again.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS } from './check-requirements.mjs';
import { readBoard } from './slice-board.mjs';
import { QUESTION_LABEL, desiredState, readWorkstreams, withSeed } from './github-project-desired.mjs';
import { seedOf } from './build-status-seed.mjs';
import { buildPlan, formatPlan, guardProblem } from './github-project-plan.mjs';
import { executePlan, ghRunner, pinRepo, readRemote, repoOfRemote } from './github-project-gh.mjs';
import { retrying } from './github-project-retry.mjs';
import { WAVES_FILE, readWaves, waveLines } from './github-project-waves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSTREAMS = 'requirements/workstreams.json';
const DEFAULT_SLICES = [3, 4];
const MODES = [
  ['--apply', 'apply'],
  ['--check', 'check'],
  ['--dry-run', 'dry-run'],
];

function parseSlices(value) {
  const parts = value.split(',');
  if (!parts.every((p) => /^[1-9]\d*$/.test(p))) throw new Error('--slices needs whole numbers from 1, such as 3,4');
  return parts.map(Number);
}

function parseOptions(args) {
  const given = new Set();
  const options = { slices: DEFAULT_SLICES, allowRemovals: false, acceptWarnings: false };
  for (let i = 0; i < args.length; i += 1) {
    if (MODES.some(([flag]) => flag === args[i])) given.add(args[i]);
    else if (args[i] === '--allow-removals') options.allowRemovals = true;
    else if (args[i] === '--accept-warnings') options.acceptWarnings = true;
    else if (args[i] === '--slices') {
      if (args[i + 1] === undefined) throw new Error('--slices needs a value');
      options.slices = parseSlices(args[(i += 1)]);
    } else throw new Error(`unknown option ${args[i]}`);
  }
  const flags = MODES.filter(([flag]) => given.has(flag));
  if (flags.length > 1) throw new Error(`${flags[0][0]} and ${flags[1][0]} cannot be used together`);
  options.mode = flags.length ? flags[0][1] : 'dry-run';
  if (options.allowRemovals && options.mode !== 'apply') throw new Error('--allow-removals only goes with --apply');
  if (options.acceptWarnings && options.mode !== 'apply') throw new Error('--accept-warnings only goes with --apply');
  return options;
}

/** The tally of the waves plan and its warnings, a line each, or nothing without a plan. */
const wavesText = (desired) =>
  waveLines(desired)
    .map((line) => `${line}\n`)
    .join('');

const countLine = (issues, slices) => {
  const asked = issues.filter((i) => i.labels.includes(QUESTION_LABEL)).length;
  const requirements = issues.filter((i) => !i.labels.includes(QUESTION_LABEL));
  const n = (status) => requirements.filter((i) => i.status === status).length;
  const questions = asked ? ` · open questions: ${asked}` : '';
  return `requirements: ${requirements.length} in slices ${slices.join(', ')} · ${n('proved')} proved · ${n('part')} part · ${n('open')} open${questions}`;
};

/** The repository this checkout's origin remote names, as `owner/name`. */
function originRepo() {
  const result = spawnSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error(`git could not read the origin remote: ${result.error?.message ?? String(result.stderr).trim()}`);
  return repoOfRemote(result.stdout).repo;
}

/**
 * Reads GitHub and prints the plan for `desired`, in 'check' mode (read-only) or 'apply' mode (then does it). `deps` are
 * the gh runner, the origin repository (`owner/name`), a function that writes text and the blocking sleep to pace calls
 * with. Throws, having changed nothing further, when gh points at another repository than the origin, or when apply is
 * stopped by the guard against removing too much and `allowRemovals` is not given. `seed(run, repo)`, if given, gives {seed,
 * warnings}: the Map from a requirement id to the {buildStatus, progress} an item with none takes
 * (scripts/build-status-seed.mjs), where the requirement stands on GitHub in place of Not started and Todo, and the warnings
 * (a requirements file that could not be read) the seed was made despite. The plan prints the tally of what it would seed.
 * An apply with warnings in the seed stops, since it would fix wrong values for good, unless `acceptWarnings` is given;
 * a check says that it would.
 */
export function mirror(
  { desired: base, mode, allowRemovals, acceptWarnings, seed, project = true },
  { run: raw, originRepo: origin, write, sleep, creator },
) {
  const run = retrying(raw, sleep ? { sleep } : {});
  const repo = pinRepo(run, origin);
  // the seed gives only project values, so a run that does not read the project needs none
  const seeded = seed && project ? seed(run, repo) : { seed: new Map(), warnings: [] };
  const desired = withSeed(base, seeded.seed);
  const remote = readRemote(run, repo, { creator, project });
  if (mode === 'apply' && !remote.adopters.some((a) => a.toLowerCase() === remote.login.toLowerCase()))
    throw new Error(
      `${remote.login} is signed in, but only issues written by ${remote.adopters.join(' or ')} are adopted, so the issues this apply made would be made again by the next; apply as the owner, or let the workflow apply`,
    );
  const plan = buildPlan(desired, remote);
  const slices = desired.fields.Slice.map((option) => Number(option.replace('Slice ', '')));
  const heading =
    mode === 'check' ? 'check — read-only: GitHub is read and nothing is changed' : 'apply — GitHub is changed';
  write(`github-project: ${heading}\ntarget repository: ${repo}\n${countLine(desired.issues, slices)}\n`);
  write(wavesText(desired));
  write(formatPlan(plan));
  const problem = guardProblem(plan);
  const n = seeded.warnings.length;
  const seedProblem = n
    ? `the seed was made despite ${n} warning${n === 1 ? '' : 's'} (above), so some values may be wrong; pass --accept-warnings if that is meant`
    : null;
  if (mode === 'check') {
    for (const stop of [problem, seedProblem]) if (stop) write(`warning: an apply would stop: ${stop}\n`);
    return;
  }
  if (problem && !allowRemovals) throw new Error(problem);
  if (seedProblem && !acceptWarnings) throw new Error(seedProblem);
  executePlan(raw, repo, plan, sleep ? { sleep } : {});
  write('github-project: applied\n');
}

function main(args) {
  try {
    const options = parseOptions(args);
    const board = readBoard(readFileSync(join(ROOT, REQUIREMENTS), 'utf8'));
    const workstreams = readWorkstreams(readFileSync(join(ROOT, WORKSTREAMS), 'utf8'));
    const waves = readWaves(readFileSync(join(ROOT, WAVES_FILE), 'utf8'), workstreams);
    const desired = desiredState(board, workstreams, options.slices, waves);
    if (options.mode === 'dry-run') {
      const plan = buildPlan(desired, { login: null, labelNames: [], issues: [], project: null });
      const note = 'no network call is made; GitHub is taken to be empty, so every issue shows as a create';
      process.stdout.write(
        `github-project: dry run — ${note}\n${countLine(desired.issues, options.slices)}\n${wavesText(desired)}${formatPlan(plan)}`,
      );
      return 0;
    }
    const write = (text) => process.stdout.write(text);
    mirror(
      {
        desired,
        mode: options.mode,
        allowRemovals: options.allowRemovals,
        acceptWarnings: options.acceptWarnings,
        seed: (run, repo) => seedOf(run, repo, { write }),
      },
      { run: ghRunner(), originRepo: originRepo(), write },
    );
    return 0;
  } catch (e) {
    console.error(`github-project: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
