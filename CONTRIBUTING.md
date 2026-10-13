# Contributing

How the code is written here. Every rule a tool can check is checked: by `test/conventions.test.js`, by the linter, or by
CI. A change that breaks one fails before it is merged.

## How a change is made

- **Spec, then test, then code.** Each behaviour is a requirement in the spec first. Its test is written next and seen
  to fail, and only then is the code written. A commit message says which tests were seen failing first.
- **CI proves it.** `scripts/tests-first.mjs` replays each new commit: its tests run against its parent's code, and
  every test new in the commit must fail there. A test written after its code, such as one that pins behaviour that
  already existed, has its reason in `test/seen-failing/`, or the build fails: one file for each test, written by `node
  scripts/tests-first.mjs --excuse <test file> <test> <reason>` and named after the test file and a digest of the test.
  A reason holds only `file`, `test`, `seen_failing_first`, `evidence` and, for a fault, `fault` (true) and `commits`; `--excuse` never
  overwrites one without `--force`, and its flags come before its arguments. `--excuse --fault` keeps the reason a
  recorded fault (a test that failed at its own commit) is accepted, and which commit fixed it; it names every commit
  at which the records hold the fault, so a later fault of the same test is not excused, and it refuses a fault in a file none of whose tests
  could run, which the replay did not replay at all; `--tally` and `summary` then count it as `faultsExcused`, not as
  not replayed, leaving `excused` for the passed-first reasons. `test/tests-first/` records the replays (`node scripts/tests-first.mjs --update`): one file for each
  replayed commit that changed a test, named after the commit, over `baseline.json`, the single record as it stood when
  it was split (11 Oct 2026), frozen at its head. Together they give, for each test file, what was seen failing first,
  what was excused, and what could not be replayed. CI fails a commit since the baseline that changed a test and has no
  record (`--complete`), so each commit's record is written once, on the branch that made it. A test may come a commit
  before its code: a new test failing at its own commit, and again when its file is run once more there, is recorded as
  not replayed, naming it, and `--check` warns of it. One that passes the second time, or a run that did not finish,
  fails the record, so it is run again; a fault that comes back on every run means the commit has to be rewritten
  together with its code. A test that failed at the parent is never taken for one held before: it is judged in the
  commit that makes it pass. `node scripts/tests-first.mjs --tally` is for a reader outside the repository: it writes
  nothing and prints one JSON document, with the baseline's head, the counts for each test file (replayed, not
  replayed, seen failing, excused, passed first) and every reason kept, with its file's path and its content; add
  `--repo <dir>`, first, to read another repository.
- **The records never conflict.** Two branches that replay different commits, or excuse different tests, write
  different files, and no field is rewritten by every update, so any merge, GitHub's own among them, joins them with
  nothing to resolve.
- **Pull requests are merged with a merge commit only.** A squash or a rebase merge makes new commits, so the records
  of the branch's own commits name commits main never holds, and the new ones have none.
