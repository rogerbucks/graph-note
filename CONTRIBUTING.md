# Contributing

How the code is written here. Every rule a tool can check is checked: by `test/conventions.test.js`, by the linter, or by
CI. A change that breaks one fails before it is merged.

## How a change is made

- **Spec, then test, then code.** Each behaviour is a requirement in the spec first. Its test is written next and seen
  to fail, and only then is the code written. A commit message says which tests were seen failing first.
- **CI proves it.** `scripts/tests-first.mjs` replays each new commit: its tests run against its parent's code, and
  every test new in the commit must fail there. A test written after its code, such as one that pins behaviour that
  already existed, is listed in `test/seen-failing.json` with the reason, or the build fails. `test/tests-first.json`
  records the replays (`node scripts/tests-first.mjs --record`): for each test file, what was seen failing first, what
  was excused, and what could not be replayed.
- **The gate before every commit:** `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test`, plus
  `ruff check` and `ruff format --check` when the Python library changed. CI runs them all again.
- **Cheap checks while working.** `npm run test:ai` runs the suite quietly (one line when all pass, and for a failure
  only its file and line, name, short expected and actual, and the first stack frame in our code); `npm run
  test:changed` runs only the tests of the modules the change touches, found by the naming under "Tests mirror the
  code", and the whole suite when something shared changed; `npm run test:ai:py` does the same for the Python library.
  They are for working: `npm test` and the gate above still run in full before every merge, and in CI. `AGENTS.md` is
  the short guide for AI sessions, and `.ignore` keeps generated and bulky files out of code searches.
- **A large or risky change goes through a pull request**, and is merged only once CI passes on it. That means one that
  touches many files, changes a library both languages share, or changes the build, CI or dependencies. The biggest are
  reviewed before merging. A small, contained change may be committed straight to `main` once the gate passes.
- **UK spelling** in code, comments, messages and the interface.

## Obsidian’s guidelines

The plugin store's own linter (`eslint-plugin-obsidianmd`, run by `npm run lint` with no warnings allowed) checks most
of Obsidian's rules, sentence case in the interface among them. These are the guidelines it does not check:

- **Styles use the theme variables**, such as `var(--text-normal)` or `var(--color-orange)`, never a fixed colour. Every
  selector in `styles.css` is scoped by one of the plugin's own classes, `graph-note-*` or `gql-*`.
- **No inline styles and no HTML strings.** Classes from `styles.css`, `setCssProps` for values that change, and
  Obsidian's DOM helpers (`createEl`, `createDiv`), never `innerHTML`.
- **Every listener is registered.** Listeners on the app, the workspace, the window or the document go through
  `registerEvent` or `registerDomEvent`, so they go when the plugin does. A listener on an element the plugin made goes
  with the element.
- **Every timer is registered or cleared.** Intervals go through `registerInterval`. A timeout kept on a component is
  cleared with `clearTimeout` in its `onunload`. Timers are the window's (`window.setTimeout`), as the linter asks.
- **The vault changes only through its API.** Never the file system or the adapter. A note is changed with
  `vault.process`, so the change is made atomically against the note as it is now.
- **The app is `this.app`**, never the global `app`.
- **No network requests.** The one future exception is spec §13's: sending to an AI or a database the user has set up,
  only when the user sends or imports.

## Code style

- **One formatter for each language.** Prettier for JavaScript, TypeScript, CSS, JSON and YAML (`.prettierrc.json`:
  120 characters, single quotes). Ruff for Python. Run `npx prettier --write .` and, in `python/graph_spec`,
  `uv run --locked ruff format`. CI runs `npm run format:check` and `ruff format --check`.
- **TypeScript is strict** in every package (`"strict": true`). The core is written in erasable TypeScript only, so
  Node runs its tests with no build.
- **The Python library follows PEP 8**, checked by `ruff check` (rules E, W, F and N, with lines up to 99 characters,
  the most PEP 8 allows by agreement). A `# noqa` is allowed only with its reason on the same line.
- **Tools are pinned exactly**, carry a licence on the allow-list, run no install scripts, and are taken only once a
  release is at least 7 days old.

## Naming

- **Files:** kebab-case for JavaScript and TypeScript (`block-editor.ts`), snake_case for Python (`graph_svg.py`).
- **Types, interfaces and classes:** PascalCase (`GraphView`, `NoteReading`).
- **Functions, methods, variables and parameters:** camelCase (`readNote`, `linkInBlock`). A parameter that is not used
  starts with `_`.
- **Constants:** UPPER_SNAKE (`WRITE_AFTER_MS`), at module level only. Inside a function every name is camelCase.
- **Python:** snake_case for functions, variables and modules; PascalCase for classes; UPPER_SNAKE for constants.
- **Tests are named after their file:** `zoom.ts` is tested by `zoom.test.js`, and `graph_svg.py` by
  `test_graph_svg.py`. A name may add the aspect tested after a hyphen (`layout-parity.test.js` tests `layout.ts`). A
  test of behaviour that spans several modules is named after its subject and listed below.

## Layout

- **Each package keeps its code in `src/` and its tests in `test/`.** The Python library uses `src/` and `tests/`, as
  Python's tools expect. Tools that run from the command line go in `bin/`; the browser harness in `harness/`.
- **One module, one purpose.** Each module opens with a comment saying what it is for, and which part of the spec.
- **The public interface is documented where it is declared:** every export has its own comment, directly above it.
- **The core is host-free:** it imports no Obsidian, editor or Node module, so it runs on a phone and, later, in VS Code.
- **Small modules, one responsibility each, in folders named for their feature** (spec §13, "No monolith files"): no
  source file over 400 lines, and no test file over 600, checked in CI. A split follows responsibilities, never line
  counts.
