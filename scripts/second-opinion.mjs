#!/usr/bin/env node
// A second opinion from other models (spec §50, risk_second_opinion). Claude builds the code and plays all nine
// experts in risk-panel.yml, so one model marks its own work. This script hands a pull request, before it merges, or
// the latest panel issue to other models. It uses the owner's own command-line tools and plans. Each model's answer
// becomes one comment there.
//
// It runs on the owner's machine only. The tools sign in with the owner's Google and xAI accounts. So it needs no API
// key and keeps none. It never writes to the repository.
//
// To run it: `npm run second-opinion`. Options go after `--`:
//   --pr 1245        review this pull request's change before it merges, and comment on it.
//   --issue 1234     the panel issue to answer. Without it or --pr: the latest one labelled risk-panel.
//   --models agy,grok  which tools to ask, comma-separated. Without it: Antigravity alone.
//   --dry-run        print each comment instead of posting it.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tools asked, by command name, each with the heading its comment opens with. */
export const MODELS = {
  // Each runs as read-only as its tool allows: a diff is someone else's text, and could ask it to write or run things.
  // Antigravity's plan mode is an instruction, not a lock, so each tool also runs in a clean copy of its own.
  agy: { heading: '**Second opinion (Gemini, via Antigravity)**', readOnly: ['--mode', 'plan'] },
  // Grok Build 1.0.70 keeps only the tools named: an allowlist, so a tool a later version adds is not let in. Tested
  // on Roger's Mac (24 Oct 2026): with these, a request to run a command or write a file did neither.
  grok: {
    heading: '**Second opinion (Grok)**',
    readOnly: ['--tools', 'read_file,list_dir,grep', '--permission-mode', 'plan', '--disable-web-search'],
  },
};
/** Who is asked when --models is not given. Antigravity only: Roger's Grok plan has less use in it (24 Oct 2026). */
export const DEFAULT_MODELS = ['agy'];
/** What the models read when no panel issue exists yet: the register the panels feed. */
export const REGISTER = 'RISKS.md';
/** GitHub refuses a comment over 65,536 characters, so keep well inside it. */
export const MAX_COMMENT = 60000;
// A model can think for a long time over a big diff, so give it time.
const MODEL_TIMEOUT_MS = 15 * 60 * 1000;

// The text goes in the prompt itself. A first run (24 Oct 2026) only told each tool where the file was. Both answered
// with what they planned to read, and gave no findings.
/** The most of a diff or report given in the prompt, so it stays well inside the system's command-line limit. */
export const MAX_INLINE = 100000;
const ANSWER =
  ' The repository at that commit is in the current folder: read its files to check each claim.' +
  ' Reply with the findings only: no account of what you will read or do. Plain English, UK spelling. ' +
  'Do not change any file.';

/**
 * The text between markers, cut to MAX_INLINE characters and saying so. Each marker carries a random tag the text
 * cannot know, so a diff holding a marker of its own cannot end the block early. The cut never splits a character.
 */
export function inline(text, tag = randomBytes(8).toString('hex')) {
  const chars = Array.from(text);
  const cut = chars.length > MAX_INLINE;
  const body = cut ? chars.slice(0, MAX_INLINE).join('') : text;
  const note = cut ? ` (cut to its first ${MAX_INLINE} characters)` : '';
  return `\n<<<BEGIN-${tag}${note}\n${body}\nEND-${tag}>>>\n`;
}

/** The answer with links to files on the owner's machine made plain text, as they lead nowhere on GitHub. */
export const plainLinks = (answer) =>
  answer
    // a link whose text holds brackets, or whose path holds parentheses, as well as a plain one
    .replace(/\[((?:[^[\]]|\[[^\]]*\])*)\]\(file:\/\/(?:[^()\s]|\([^()\s]*\))*\)/g, '$1')
    // a bare file:// address, left by a link the pattern above could not read
    .replace(/<?file:\/\/[^\s>)]+>?/g, '(local file)');

/** What each model is asked: argue against every expert, checking the code. */
/** What each model is asked when no panel issue exists yet: the register itself, risk by risk. */
export const registerPrompt = (file, text) =>
  `Below, between the markers, is ${file}: this repository's register of known risks, which expert panels feed.` +
  inline(text) +
  'Be an adversarial second reviewer. Say which risks look under-rated, mis-decided or stale, and list new risks ' +
  'the register misses, naming files and lines where you can. Worst first.' +
  ANSWER;

