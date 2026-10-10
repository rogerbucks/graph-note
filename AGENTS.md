# Guide for AI sessions

Short on purpose. How to check your work cheaply, where things live, and what not to read.

## Run the tests cheaply

- `npm run test:ai` — the whole JavaScript suite, quietly. One line when all pass (`ok 693 tests`). For each failure:
  `file:line  name`, a short expected and actual (cut at 200 characters), and the first stack frame in our code. Tests'
  own logging is dropped.
- `npm run test:changed` — only the tests of the modules you changed (`zoom.ts` runs `zoom*.test.js`), quietly. It
  runs the whole suite and says why in one line when you changed something shared, such as `index.ts`, `package.json`
  or test support. `npm run test:changed -- --list` shows the plan without running it.
- `test:changed` follows test naming inside a package: a core change can affect plugin tests, so run the full suite
  before a merge.
- `npm run test:ai:py` — the Python library's tests, quietly (needs `uv`). Add test file names to run only those.
- One test file: `npm run test:ai -- path/to/file.test.js`. Add `-s` (`npm run -s test:ai`) to hide npm's own banner.

## Before a merge: the full commands

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` and `node scripts/check-classification.mjs --all`;
in `python/graph_spec` also `uv run --locked ruff check`, `ruff format --check` and
`python -m unittest discover -s tests`. CI runs all of them, and the full suite is never skipped.

On a CI failure, read only the failed job's log: `gh run view <id> --log-failed`. Not the whole run.

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
- `test/tests-first.json` — the record of tests seen failing first; `node scripts/tests-first.mjs --update` writes it.
- `THIRD_PARTY_NOTICES.md` — made by `node scripts/notices.mjs` from `licences/bundled.json`.
- `licences/texts/` — the licence texts those notices quote.
- `test-vault/.obsidian/` — the test vault's settings and plugin copies.

Search one on purpose with `rg --no-ignore PATTERN path`.
