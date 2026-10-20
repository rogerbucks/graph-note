# Guide for AI sessions

Short on purpose. Three AI tools share this repo: [docs/agents/ROLES.md](docs/agents/ROLES.md) says who does what.

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

## Before a merge: the full commands

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` and `node scripts/check-classification.mjs --all`;
in `python/graph_spec` also `uv run --locked ruff check`, `ruff format --check` and
`python -m unittest discover -s tests`. CI runs all of them, and the full suite is never skipped.

On a CI failure, read only the failed job's log: `gh run view <id> --log-failed`. Not the whole run.

## Before you open a pull request

- **Merge commits only**, never squash or rebase: the tests-first records name the branch's own commits.
- **Sign off as Roger, never as an AI:** CONTRIBUTING.md, "Signing off your work", gives the exact line. CI checks it.
- **Rewrite what CI checks.** A test: `node scripts/tests-first.mjs --update`, or `node scripts/tests-first.mjs --excuse`
  for one that passed first. A doc: `node scripts/plain-docs.mjs`. An export: `node scripts/public-api.mjs --update`.
- **More of the same.** A dependency: `node scripts/notices.mjs`. A slice done: `node scripts/readme-status.mjs --write`.
  A fixed sleep removed: `node scripts/fixed-sleeps.mjs --tighten`.
- **Approval.** Mark it ready first: a draft runs part of CI. Roger's "all good" then approves: auto-merge, merge commit.

## Guards

A guard or hook that refuses a command means stop and ask the owner. Never reach the same result by another tool,
wording or route. The one exception: when the refusal itself says how to do it allowably, do exactly that and say so.

## The test vault

`scripts/reset-test-vault.mjs` restores `test-vault/`; run it before and after any session in the test vault.

## Where things live

- [CONTRIBUTING.md](CONTRIBUTING.md) — how a change is made (spec, then test, then code), the conventions, the naming.
- [packages/core/GUIDE.md](packages/core/GUIDE.md) — the host-free core: reading, drawing, edits.
- [packages/graph-spec/GUIDE.md](packages/graph-spec/GUIDE.md) — the graph format library in plain JavaScript.
- [packages/obsidian/GUIDE.md](packages/obsidian/GUIDE.md), [packages/claude-code/GUIDE.md](packages/claude-code/GUIDE.md) — the hosts.
- [python/graph_spec/GUIDE.md](python/graph_spec/GUIDE.md) — the Python library.
- Tests mirror the code: `src/zoom.ts` is tested in `test/zoom.test.js`. Tests that span modules sit in the root `test/`.
- `scripts/` — tools that run from the command line: the quiet runners, `tests-first.mjs`, `check-classification.mjs`.

## Files never to read

A search skips these (`.ignore`); do not open them either. They are generated or bulky, and reading one costs thousands
of tokens for nothing. Change them only by running the command that makes them.

- `packages/graph-spec/dist/` and `dist/` — the built checker and other build output; `npm run build` makes them.
- `main.js` — the built plugin; CI builds it from a tag.
- `packages/claude-code/mod/hooks/graph.js` and `packages/claude-code/mod/bin/` — the built mod; `npm run build`.
- `package-lock.json` and `python/graph_spec/uv.lock` — lock files; `npm install` and `uv lock` write them.
- `test/tests-first/` — the record of tests seen failing first, a file per commit; `node scripts/tests-first.mjs --update` writes it.
- `THIRD_PARTY_NOTICES.md` — made by `node scripts/notices.mjs`; `public-api.json` — by `node scripts/public-api.mjs --update`.
- `licences/texts/` — the licence texts those notices quote.
- `test-vault/.obsidian/` — the test vault's settings and plugin copies.

Search one on purpose with `rg --no-ignore PATTERN path`.