- **Named so a search by name finds it:** folders and files are named for the feature they hold, never `utils`, `misc`,
  `helpers`, `common` or `lib`.
- **Each package has a short `GUIDE.md`** saying where things live, naming every folder of its source, and it changes
  in the same commit as the code it describes.
- **Small, typed interfaces:** a module exports a few typed things, so it can be used without reading its inside. In
  Python, every public function has its docstring and type hints.
- **A package's entry points stay put:** the modules other code and the vault import (`gql_profile.py`,
  `graph_rules.py`, `graph_spec.py`, `graph_svg.py`, `graph-spec-check.js`, the core's `index.ts`) re-export the smaller
  modules, so a split never breaks a caller. The released `graph-spec-check.js` is built into one file and never edited
  by hand.
- **Tests mirror the code:** a module's tests sit in a file named after it, and each test file runs on its own in
  seconds. A test moved between files keeps its name, so the tests-first record knows it is not new.

## Tests that span modules

These test behaviour across modules, or the repository itself, so they are named after their subject:

- `packages/core/test/abuse.test.js` — no sequence of edits or text crashes the viewer (spec §12).
- `packages/core/test/edits.test.js` — every edit from the pane round-trips; locking writes a schema the checks pass.
- `packages/core/test/imports.test.js` — the core imports no host.
- `packages/obsidian/test/accessibility.test.js` — contrast in both themes, and a keyboard path for every action.
- `packages/obsidian/test/build.test.mjs` — the build writes the files the plugin is installed from.
- `packages/obsidian/test/inline.test.js` — editing in place in the drawing's card.
- `packages/graph-spec/test/characterisation.test.mjs` — the library gives the answers recorded before it moved here.
- `packages/graph-spec/test/commas.test.mjs` — both readers read a missing comma the same way.
- `packages/graph-spec/test/layout.test.mjs` — the layout source is byte-identical to the Python library's.
- `packages/graph-spec/test/lint-parity.test.mjs` — the JavaScript dialect linter matches the Python one.
- `python/graph_spec/tests/test_layout_source.py` — the Graphviz source is the one written before the move.
- `python/graph_spec/tests/test_licences.py` — every Python package carries an allowed licence.
- `python/graph_spec/tests/test_parity.py` — the Python library gives the JavaScript library's answers.
- `python/graph_spec/tests/test_settings.py` — what a host sets after importing the library.
- `test/cheap-checks.test.js` — the quiet test run, running only a change's tests, the AI guide and the search ignore file.
- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/engine-version.test.js` — the Graphviz version is read from the engine, named in the notices, and checked against published advisories.
- `test/licences.test.js` — licences through the whole build chain.
- `test/offline.test.js` — the bundled engine makes no network request.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI.
- `test/quality-metrics.test.js` — the quality metrics are held to a committed baseline, and a worse one fails without a recorded reason.
- `test/quality-baseline.test.js` — the baseline cannot be loosened without a reason, is whole, and says which machine measured it.
- `test/requirements.test.js` — the generated requirements copy: started requirements proved, tests where they say.
- `test/test-vault.test.js` — the test vault: dummy notes tied to requirements, nothing Obsidian writes committed, each session clean.
- `test/tests-first.test.js` — every test is seen to fail before its code, replayed commit by commit.

## The quality ratchet

- **Every release measures the code** (spec §12): `node scripts/quality-metrics.mjs --out quality/metrics.json` writes
  file sizes, an `npm audit` count, a secrets scan, the bundle's size, the time to draw 50 things, the suite's duration,
  its flaky tests, the size of a passing quiet run and coverage. It runs the suite twice, so it is the release's job.
- **`quality/baseline.json` is what each is held to,** by `node scripts/quality-check.mjs quality/metrics.json`. A metric
  that got worse fails the release, unless `quality/accepted.json` gives a reason for that change: the metric, its
  baseline value (`from`), the value it may reach (`to`), why, and the day. Timings carry a tolerance and are scaled by
  how fast the machine measured itself; counts carry none. The quick ones (file sizes, secrets) also run in CI and in
  `test/quality-metrics.test.js`.
- **To move the baseline,** after a change is wanted, run the metrics script with `--out quality/baseline.json` on a
  passing suite, and commit it. The baseline is held against its own earlier copy (`quality-check.mjs --baseline-since
  <ref>`, run in CI and in the release): a metric that got worse in it needs an entry in `accepted.json` too, a count of
  secrets can never be waived, and a baseline with a metric missing or tests left out is refused.
- **Timings are enforced only on the machine the baseline came from** (same operating system and Node major, recorded in
  it). Elsewhere they warn. To get a baseline from the CI runner, run the "Quality baseline" workflow by hand, download
  its `quality-metrics` artifact, and commit it as `quality/baseline.json` in a normal pull request.
- **The Graphviz inside the engine is watched** (spec §13): `node scripts/engine-version.mjs` reads its version from the
  engine, checks the notices name it, and checks `quality/advisories.json` offline (it warns when the cache was last
  checked over 14 days ago). Only `--refresh` and `--watch` ask: OSV and NVD for Graphviz, merged, and OSV for the
  package that wraps it. The release's quality job refreshes and checks. The "Engine advisories" workflow, run by hand
  (its weekly schedule is off until the public release), is read-only: it fails when the published advisories differ
  from the committed cache, and then someone runs `--refresh` and opens a pull request. The plugin never asks.
