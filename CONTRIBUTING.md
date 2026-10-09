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
- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/licences.test.js` — licences through the whole build chain.
- `test/offline.test.js` — the bundled engine makes no network request.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI.
- `test/tests-first.test.js` — every test is seen to fail before its code, replayed commit by commit.
