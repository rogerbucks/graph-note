# Handbook for AI sessions

The detail behind [AGENTS.md](../../AGENTS.md). Read the part you need when you need it.

## Run the tests cheaply

- `npm run test:ai` — the whole JavaScript suite, quietly. One line when all pass (`ok N tests`). For each failure:
  `file:line  name`, a short expected and actual (cut at 200 characters), and the first stack frame in our code. Tests'
  own logging is dropped. One file: `npm run test:ai -- path/to/file.test.js`; `npm run -s` hides npm's banner.
- `npm run test:changed` — only the tests a change reaches: those named after it and every test that imports it, directly
  or through other modules. The whole suite runs, saying why, for `package.json`, a workflow or a file no test reaches;
  `-- --list` shows the plan. A folder named in pieces is missed, so run the full suite before a merge.
- `npm run test:ai:py` — the Python library's tests, quietly (needs `uv`). Add test file names to run only those.
- Write docs and comments in plain language for ADHD readers: `node scripts/plain-docs.mjs <path>` lists what to fix.
- Never run bare `node --test`: only these npm scripts and `npm test` are capped, by `scripts/run-ceiling.mjs`. Its
  line `run-ceiling: stopped the run …` means a test runs away: fix the test; raise `THOUGHTKNOT_TEST_*` only if need be.

## What CI runs

A pull request, draft or ready, runs only the tests its change reaches (`scripts/ci-plan.mjs`). The safety checks
always run: lint, types, the build, tests-first, the code scan and the PR checks. Main, the nightly and a release run
everything. Add the label `ci:full` to a pull request to run everything from its next push.

## Before a merge: the full commands

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` and `node scripts/check-classification.mjs --all`;
in `python/graph_spec` also `uv run --locked ruff check`, `ruff format --check` and
`python -m unittest discover -s tests`.

On a CI failure, read only the failed job's log: `gh run view <id> --log-failed`. Not the whole run.

## Before you open a pull request

- **Merge commits only**, never squash or rebase. `pr-checks.yml` checks the rest: a `Requirements:` line, your
  `agent:` label, no `Claude-Session:` link, and each test in one commit with its code.
- **Sign off as Roger, never as an AI:** CONTRIBUTING.md, "Signing off your work", gives the exact line. CI checks it.
- **Rewrite what CI checks.** A test: `node scripts/tests-first.mjs --update`, or `node scripts/tests-first.mjs --excuse`
  for one that passed first. A doc: `node scripts/plain-docs.mjs`. An export: `node scripts/public-api.mjs --update`.
- **More of the same.** A dependency: `node scripts/notices.mjs`. A slice done: `node scripts/readme-status.mjs --write`.
  A fixed sleep removed: `node scripts/fixed-sleeps.mjs --tighten`.
- **Merging.** Mark it ready. Once its full CI run is green, turn on auto-merge, as a merge commit. No "all good" needed.

## Where things live

- [CONTRIBUTING.md](../../CONTRIBUTING.md) — how a change is made (spec, then test, then code), the conventions, the naming.
- [packages/core/GUIDE.md](../../packages/core/GUIDE.md) — the host-free core: reading, drawing, edits.
- [packages/graph-spec/GUIDE.md](../../packages/graph-spec/GUIDE.md) — the graph format library in plain JavaScript.
- The hosts: [packages/obsidian/GUIDE.md](../../packages/obsidian/GUIDE.md),
  [packages/claude-code/GUIDE.md](../../packages/claude-code/GUIDE.md), [packages/app/GUIDE.md](../../packages/app/GUIDE.md).
- [python/graph_spec/GUIDE.md](../../python/graph_spec/GUIDE.md) — the Python library.
- Tests mirror the code: `src/zoom.ts` is tested in `test/zoom.test.js`. Tests that span modules sit in the root `test/`.
- `scripts/` — tools that run from the command line: the quiet runners, `tests-first.mjs`, `check-classification.mjs`.
- `test-vault/` — run `scripts/reset-test-vault.mjs` before and after any session in it, to restore it.

## Files never to read

A search skips these (`.ignore`); do not open them either. They are generated or bulky, and reading one costs thousands
of tokens for nothing. Change them only by running the command that makes them.

- `packages/graph-spec/dist/`, `dist/`, `packages/app/src-tauri/target/` — build output; `npm run build`, `cargo build`.
- `main.js` — the built plugin; CI builds it from a tag.
- `packages/claude-code/mod/hooks/graph.js` and `packages/claude-code/mod/bin/` — the built mod; `npm run build`.
- `package-lock.json`, `python/graph_spec/uv.lock`, `packages/app/src-tauri/Cargo.lock` — lock files.
- `test/tests-first/` — the record of tests seen failing first, a file per commit; `node scripts/tests-first.mjs --update` writes it.
- `THIRD_PARTY_NOTICES.md` — made by `node scripts/notices.mjs`; `public-api.json` — by `node scripts/public-api.mjs --update`.
- `licences/texts/` — the licence texts those notices quote.
- `test-vault/.obsidian/` — the test vault's settings and plugin copies.

Search one on purpose with `rg --no-ignore PATTERN path`.
