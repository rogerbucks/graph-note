#!/usr/bin/env node
// Mirrors the editor's requirements into a GitHub Project, one issue for each requirement (spec §12,
// requirements_checked_in_ci). One way only: requirements/editor-requirements.gql stays the only source, and the
// issues and project items made from it are derivatives, regenerated and never edited by hand. A requirement's status
// (proved, part or open) is the one the slice board reads from the same file; its workstream is the one in
// requirements/workstreams.json. The planning is in github-project-plan.mjs and the gh calls in github-project-gh.mjs.
//
// Usage:
//   node scripts/github-project.mjs [--slices 3,4] [--dry-run]    print the plan; makes no network call (the default)
//   node scripts/github-project.mjs [--slices 3,4] --apply        do the plan with gh, which needs a token that may
//                                                                  write issues and projects (the `project` scope)
//
// A dry run cannot see GitHub, so it compares with an empty one: every issue shows as a create. --apply reads GitHub
// first, finds each issue by its hidden marker, changes only what differs, and never deletes: an issue whose
// requirement went is labelled requirement:removed and closed, with a comment. It is safe to run again.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS } from './check-requirements.mjs';
import { readBoard } from './slice-board.mjs';
import { desiredState, readWorkstreams } from './github-project-desired.mjs';
import { buildPlan, formatPlan } from './github-project-plan.mjs';
import { executePlan, ghRunner, readRemote, repoOwner } from './github-project-gh.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSTREAMS = 'requirements/workstreams.json';
const DEFAULT_SLICES = [3, 4];

function parseSlices(value) {
  const parts = value.split(',');
  if (!parts.every((p) => /^[1-9]\d*$/.test(p))) throw new Error('--slices needs whole numbers from 1, such as 3,4');
  return parts.map(Number);
}

function parseOptions(args) {
  const options = { apply: false, dryRun: false, slices: DEFAULT_SLICES };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apply') options.apply = true;
    else if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--slices') {
      if (args[i + 1] === undefined) throw new Error('--slices needs a value');
      options.slices = parseSlices(args[(i += 1)]);
    } else throw new Error(`unknown option ${args[i]}`);
  }
  if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be used together');
  return options;
}

const countLine = (issues, slices) => {
  const n = (status) => issues.filter((i) => i.status === status).length;
  return `requirements: ${issues.length} in slices ${slices.join(', ')} · ${n('proved')} proved · ${n('part')} part · ${n('open')} open`;
};

function main(args) {
  try {
    const options = parseOptions(args);
    const board = readBoard(readFileSync(join(ROOT, REQUIREMENTS), 'utf8'));
    const workstreams = readWorkstreams(readFileSync(join(ROOT, WORKSTREAMS), 'utf8'));
    const desired = desiredState(board, workstreams, options.slices);
    const header = [
      `github-project: ${options.apply ? 'apply' : 'dry run'}`,
      countLine(desired.issues, options.slices),
    ];
    if (!options.apply) {
      const plan = buildPlan(desired, { labelNames: [], issues: [], project: null });
      header[0] += ' — no network call is made; GitHub is taken to be empty, so every issue shows as a create';
      process.stdout.write(`${header.join('\n')}\n${formatPlan(plan)}`);
      return 0;
    }
    const run = ghRunner();
    const owner = repoOwner(run);
    const plan = buildPlan(desired, readRemote(run, owner));
    process.stdout.write(`${header.join('\n')}\n${formatPlan(plan)}`);
    executePlan(run, owner, plan);
    process.stdout.write('github-project: applied\n');
    return 0;
  } catch (e) {
    console.error(`github-project: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