- **A branch begun before the split** merges main once. That merge conflicts in the two old files one last time: take
  main's `test/tests-first/baseline.json` (`git checkout origin/main -- test/tests-first/baseline.json`), keep the
  branch's own `test/seen-failing.json`, then run `node scripts/tests-first.mjs --migrate`, which moves its reasons into
  `test/seen-failing/`, and `--update`, which records its commits. `--migrate` checks every reason before it writes
  any, and leaves a reason main already keeps differently as it is, naming it, for a person to choose between the two.
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
- `packages/core/test/display.test.js` — styled views and paths change only what they choose, and keep the locked hues, contrast and legend (editor spec §7).
- `packages/core/test/view-parity.test.js` — every view of the shared table (`python/graph_spec/tests/view_cases.json`) is found in its note, read, and returns the things the table gives, and every query outside the view profile gets the table's refusal (editor spec §7, views_agree_with_grafeo).
- `packages/core/test/views-across.test.js` — a view saved as shown is written in the style graph, never the data, and reopens the same (editor spec §7).
- `packages/core/test/edge-cases.test.js` — empty, broken and oversized inputs each give a stated result, never a blank or a crash (spec §9).
- `packages/core/test/edits.test.js` — every edit from the pane round-trips; locking writes a schema the checks pass.
- `packages/core/test/imports.test.js` — the core imports no host.
- `packages/claude-code/test/build.test.mjs` — the build writes the mod's hooks bundle, with no WebAssembly engine, and a render script that draws.
- `packages/obsidian/test/accessibility.test.js` — contrast in both themes, and a keyboard path for every action.
- `packages/obsidian/test/build.test.mjs` — the build writes the files the plugin is installed from.
- `packages/obsidian/test/inline.test.js` — editing in place in the drawing's card.
- `packages/graph-spec/test/characterisation.test.mjs` — the library gives the answers recorded before it moved here.
- `packages/graph-spec/test/commas.test.mjs` — both readers read a missing comma the same way, and write it into the same corrected text.
- `packages/graph-spec/test/escapes.test.mjs` — both readers read quoted text's escapes as GQL does, refuse one GQL does not name with the fix that doubles the backslash, and quote a text alike (req:3.gql-escapes; one table, `escape-cases.json`).
- `packages/graph-spec/test/layout.test.mjs` — the layout source is byte-identical to the Python library's.
- `packages/graph-spec/test/lint-parity.test.mjs` — the JavaScript dialect linter matches the Python one.
- `python/graph_spec/tests/test_changeset_header.py` — a change set's first line is read as the reader reads a block's, in the engine's copy and the rules' (lines end at LF only, whitespace is GQL's set).
- `python/graph_spec/tests/test_engine_gets_corrected.py` — every route to the engine gives Grafeo the reader's corrected text, so a link type without its colon is accepted by both parsers, and the text keeps the block's own lines (req:3.engine-gets-corrected, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_gets_commas.py` — every route to the engine gives Grafeo the reader's corrected text with each missing comma written in, at the end of the code on its line, so a block missing one loads as the profile parser reads it, and no line is added (req:3.engine-gets-commas, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_text_comments.py` — every route to the engine gives Grafeo each whole-line comment as a `/* */` comment on its own line, a `*/` in its text broken up, and a line ends at LF only (req:3.engine-keeps-comments, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_escapes.py` — the Python reader answers `escape-cases.json` as the JavaScript one does, and what the engine writes for Grafeo keeps a text's escapes (req:3.gql-escapes).
- `python/graph_spec/tests/test_id_once_engine.py` — every route to the engine reads the block with the reader first, so no id reaches it twice in a graph (req:3.engine-reads-first, req:3.id-once).
- `python/graph_spec/tests/test_ids_engine.py` — every route to the engine refuses a SET of a node's id and a node id that is not text, read by the reader first (req:3.set-keeps-id, req:3.id-is-text).
- `python/graph_spec/tests/test_layout_source.py` — the Graphviz source is the one written before the move.
- `python/graph_spec/tests/test_licences.py` — every Python package carries an allowed licence.
- `python/graph_spec/tests/test_parity.py` — the Python library gives the JavaScript library's answers.
- `python/graph_spec/tests/test_reader_agrees_with_grafeo.py` — the reader and its plain rules give Grafeo's answers, Grafeo being the reference engine and a test dependency only (req:17.engine-agreement).
- `python/graph_spec/tests/test_view_parity.py` — Grafeo, running each view of `view_cases.json` as written, returns the things the core returns, and, of a fixed list of GQL's and Cypher's words, refuses as a name and as a kind exactly the words the core keeps from them (editor spec §7, views_agree_with_grafeo).
- `python/graph_spec/tests/test_settings.py` — what a host sets after importing the library.
- `test/cheap-checks.test.js` — the quiet test run, running only a change's tests, the AI guide and the search ignore file.
- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/device-check-notes.test.js` — the device checklist numbers every item, the test vault holds one note for each item after Before in `Device checks/`, the note's checklist line is the item's words, each note's graph blocks read as it says they do (the repository's reader and checker, and `parseView` for a view), and the index lists the notes in order (editor spec §3, tried first in a test vault).
- `test/device-check-quotes.test.js` — what a device check note quotes from Obsidian's screen (a read-back, a label, the tap text of an estimate, a box's details, an export's footer and file name, the conversion notice) is computed from the note's own graph blocks with the real functions and matches exactly; the notes' generator scripts and filler set up the case they describe (editor spec §3).
- `test/engine-version.test.js` — the Graphviz version is read from the engine, named in the notices, and checked against published advisories.
- `test/github-project.test.js` — the GitHub mirror of the requirements as a person runs it: the real workstreams file puts every requirement of slices 3 and 4 in exactly one workstream and may name ids a later copy brings, and the command is a dry run by default, with no network call.
- `test/github-project-desired.test.js` — that mirror's desired state: the first clause of a rule, each issue's title, body, labels and open or closed, the marker, the project's fields and options.
- `test/github-project-gh.test.js` — that mirror applied through an in-memory stand-in for `gh`: a first apply, a second that changes nothing, drift put right, a removed requirement labelled and closed, and nothing ever deleted.
- `test/github-project-gh-safety.test.js` — that mirror's care: every call names its repository or owner, gh must point at the origin's repository, mutating calls are paced and retried once on a secondary rate limit, and a list that hit its cap is refused.
- `test/github-project-plan.test.js` — that mirror's plan: what differs between the desired state and what GitHub holds, for the issues, the labels and the project.
- `test/instruction-counts.test.js` — the benchmarks' work counted in CPU instructions: Cachegrind's output read, each case counted less its setup, the claims checked, nothing counted and said so where Valgrind is not installed, and every benchmark case still doing its work.
- `test/ignore-entries.test.js` — an entry of `.ignore` that git ignores as build output may be missing in a fresh checkout, and any other entry that names a file must exist, so a misspelt path is caught.
- `test/licences.test.js` — licences through the whole build chain, and the one allowance for a GPL tool run in CI alone and never shipped.
- `test/offline.test.js` — the bundled engine makes no network request.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI.
- `test/public-readiness.test.js` — fit to be public and kept so: a clean history, a fresh clone set up from the README alone, and GitHub settings that let only a collaborator contribute.
- `test/quality-metrics.test.js` — the quality metrics are held to a committed baseline, and a worse one fails without a recorded reason.
- `test/quality-baseline.test.js` — the baseline cannot be loosened without a reason, is whole, and says which machine measured it.
- `test/quality-instructions.test.js` — the instruction counts in the ratchet: one metric for each benchmark, with a small tolerance, held only against counts from the same machine; not measured where Valgrind cannot run, which fails only on Linux; recorded and printed until the baseline holds them; a claim that does not hold failing always; test duration only warning.
- `test/quiet-reporter.test.js` — the quiet test run when a failure's details cannot be passed on, as when an assertion holds a function: every failure still reported, the run failed, never crashed.
- `test/run-ceiling.test.js` — every run of the npm test commands, in CI too, is stopped with one line at a memory or time ceiling, before a runaway test can exhaust the machine; a run within both passes through unchanged.
- `test/requirements.test.js` — the generated requirements copy: started requirements proved, tests where they say.
- `test/slice-board-style.test.js` — the slice board's stylesheet: colour tokens that agree in light and dark, the altitude switch by CSS alone, a layout that holds at 400px, and the source written one rule and one declaration to a line.
- `test/slice-board.test.js` — the slice board: a CSS-only HTML page of how far the slice under way is proved, from the requirements copy and, optionally, the open pull requests.
- `test/speed-index.test.js` — the one measure of a machine's speed, which the quality metrics record and scale their timings by: fixed plain work, the least of seven runs.
- `test/timed-assertions.test.js` — a test asserts the work done, never the time taken: no JavaScript test or its support asserts a span of elapsed time; a polling deadline, mock timers and a clock handed to the code tested are allowed.
- `test/test-vault.test.js` — the test vault: dummy notes tied to requirements, nothing Obsidian writes committed, each session clean.
- `test/tests-first.test.js` — every test is seen to fail before its code, replayed commit by commit: how a replay judges a new test.
- `test/tests-first-command.test.js` — that replay's command line, run as CI and a person run it: `--check`, `--excuse` and `--migrate`.
- `test/tests-first-complete.test.js` — that command line's `--complete`: a commit that changed a test and has no record fails, until `--update` records it.
- `test/tests-first-failing.test.js` — that replay when a new test fails at its own commit: kept in the record as not replayed, or, when it passes run again, a failure of the record.
- `test/tests-first-faults.test.js` — `--excuse --fault` keeps the reason a test failed at its own commit, only for a test the records hold as a fault; `--tally` and `summary` count it as `faultsExcused`, not as not replayed, and `--check` does not warn of it.
- `test/tests-first-keeping.test.js` — that replay when something at the commit's own code cannot be trusted: a commit that cannot be replayed, a record updated over what it holds.
- `test/tests-first-later.test.js` — that replay when the test and its code do not come together: a test corrected later, one that comes before its code, a new file whose code is not there yet, test support changed with it.
- `test/tests-first-passed.test.js` — that replay when a new test passes against the code before it: reported, unless a reason is kept, and never excused by a name every object has.
- `test/tests-first-python.test.js` — that replay over a Python test, and a failure inside a subTest read as a failure.
- `test/tests-first-records.test.js` — the records of that replay: a file for each commit, so two branches never conflict in them.
- `test/tests-first-records-history.test.js` — this repository's own records: the old single files' entries all held, each record named after a commit in the history, every test file with its entry.
- `test/tests-first-records-merged.test.js` — those records when branches meet: two branches merged with nothing to resolve, and the old single files moved over whole.
- `test/tests-first-records-reasons.test.js` — the reasons kept for a test that passed before its code: a file for each, named after its test file and its test.
- `test/tests-first-tally.test.js` — that replay's `--tally`: what the records prove as JSON, and writes nothing.
- `test/tests-first-unfinished.test.js` — that replay when a run of a test file does not finish: stopped at the time limit, it proves nothing.
- `test/tests-first-run.test.js` — one run of one test file in that replay: what its report shows, and why it did not finish.
- `test/whitespace.test.js` — the three copies of the one whitespace set are the same, and the set is openGQL's.

## The requirements in a GitHub Project

- **One way only.** `requirements/editor-requirements.gql` stays the only source. `scripts/github-project.mjs` mirrors it
  into a GitHub Project titled "graph-note requirements", one issue for each requirement of the chosen slices
  (`--slices 3,4` by default). The issues and project items are derivatives: regenerated, never edited by hand, and each
  opens on its rule, then a do-not-edit banner. Its title is the requirement's section, a dot and the id's words.
- **Where each requirement goes.** `requirements/workstreams.json` maps a workstream id to its title and its requirement
  ids; a requirement it does not list falls to `S3`, and an id the current copy does not hold yet is fine. An issue
  carries the labels `slice-N`, `workstream:<id>` and `status:open|part|proved`, and is closed when proved. Its status
  is the one the slice board reads. The project's fields are Slice, Workstream and Proof (open, part, proved); its
  built-in Status field is never touched.
- **See the plan with `npm run project:plan`.** It is a dry run and makes no network call, so it compares with an empty
  GitHub. `--check` reads GitHub and prints the real diff, changing nothing. `--apply` prints the same plan, then does
  it with `gh`: it finds each issue by its hidden `<!-- requirement:<id> -->` marker, changes only what differs, and
  never deletes (an issue whose requirement went is labelled `requirement:removed` and closed, with a comment). There
  is no apply script and no workflow: applying needs a token with the `project` scope, which the owner adds by hand.
- **Only what it made is its own.** An issue is adopted only when the signed-in login wrote it, its body has the
  generated banner, and its marker is the last thing in it; a marker anyone else writes is warned of and ignored, and an
  issue whose banner or closing marker was edited away is no longer ours, so a new one is made. `--apply` stops, unless
  `--allow-removals` is given, when the requirements file holds no requirements or the plan removes more than 10 issues.
- **It goes only where this checkout's origin says.** `gh` runs in the repository folder with `GH_REPO` and `GH_HOST`
  removed, must point at the origin's repository or the run stops, and names the repository (`--repo`) or the owner
  (`--owner`) on every call. Calls that change something are paced about a second apart and tried once more after a
  secondary rate limit; a list that comes back as long as its cap is refused. An origin on any host but github.com is
  refused, and an error never repeats a login or token from the remote.
- **Always apply as the same GitHub login.** Issues are adopted only when the signed-in login wrote them, so if the login
  changes between runs, earlier issues are not adopted and the script would create duplicates.
- **The project is dedicated to the script.** Changing the options of Slice or Workstream replaces them in GitHub, which
  clears the value on every item, and the script sets the values again on the items it manages. A value on an item the
  script does not manage would be lost, so keep nothing else in this project.

## The quality ratchet

- **Every release measures the code** (spec §12): `node scripts/quality-metrics.mjs --out quality/metrics.json` writes
  file sizes, an `npm audit` count, a secrets scan, the bundle's size, the work a fixed set of benchmarks takes, counted
  in CPU instructions and never in elapsed time, the suite's duration, its flaky tests, the size of a passing quiet run
  and coverage. It runs the suite twice, so it is the release's job.
- **`quality/baseline.json` is what each is held to,** by `node scripts/quality-check.mjs quality/metrics.json`. A metric
  that got worse fails the release, unless `quality/accepted.json` gives a reason for that change: the metric, its
  baseline value (`from`), the value it may reach (`to`), why, and the day. Counts of files, findings and bytes carry no
  tolerance. Test duration is reported as a warning only, scaled by how fast the machine measured itself, never
  enforced. The quick ones (file sizes, secrets) also run in CI and in `test/quality-metrics.test.js`.
- **Speed is the work the benchmarks take, in instructions** (Roger, 12 Oct 2026). `scripts/benchmarks/` holds a small,
  fixed set, each a deterministic piece of work with the claims it proves: 50 things drawn (`draw_fifty`, within half a
  second's instructions on a phone), the worst reads at the size limits (`reading_limits`, within the budget of reading
  again), the refusals of `layout_contained` (`layout_refusals`), naming thousands of things linearly (`naming`), and a
  keystroke reaching the note (`keystroke`, read-back costing less than reading). A claim between two sizes or two
  cases is a ratio of instruction counts, so it is exact on every run. Each setup first runs its cases' code once,
  small, so a first compile is never inside a ratio. `node scripts/instruction-counts.mjs` runs each case, and its
  setup alone, in a process of its own under Valgrind's Cachegrind (`--cache-sim=no`), as many at once as there are
  cores, with Node pinned to one thread, V8's predictable mode, a fixed collector schedule and one random seed, and
  keeps each case less its setup; a case that counts nothing beyond its setup fails the run. It runs on Linux only, in
  the release, its dry run and the "Quality baseline" workflow, on `ubuntu-24.04` with Node pinned exactly (a patch
  can move the counts; none of them may set `GITHUB_ACTIONS`), which install Valgrind; it does not
  run on Apple-silicon Macs. Where Valgrind is missing it says so in one line and counts nothing: on any machine but
  Linux that only warns, and the fast check never asks. A count may grow by 5% before it fails
  (`INSTRUCTION_TOLERANCE`), held only against counts from the same machine (operating system, processor, Node major
  and Valgrind, the full Node version and the CPU said with them); a claim that does not hold always fails, and no
  reason can waive it. Until the baseline holds the counts, a run that counts them prints them, with the machine, for a
  follow-up pull request to commit: outside CI it passes on them; in CI (`GITHUB_ACTIONS`) it fails after printing
  them, and fails too when the baseline's were counted on another machine, as its job then is only to print them.
- **Counting on your own machine:** `npm run bench:local` (Docker running) builds `docker/benchmarks.Dockerfile`, a
  Linux image with Node 24 and Valgrind, its base pinned by digest, and runs `scripts/instruction-counts.mjs` in it with
  any of its arguments (`-- --only naming`, `-- --runs 3`). It is for counts before and after a change on one machine,
  as Valgrind cannot run on Apple-silicon macOS. The repository is mounted, not copied, and `node_modules` is a
  container volume of each checkout's own, so the host's is untouched and worktrees never share one. The base image's
  age is its digest's own creation date, recorded in the Dockerfile and held to 7 days before it was pinned. On a Mac it counts ARM Linux's instructions: they are never
  compared with CI's x86-64 baseline. A full count takes about two and a half minutes on a 10-core Mac.
- **Valgrind is GPL-3.0, allowed as a tool run in CI alone and never shipped** (spec §13, build_tool_licences):
  `licences/bundled.json`'s `ciOnlyTools` names it, and `test/licences.test.js` holds that nothing bundled, nothing
  inside what is bundled and nothing in `node_modules` can be on that list, and that only the jobs and the
  developer-only image it names install it, each with `--no-install-recommends`.
- **To move the baseline,** after a change is wanted, run the metrics script with `--out quality/baseline.json` on a
  passing suite, and commit it. The baseline is held against its own earlier copy (`quality-check.mjs --baseline-since
  <ref>`, run in CI and in the release): a metric that got worse in it needs an entry in `accepted.json` too, a count of
  secrets can never be waived, and a baseline with a metric missing or tests left out is refused.
- **Check before tagging.** Run the "Release check (dry run)" workflow by hand on main before a release is tagged: it
  runs the jobs the release waits on (the quality job and public readiness), step for step and with the same
  workflow-wide settings as `release.yml`, and releases nothing, so a failure there costs no version number.
  `test/quality-baseline.test.js` holds the two the same.
- **A test asserts the work done, never the time taken** (Roger, 12 Oct 2026). The suite's second run has coverage on,
  which slows the core's code unevenly, on a runner slower than a desktop, so no number of milliseconds holds there. A
  test counts the work where the requirement is work (a text never read, a block read again only within its budget),
  with a control showing the count sees the work when it is done. Speed itself is the benchmarks' instruction counts;
  `scripts/timed-assertions.mjs`, run by `test/timed-assertions.test.js`, fails any assertion on a span of elapsed time
  (a polling deadline in a loop that awaits, and Node's mock timers, are allowed).
- **A baseline from the CI runner:** run the "Quality baseline" workflow by hand, download its `quality-metrics`
  artifact, and commit its `metrics.json` as `quality/baseline.json` in a normal pull request. The same artifact's
  `instruction-spread.json` counts every benchmark three times: its `largest_spread` is how far a count moved between
  runs there, which the tolerance must stay well above.
- **The Graphviz inside the engine is watched** (spec §13): `node scripts/engine-version.mjs` reads its version from the
  engine, checks the notices name it, and checks `quality/advisories.json` offline (it warns when the cache was last
  checked over 14 days ago). Only `--refresh` and `--watch` ask: OSV and NVD for Graphviz, merged, and OSV for the
  package that wraps it. The release's quality job refreshes and checks. The "Engine advisories" workflow, run by hand
  (its weekly schedule is off until the public release), is read-only: it fails when the published advisories differ
  from the committed cache, and then someone runs `--refresh` and opens a pull request. The plugin never asks.