export const prompt = (file, text) =>
  `Below, between the markers, is ${file}: the risk report on this repository from an expert panel. Claude played ` +
  'nine experts (Morgan, Dot, Bram, Wren, Pip, Juno, Tam, Rory, Nell).' +
  inline(text) +
  'Be an adversarial second reviewer. For each expert, say what they missed, overstated or got wrong, naming files ' +
  'and lines. One short table per expert, worst first. Then a list of new risks no expert raised.' +
  ANSWER;

/** What each model is asked about a pull request: Antigravity's own review prompt, read-only. */
export const prPrompt = (file, text) =>
  `Below, between the markers, is ${file}: the diff of a pull request on this repository, against main.` +
  inline(text) +
  'Review it for logic bugs, regressions and unhandled edge cases; missing unit or integration tests; and ' +
  'unintended breaking changes or documentation drift. Be constructive and pragmatic. Focus on high-impact items, ' +
  'not style. List file names and line references for each issue, worst first.' +
  ANSWER;

/** The comment for one model's answer, headed with the model and cut to fit GitHub's limit. */
export function commentBody(model, answer) {
  const head = `${MODELS[model].heading}\n\n`;
  const note = '\n\n_(cut to fit GitHub’s comment limit)_';
  const text = answer.trim();
  if (head.length + text.length <= MAX_COMMENT) return head + text;
  // cut by whole characters, so an emoji at the cut is never split in half
  let kept = '';
  for (const c of text) {
    if (head.length + kept.length + c.length + note.length > MAX_COMMENT) break;
    kept += c;
  }
  return head + kept + note;
}

/** The value after an option, or an error naming the option when there is none. */
const value = (option, v) => {
  if (v === undefined || v.startsWith('--')) throw new Error(`${option} needs a value`);
  return v;
};
/** An issue or pull request number: a whole number above 0, written in digits. */
const number = (option, v) => {
  if (!/^[1-9]\d*$/.test(value(option, v))) throw new Error(`${option} needs a number above 0, not "${v}"`);
  return Number(v);
};

/** The options from the command line. */
export function parseArgs(argv) {
  const options = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--issue') options.issue = number(arg, argv[++i]);
    else if (arg === '--pr') options.pr = number(arg, argv[++i]);
    else if (arg === '--models')
      options.models = value(arg, argv[++i])
        .split(',')
        .map((m) => m.trim());
    else throw new Error(`unknown option: ${arg}`);
  }
  for (const m of options.models ?? []) {
    if (!MODELS[m]) throw new Error(`unknown model: ${m} (known: ${Object.keys(MODELS).join(', ')})`);
  }
  if (options.pr !== undefined && options.issue !== undefined) throw new Error('give --pr or --issue, not both');
  return options;
}

