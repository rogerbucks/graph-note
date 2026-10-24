#!/usr/bin/env node
// The check before a wave's build (wave-nightly.yml). Every requirement of the wave must be done on the project board,
// "ThoughtKnot requirements". Done means its built-in Status is Done and its Proof is proved.
// If any is not, the build does not run and the items still open are listed.
//
// The wave is named by the pull request that ends it, with a line of its own in its body: `Wave: 9`. That matches the
// board's Wave `Wave 9 · …`. A pull request with no such line, or a wave the board has no items for, stops the build too.
// The mirror and the build status workflows fill the board after a merge. So the check waits and tries again until the
// wait runs out.
//
// Usage: PR_BODY=… PROJECT_TOKEN=… node scripts/wave-gate.mjs [--wait-minutes 15]
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PROJECT_TITLE } from './github-project-desired.mjs';
import { ghRunner } from './github-project-gh.mjs';
import { findProject, readProject } from './github-project-read.mjs';

const DONE = 'Done';
const PROVED = 'proved';

/** The wave number a pull request body names with a `Wave: N` line, or null. */
export function waveOf(body) {
  const m = /^[ \t]*Wave:[ \t]*(\d+)[ \t]*$/im.exec(String(body ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * What stands in the way of building wave `number`: {found, open}. `items` are the board's items, each with `id` and
 * `values` (Wave, Status, Proof). `open` lists those of the wave that are not Done and proved, with what each lacks.
 */
export function waveProblems(items, number) {
  const title = new RegExp(`^Wave ${number}(?!\\d)`);
  const mine = items.filter((i) => title.test(i.values.Wave ?? ''));
  const open = mine
    .map((i) => ({
      id: i.id,
      status: i.values.Status ?? 'no Status',
      proof: i.values.Proof ?? 'no Proof',
    }))
    .filter((i) => i.status !== DONE || i.proof !== PROVED);
  return { found: mine.length, open };
}

/** The lines that say which items are open, for the log and the run's summary. */
export function report(number, { found, open }) {
  if (found === 0)
    return [`Wave ${number} has no items on the board "${PROJECT_TITLE}", so there is nothing to build.`];
  if (open.length === 0) return [`All ${found} items of wave ${number} are Done and proved.`];
  return [
    `Wave ${number}: ${open.length} of ${found} items are not done yet, so no build was made.`,
    ...open.map((i) => `- issue #${i.id}: Status ${i.status}, Proof ${i.proof}`),
  ];
}

function readItems(env) {
  const run = ghRunner(undefined, { set: { GH_TOKEN: env.PROJECT_TOKEN } });
  const owner = String(env.GITHUB_REPOSITORY_OWNER ?? 'rogerbucks');
  const project = findProject(run, owner);
  if (!project) throw new Error(`the project "${PROJECT_TITLE}" was not found`);
  // every issue is read, not only the requirements', so an item's id here is its issue number
  return readProject(run, owner, project.number, { get: (n) => n }).items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main(args, env = process.env) {
  const at = args.indexOf('--wait-minutes');
  const wait = at === -1 ? 0 : Number(args[at + 1]);
  const number = waveOf(env.PR_BODY);
  const say = (lines) => {
    console.log(lines.join('\n'));
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  };
  if (number === null) {
    say(['The pull request has no `Wave: N` line in its body, so the wave to check is not known. No build was made.']);
    return 1;
  }
  if (!env.PROJECT_TOKEN) {
    say(['PROJECT_TOKEN is not set, so the board cannot be read. No build was made.']);
    return 1;
  }
  const deadline = Date.now() + wait * 60_000;
  for (;;) {
    const problems = waveProblems(readItems(env), number);
    const clear = problems.found > 0 && problems.open.length === 0;
    if (clear || Date.now() >= deadline) {
      say(report(number, problems));
      return clear ? 0 : 1;
    }
    console.log(`Not yet: ${report(number, problems)[0]} Trying again in a minute.`);
    await sleep(60_000);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