/** Runs a command and gives back what it printed. Throws as execFileSync does. */
const runCommand = (cmd, args, input, cwd) =>
  execFileSync(cmd, args, {
    input,
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: cmd === 'gh' ? 60_000 : MODEL_TIMEOUT_MS,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

/**
 * Asks each model about a pull request or the panel issue, and posts its answer there. With neither, the models read
 * the register, and each answer is saved to a file. Gives back the issue or pull request (or null) and who answered.
 */
export function secondOpinion({
  pr,
  issue,
  models = DEFAULT_MODELS,
  dryRun = false,
  run = runCommand,
  log = console.log,
  write = writeFileSync,
  read = (f) => readFileSync(f, 'utf8'),
  failed = () => {},
} = {}) {
  // this run's own folder, so saved answers never overwrite another run's
  const out = mkdtempSync(join(tmpdir(), 'second-opinion-run-'));
  if (pr !== undefined) return reviewPr({ pr, models, dryRun, run, log, write, failed, out });
  if (issue === undefined) {
    const found = JSON.parse(
      run('gh', ['issue', 'list', '--label', 'risk-panel', '--state', 'all', '--limit', '1', '--json', 'number']),
    );
    issue = found[0]?.number ?? null;
  }
  let file = REGISTER;
  let text;
  if (issue === null) {
    log(`No panel issue yet, so the models read the register, ${REGISTER}, and each answer is saved to a file.`);
    text = read(REGISTER);
  } else {
    file = join(out, `risk-panel-${issue}.md`);
    text = run('gh', ['issue', 'view', String(issue), '--json', 'body', '-q', '.body']);
    write(file, text);
    log(`Panel issue #${issue}, saved to ${file}.`);
  }

  fetch(['origin', 'main'], run, log);
  const question = (issue === null ? registerPrompt : prompt)(file, text);
  const { posted, skipped } = ask(models, question, 'origin/main', run, log);
  for (const { model, answer } of posted) {
    const body = commentBody(model, answer);
    if (dryRun) log(body);
    else if (issue === null) {
      const saved = join(out, `second-opinion-${model}.md`);
      write(saved, body);
      log(`${model}'s answer is in ${saved}.`);
    } else post(['issue', 'comment', String(issue)], model, body, { run, log, write, failed, out });
  }
  if (dryRun) log('Dry run: nothing posted.');
  else if (issue !== null) log(`Posted ${posted.length} comment(s) on #${issue}.`);
  return { issue, posted: posted.map((a) => a.model), skipped };
}

/** The pull request's review: each model reads its diff and comments on it, before it merges. */
function reviewPr({ pr, models, dryRun, run, log, write, failed, out }) {
  const file = join(out, `pr-${pr}.diff`);
  const diff = run('gh', ['pr', 'diff', String(pr)]);
  write(file, diff);
  log(`Pull request #${pr}: its diff is saved to ${file}.`);
  const head = run('gh', ['pr', 'view', String(pr), '--json', 'headRefOid', '-q', '.headRefOid']).trim();
  fetch(['origin', `pull/${pr}/head`], run, log);
  const answers = ask(models, prPrompt(file, diff), head, run, log);
  for (const { model, answer } of answers.posted) {
    const body = commentBody(model, answer);
    if (dryRun) log(body);
    else post(['pr', 'comment', String(pr)], model, body, { run, log, write, failed, out });
  }
  log(dryRun ? 'Dry run: nothing posted.' : `Posted ${answers.posted.length} comment(s) on #${pr}.`);
  return { issue: pr, posted: answers.posted.map((a) => a.model), skipped: answers.skipped };
}

/** Posts a comment with gh. When that fails, the answer is saved to a file, so minutes of model time are not lost. */
function post(args, model, body, { run, log, write, failed, out }) {
  try {
    run('gh', [...args, '-F', '-'], body);
  } catch (error) {
    const saved = join(out, `second-opinion-${model}.md`);
    write(saved, body);
    log(`Posting ${model}'s answer failed (${error.message}). It is saved in ${saved}.`);
    failed();
  }
}

/** Fetches so a clean copy can be made. A failure is only logged: the copy then falls back to the text alone. */
function fetch(args, run, log) {
  try {
    run('git', ['fetch', '--quiet', ...args]);
  } catch (error) {
    log(`git fetch ${args.join(' ')} failed (${error.message}).`);
  }
}

/**
 * A clean copy of the repository at `ref`, for one tool to read. The tool never sees the owner's own checkout, and
 * the copy is removed once it has answered. If git cannot make one, the tool gets an empty folder and the text alone.
 */
function copyAt(ref, model, run, log) {
  const room = mkdtempSync(join(tmpdir(), `second-opinion-${model}-`));
  try {
    run('git', ['worktree', 'add', '--quiet', '--detach', room, ref]);
    return { room, worktree: true };
  } catch (error) {
    log(`No clean copy at ${ref} (${error.message}), so ${model} reads the text alone.`);
    return { room, worktree: false };
  }
}

function removeCopy({ room, worktree }, run) {
  if (worktree) {
    try {
      run('git', ['worktree', 'remove', '--force', room]);
    } catch {
      // the folder is removed below, and `git worktree prune` tidies the record
    }
  }
  rmSync(room, { recursive: true, force: true });
}

/** Asks each model in turn, each in a clean copy at `ref`. A tool not installed, or one that fails, is skipped. */
function ask(models, text, ref, run, log) {
  const posted = [];
  const skipped = [];
  for (const model of models) {
    try {
      log(`Asking ${model}. This can take a few minutes.`);
      const copy = copyAt(ref, model, run, log);
      let answer;
      try {
        answer = plainLinks(run(model, [...MODELS[model].readOnly, '-p', text], undefined, copy.room));
      } finally {
        removeCopy(copy, run);
      }
      if (!answer.trim()) throw new Error('it gave no answer');
      posted.push({ model, answer });
    } catch (error) {
      log(
        error.code === 'ENOENT'
          ? `${model} is not installed, so it was skipped.`
          : `${model} failed (${error.message}), so it was skipped.`,
      );
      skipped.push(model);
    }
  }
  return { posted, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    // a post that failed leaves its answer in a file, and the run ends with an error so it is noticed
    const failed = () => (process.exitCode = 1);
    const { skipped, posted } = secondOpinion({ ...parseArgs(process.argv.slice(2)), failed });
    if (!posted.length && skipped.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
