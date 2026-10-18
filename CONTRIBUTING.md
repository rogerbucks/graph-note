# Contributing

How the code is written here. Every rule a tool can check is checked: by `test/conventions.test.js`, by the linter, or by
CI. A change that breaks one fails before it is merged.

## How a change is made

- **Spec, then test, then code.** Each behaviour is a requirement in the spec first. Its test is written next and seen
  to fail, and only then is the code written. A commit message says which tests were seen failing first.
- **The requirements are edited here.** `requirements/editor-requirements.gql` is the one source of the requirements,
  changed in a pull request like any file; no vault holds them (Roger, 16 Oct 2026). Once graph notes can hold it, the
  graph moves into one.
- **A test in the requirements copy has one of three statuses.** `planned`: no file yet. `partial`: the file is there
  but does not yet prove every rule its record covers, as when several workstreams add cases to one shared file over
  time. `written`: it proves them all. A `partial` or `written` test must have its file; a `planned` test whose file is
  there is refused. A requirement is proved only when a test proving it is `written`: a `partial` one leaves it
  unproved, `check-requirements.mjs --done` lists it with "partial" in the reason, and the slice board counts it as
  part, in progress, never proved. A test moves only forward: planned to partial, partial to written, or planned to
  written; the flip check refuses every backward move, and a flip to `partial` needs the file. A flip to `partial`
  moves no requirement in the build status: only a test newly `written` does, so nothing is Merged or Released on a
  partial test.
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
  test:changed` runs only the tests the change reaches, found by the naming under "Tests mirror the code" and by
  the import graph (`scripts/import-graph.mjs`: every test that imports a changed file, directly or through others, or
  names it to build), and the whole suite when something shared changed; `npm run test:ai:py` does the same for the Python library.
  They are for working: `npm test` and the gate above still run in full before every merge, and in CI. `AGENTS.md` is
  the short guide for AI sessions, and `.ignore` keeps generated and bulky files out of code searches.
- **A large or risky change goes through a pull request**, and is merged only once CI passes on it. That means one that
  touches many files, changes a library both languages share, or changes the build, CI or dependencies. The biggest are
  reviewed before merging. A small, contained change may be committed straight to `main` once the gate passes.
- **UK spelling** in code, comments, messages and the interface.

## Signing off your work

Every commit in a pull request ends with a line that says the person who made it has the right to send it under the
project's licence, as the [Developer Certificate of Origin](https://developercertificate.org) sets out:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it. It is how a fork or a pull request stays clear about who wrote what, and it keeps the project
free to stay under the [Mozilla Public License 2.0](LICENSE). People who take part follow the
[code of conduct](CODE_OF_CONDUCT.md), and a fork goes by its own name ([TRADEMARKS.md](TRADEMARKS.md)).

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
- **No network requests,** with one exception (spec §13, §19): a send to an AI model the user has set up, only when the
  user sends it, made by `packages/obsidian/src/ai/send.ts` alone with Obsidian's `requestUrl`, never an SDK, and
  reached only from the send dialog. No databases and no remote images.

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
  Python's tools expect. Tools that run from the command line go in `bin/`; the browser harness in `harness/`; the
  Claude Code editor's local server, which runs in Node, in `packages/claude-code/server/`, held to the same naming,
  size and comment rules as `src/`.
- **One module, one purpose.** Each module opens with a comment saying what it is for, in a sentence of at least five
  words, and which part of the spec.
- **The public interface is documented where it is declared:** every export has its own comment, directly above it. In
  `packages/graph-spec`, whose modules are CommonJS, that is every name in `module.exports`, at its declaration.
- **The core is host-free:** it imports no Obsidian, editor or Node module, so it runs on a phone and, later, in VS Code.
- **Small modules, one responsibility each, in folders named for their feature** (spec §13, "No monolith files"): no
  source file over 400 lines, and no test file over 600, checked in CI. A split follows responsibilities, never line
  counts.
- **Named so a search by name finds it:** folders and files are named for the feature they hold, never `utils`, `misc`,
  `helpers`, `common` or `lib`.
- **The README's "How the packages fit"** names every package, its layer and its guide, so a reviewer sees the whole
  before the parts.
- **Each package has a short `GUIDE.md`** saying where things live, naming every folder of its source, and it changes
  in the same commit as the code it describes.
- **Small, typed interfaces:** a module exports a few typed things, so it can be used without reading its inside. In
  Python, every public module, class, method and function has its docstring (Ruff's D1 rules check it) and type hints.
- **A package's entry points stay put:** the modules other code and the vault import (`gql_profile.py`,
  `graph_rules.py`, `graph_spec.py`, `graph_svg.py`, `graph-spec-check.js`, the core's `index.ts`) re-export the smaller
  modules, so a split never breaks a caller. The released `graph-spec-check.js` is built into one file and never edited
  by hand.
- **Tests mirror the code:** a module's tests sit in a file named after it, and each test file runs on its own in
  seconds. A test moved between files keeps its name, so the tests-first record knows it is not new.

## Tests that span modules

These test behaviour across modules, or the repository itself, so they are named after their subject:

- `packages/core/test/abuse.test.js` — no sequence of edits or text crashes the viewer (spec §12).
- `packages/core/test/bidi-labels.test.js` — each element of the display layer that shows the person's own names, labels or values is read from its first strong letter and set apart from the words around it (`unicode-bidi: plaintext`), and each is an element the layer makes (editor spec §42, bidi_labels; partial until the drawing and the exports join it).
- `packages/core/test/display.test.js` — styled views and paths change only what they choose, and keep the locked hues, contrast and legend (editor spec §7).
- `packages/core/test/view-parity.test.js` — every view of the shared table (`python/graph_spec/tests/view_cases.json`) is found in its note, read, and returns the things the table gives, and every query outside the view profile gets the table's refusal (editor spec §7, views_agree_with_grafeo).
- `packages/core/test/views-across.test.js` — a view saved as shown is written in the style graph, never the data, and reopens the same (editor spec §7).
- `packages/core/test/edge-cases.test.js` — empty, broken and oversized inputs each give a stated result, never a blank or a crash (spec §9).
- `packages/core/test/edits.test.js` — every edit from the pane round-trips; locking writes a schema the checks pass.
- `packages/core/test/proposals-checked.test.js` — a proposal is run through the graph spec's own change-set check and the answer shown; every proposal written, removals and decisions included, passes it; a removal is a DELETE, a change of a value a SET, and a change's id is derived from its statement; a decision is kept as a Decision in the note's judgement graph, a rejected addition leaves the live graph, and the decider is the settings' text as typed or "you" (editor spec §17, proposals_checked, decider_named; the graph spec's cs-rejected-out).
- `packages/core/test/undo-over-theirs.test.js` — undo never undoes over a change another program, a sync or another pane made to the block: the history starts again from the note as it now is, Undo and Redo say why there is nothing to take back, and a change elsewhere in the note leaves undo working (editor spec §9, undo_never_over_theirs; §26, cc_undo_safe).
- `packages/core/test/undo-one-block.test.js` — undo stays in its block: switching the pane to another block starts that block's own history, so Undo and Redo never write one block's text into another, and a reason that held for the block left is not given for the one chosen (editor spec §9, undo_stays_in_its_block).
- `packages/core/test/block-copy.test.js` — the block followed, not its copy: after another program pastes a copy of the open block and then edits the original, the session keeps to the original, so Undo never reverts the copy while their edit survives; a copy it cannot tell from the block stops it, every write and Undo refused saying so, until a block is chosen again (editor spec §9, block_followed_not_its_copy).
- `packages/core/test/notes-export.test.js` — each data export keeps the `///` notes where its format has comments, a GQL block's `///` lines and GraphML's XML comments, read back as written however hostile, and leaves them out of CSV, which has none; the text an engine is given keeps them too (editor spec §24, note_standard).
- `packages/core/test/imports.test.js` — the core imports no host.
- `packages/claude-code/test/build.test.mjs` — the build writes the mod's hooks bundle, with no WebAssembly engine, and a render script that draws.
- `packages/claude-code/test/editor-threats.test.js` — the browser editor's server against its threat model, each threat tried on the running server: loopback only, wrong Host, wrong Origin, no token or a wrong one, a token in the address, a stale write, an oversized body, the content security policy, no CORS, a path escape on the test-only note route, the server's own limits, no outgoing request, and the idle stop (editor spec §26, test_cc_threats).
- `packages/claude-code/test/editor-threats-process.test.js` — the same threat model tried on the server's process: no argument taken, the token handed over once and kept nowhere, no start when orphaned, and every way the process stops (editor spec §26, test_cc_threats).
- `packages/claude-code/test/editor-export.test.js` — the browser editor's export written by the server (editor spec §26, test_cc_export): only new files in the export folder, never over a file or through a link, a name only a name, all of an export or none, and the token, Host, Origin and body limit of every change.
- `packages/claude-code/test/editor-page.test.js` — the browser editor's page (editor spec §26; test_cc_page): cc_core_only (C4), accessibility and motion (C8, `editor-page-access.js`: the skip link, menus walked by the arrow keys, an accessible name on every control, the keyboard kept in place across a redraw, a visible focus, reduced motion stills the page, and the text version present and kept in step with the note), and the host shell (C5: one Markdown renderer with raw HTML off, text shown as text, layout in a same-origin worker, the theme, icons as image files, offline, settings read only), that the page takes everything from the core and the display layer shared with the Obsidian host (`packages/core/src/display/`) and imports no Obsidian code, tried on the layer's imports, on a bundle of the page's side, and on the layer run through a plain host with no Obsidian in the process; and editing (C9, `editor-page-editing.js`, over `editor-page-live.js`, the page as built run in a DOM against the real server and a vault on disk): the page opens the note with the drawing inline, its details and the edit pane of the Obsidian host (the layer's `display/editor/`, the plugin keeping only its vault note), the drawing's colours set through the CSSOM so no style attribute or sheet reaches the parser under the policy as it was, what is typed written by the server and drawn again, Undo and Redo, a block changed on disk meanwhile never overwritten and kept as a draft, Undo never over another program's change, and nothing written while the note is above the gate.
- `packages/claude-code/test/editor-parity.test.js` — the same edit writes the same bytes in the browser editor's session and in Obsidian's edit pane, Undo and Redo too, and a decision on a proposal through the page's card against Obsidian's strip, over shared cases (editor spec §26, cc_same_bytes; test_cc_parity). C9 adds (`editor-parity-page.js`) every kind of edit the pane makes, made on the page as built and in the plugin's pane, byte for byte: typing, a fix, a suggestion, Undo and Redo, Lock the graph, an estimated link's quick fix from the drawing, another block chosen, the note changed elsewhere first, and a stale write.
- `packages/claude-code/test/editor-mod.test.js` — `/graph edit` from the mod, tried on the launcher over real server processes started as the host starts one: the address handed to the pane alone and never to the conversation, a start that fails said plainly, one server for each session, and the server stopped by the session ending, `/graph stop` and its own end (editor spec §26; test_cc_mod, partial until C7 adds its cases; C3's gate cases are in it).
- `packages/core/test/hosts-boundary.test.js` — the host-side modules of the core (`src/hosts/`, reached as `@graph-note/core/hosts/<module>`) are imported by no gate or other core module, are not exported by the entry, and import only types from the core (editor spec §19, model_ceiling).
- `packages/claude-code/test/editor-mod-matrix-links.test.js` — a matrix note whose real path is outside the vault, by a link on the note or a folder above it, is not read, nor one the host cannot place; the server is handed the same refusal; and the real path asked of a host that can only start a process (editor spec §26, cc_classified_asks; §19, model_ceiling).
- `packages/claude-code/test/editor-mod-matrix.test.js` — Claude's level from the destination matrix in the mod and the server: the mod reads the matrix note from inside the vault only, hands the server the row, switches, class names and rows, and both gates give the same answer on the same inputs and fail closed alike when the note cannot be read (editor spec §26, cc_classified_asks; §19, model_ceiling).
- `packages/claude-code/test/editor-mod-claude.test.js` — Claude is the only AI the browser editor offers, and what it changes in the note open in the pane reaches it as a proposal through the mod: a checked change set the user accepts or rejects, written by the store whole and in turn, never applied by Claude, its key good for that one route, and refused for a note above its clearance (editor spec §26; cc_claude_only, cc_claude_proposes).
- `packages/claude-code/test/editor-mod-claude-limits.test.js` — what the security review of #483 found: a proposal cannot grow the note without limit (its size, a value's and a reason's length, how many wait), the proposer's key is passed on standard input and not in the environment, Claude's own text never carries the user's yes, and what it says it read is one line (editor spec §26; cc_claude_proposes).
- `packages/claude-code/test/editor-mod-gate.test.js` — the gate's hardening from the review of #475, tried on the launcher: only the person typing in the composer can say yes, and the yes goes to the server for the content it was given about (editor spec §26; cc_classified_asks).
- `packages/claude-code/test/editor-mod-support.test.js` — the page the build makes is there before the editor tests start a server, so a fresh checkout, where the suite runs before `npm run build` and beside the build's own test, never has a server refuse to start for want of it (editor spec §26).
- `packages/claude-code/test/editor-store-gate.test.js` — the gate inside the server's note store, asked before every send: a read, a draft, the change stream and a stale write's answer, and a yes that does not carry over to changed content (editor spec §26; cc_classified_asks, cc_credential_never).
- `packages/obsidian/test/accessibility.test.js` — contrast in both themes, and a keyboard path for every action.
- `packages/obsidian/test/matrix-send.test.js` — the send dialog and the destination matrix note: the note read each time what will be sent is shown, a note that cannot be read refusing plainly with nothing ready to send, and a read that finishes after the model or the question changed making nothing ready (editor spec §19, model_ceiling).
- `packages/obsidian/test/notes-shown.test.js` — a note shown in a thing's or link's details as Markdown through the one renderer, raw HTML never rendered, and the setting that draws notes as callouts joined by a dashed line, off by default, over a layout the same as without them, and the same note's first paragraph in the quick-info tooltip (editor spec §24, note_shown, note_callouts).
- `packages/obsidian/test/details-open.test.js` — the details panel kept open by a setting, off by default, in a card and in the pane: the graph's summary while nothing is chosen, beside the drawing, and below it where the card is narrow (editor spec §24, details_always_visible, details_narrow).
- `packages/obsidian/test/build.test.mjs` — the build writes the files the plugin is installed from.
- `packages/obsidian/test/inline.test.js` — editing in place in the drawing's card.
- `packages/obsidian/test/views-many.test.js` — several views of one graph, in one note or in several, each drawn from the one data set where it is written and none copying it; a view of a graph written in another note says which and opens it (editor spec §7, many_views_one_data, view_of_another_note).
- `packages/graph-spec/test/characterisation.test.mjs` — the library gives the answers recorded before it moved here.
- `packages/graph-spec/test/commas.test.mjs` — both readers read a missing comma the same way, and write it into the same corrected text.
- `packages/graph-spec/test/escapes.test.mjs` — both readers read quoted text's escapes as GQL does, refuse one GQL does not name with the fix that doubles the backslash, and quote a text alike (req:3.gql-escapes; one table, `escape-cases.json`).
- `packages/graph-spec/test/problem-codes.test.mjs` — every problem the JavaScript reader raises passes a stable code from `src/reader/problem-codes.json`, with that code's message and fix, and the blocks of `problem-code-cases.json` are refused with their codes (editor spec §42, problem_codes).
- `packages/graph-spec/test/layout.test.mjs` — the layout source is byte-identical to the Python library's.
- `packages/graph-spec/test/lint-parity.test.mjs` — the JavaScript dialect linter matches the Python one.
- `python/graph_spec/tests/test_changeset_header.py` — a change set's first line is read as the reader reads a block's, in the engine's copy and the rules' (lines end at LF only, whitespace is GQL's set).
- `python/graph_spec/tests/test_engine_gets_corrected.py` — every route to the engine gives Grafeo the reader's corrected text, so a link type without its colon is accepted by both parsers, and the text keeps the block's own lines (req:3.engine-gets-corrected, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_gets_commas.py` — every route to the engine gives Grafeo the reader's corrected text with each missing comma written in, at the end of the code on its line, so a block missing one loads as the profile parser reads it, and no line is added (req:3.engine-gets-commas, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_text_comments.py` — every route to the engine gives Grafeo each whole-line comment as a `/* */` comment on its own line, a `*/` in its text broken up, and a line ends at LF only (req:3.engine-keeps-comments, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_problem_codes.py` — every problem the Python reader raises passes the stable code `problem-codes.json` gives it, the same as the JavaScript reader's, and the blocks of `problem-code-cases.json` are refused with the same codes (editor spec §42, problem_codes).
- `python/graph_spec/tests/test_escapes.py` — the Python reader answers `escape-cases.json` as the JavaScript one does, and what the engine writes for Grafeo keeps a text's escapes (req:3.gql-escapes).
- `python/graph_spec/tests/test_id_once_engine.py` — every route to the engine reads the block with the reader first, so no id reaches it twice in a graph (req:3.engine-reads-first, req:3.id-once).
- `python/graph_spec/tests/test_ids_engine.py` — every route to the engine refuses a SET of a node's id and a node id that is not text, read by the reader first (req:3.set-keeps-id, req:3.id-is-text).
- `python/graph_spec/tests/test_layout_source.py` — the Graphviz source is the one written before the move.
- `python/graph_spec/tests/test_licences.py` — every Python package carries an allowed licence.
- `python/graph_spec/tests/test_parity.py` — the Python library gives the JavaScript library's answers.
- `python/graph_spec/tests/test_reader_agrees_with_grafeo.py` — the reader and its plain rules give Grafeo's answers, Grafeo being the reference engine and a test dependency only (req:17.engine-agreement).
- `python/graph_spec/tests/test_view_parity.py` — Grafeo, running each view of `view_cases.json` as written, returns the things the core returns, and, of a fixed list of GQL's and Cypher's words, refuses as a name and as a kind exactly the words the core keeps from them (editor spec §7, views_agree_with_grafeo).
- `python/graph_spec/tests/test_settings.py` — what a host sets after importing the library.
- `test/forced-colours.test.js` — every view in forced colours and with more contrast asked for: each sheet gives every colour token its system colour (`FORCED_TOKEN_COLOURS`) and, for more contrast, secondary text and lines the full text colour (`MORE_CONTRAST_TOKENS`); the drawing draws each box, line and word in the system's colours, in the plugin and as the page's image; nothing is shown by a shadow alone, no focus ring is hidden without another way of showing focus, and only the rules listed keep their own colours (editor spec §44, forced_colours).
- `test/host-adapters.test.js` — every host's real adapter, Obsidian's built as the plugin builds it and the browser page's in a DOM, passes the one host contract of `packages/core/src/display/host-contract.ts` (editor spec §43, hosts_pass_contract; partial until the standalone app and VS Code join it).
- `test/rtl.test.js` — the style sheets say sides by reading direction (`margin-inline-start`, `inset-inline-end`, `text-align: start`), so the interface mirrors in a right-to-left language; the only rules on a physical side are those placed at a point measured on the screen, each listed with why; each view's root reads in the host's direction (`readInHostDirection`), and the drawing keeps the screen's (editor spec §42, rtl_mirrors).
- `test/pseudo-locales.test.js` — every view of every host, drawn in the test languages `en-XA` (accented and 40 per cent longer) and `ar-XB` (read right to left): no catalogue word is left in UK English, each view reads in the language's direction, no part is set on a physical side but those placed at a measured point, the words the code still says itself (not yet in the catalogue) may not grow in number, and no box that holds words has a fixed width or clips them unless listed with why (editor spec §42, pseudo_locales_checked; partial, as overlap needs a layout: RELEASING.md, AX-20 and AX-21).
- `test/theme-tokens.test.js` — the interface is styled through the design tokens alone: every rule of `styles.css` and the browser page's `page.css` reads a `--gn-*` token (`THEME_TOKENS`) or an element's own measure, never a host's variable, and each sheet maps its host's theme to every token in one block, Obsidian's by the core's table (`OBSIDIAN_TOKEN_MAP`), the page's from the theme it is built with; no token takes a name the drawing's own colours use (editor spec §44, ui_theme_tokens).
- `test/text-scaling.test.js` — text scales to 200 per cent with nothing lost: every text of the interface is sized by a token or its parent's size, never in pixels or points (the drawing's own marks aside, which scale with its zoom), no line height is fixed and no box that holds text has a fixed height, and the browser page's theme sizes its text in rem (editor spec §44, text_scaling).
- `test/import-graph.test.js` — the import graph, and the tests that reach a changed file through it: imports by path and by package name, a file or folder a test names to build or walk, and how `npm run test:changed` picks them (editor spec §13, affected_tests_by_imports).
- `test/cheap-checks.test.js` — the quiet test run, running only a change's tests, the AI guide and the search ignore file.
- `test/build-status.test.js` — the build status's pure part: the requirements a pull request moves, found from the tests it newly marks written; the stage an event gives; which value may replace which; the comment and the annotations.
- `test/build-status-gh.test.js` — the build status's calls to GitHub, through in-memory stand-ins for `gh`: a pull request, the requirements file at a ref and its size, CI's run, the releases, the pull requests merged in a span, the one comment, leaving it on a locked conversation, and the two tokens kept apart.
- `test/build-status-seed.test.js` — the first values the mirror gives an item that has none: Released, Merged, In PR or Not started with the built-in Status to match, a draft release not counting, the tally `--check` prints, and a value already set never overwritten (only Todo replaced).
- `test/build-status-gh-lock.test.js` — leaving the comment on a conversation that may be locked: unlocked only for a pull request whose own `locked` field is true (a refusal that says blocked unlocks nothing), and the lock taken up again with the repository's retry, or the pull request said to be left unlocked.
- `test/build-status-gh-lists.test.js` — the open pull requests and those merged in a span, of this repository's own before any cap, past a crowd of fork pull requests.
- `test/build-status-board.test.js` — the build status's project board: each item's Build status and Status, setting either, the issues read with the workflow's token and the project with the project token alone, and every trouble that is the board's own.
- `test/build-status-run.test.js` — the build status event by event: a pull request opened, CI's checks failing and passing, its merge and closing, the pull requests it leaves alone (a fork, a stale one, one merged elsewhere), a very large one, a release; and a project token that is missing, expired (401) or refused, which warns and never fails.
- `test/build-status-env.test.js` — the build status run whole from a workflow's environment: the event file, the two tokens each to its own runner, the exit code, and a requirements file too large to read.
- `test/build-status-started.test.js` — Started on: the day a pull request of this repository first took a requirement on, by its copy or its Requirements line, set once and kept when it merges or while another pull request holds the item, cleared when it closes unmerged and nothing else holds it; and the mirror's seed setting the earliest such day where none is, clearing it only for an item Not started, and keeping it for one proved, `part` on main (1 of 3 tests written and merged) or In PR or later.
- `test/build-status-claims.test.js` — the built-in Status field (Todo, In Progress, Done), an item two pull requests hold, and the `Requirements:` line of a draft pull request, the only part of its untrusted description that is read.
- `test/build-status-comments.test.js` — the comments after a pull request is closed and locked: the Merged comment, and the Released comment a release leaves on each pull request it moves, by unlocking, commenting and locking again, and every way that can fail.
- `test/build-status-workflow.test.js` — the two build status workflows: woken only by the checks of a pull request, a push to main and a release; the project secret given only to the script on main; no event text in a command line; least privilege.
- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/community-files.test.js` — the code of conduct says how to report a problem in private, `TRADEMARKS.md` keeps the name for the original, and CONTRIBUTING.md and the pull request template ask for every commit to be signed off (editor spec §13, community_files).
- `test/device-check-notes.test.js` — the device checklist numbers every item, the test vault holds one note for each item after Before in `Device checks/`, the note's checklist line is the item's words, each note's graph blocks read as it says they do (the repository's reader and checker, and `parseView` for a view), and the index lists the notes in order (editor spec §3, tried first in a test vault).
- `test/device-check-quotes.test.js` — what a device check note quotes from Obsidian's screen (a read-back, a label, the tap text of an estimate, a box's details, an export's footer and file name, the conversion notice) is computed from the note's own graph blocks with the real functions and matches exactly; the notes' generator scripts and filler set up the case they describe (editor spec §3).
- `test/engine-version.test.js` — the Graphviz version is read from the engine, named in the notices, and checked against published advisories.
- `test/ethos.test.js` — the project's ethos (`requirements/ethos.gql`): every rule names the requirements that check it, or says a person checks it or nothing does yet, and only requirements that exist; each fault is named; the wiki's Ethos page shows each principle and each rule's state (editor spec §41, ethos_checked).
- `test/fixed-sleeps.test.js` — no new fixed sleep in the tests: an awaited `wait(20)` or the like outside a polling loop is held, file by file, to the allowance in `test/fixed-sleeps.json`, which only goes down (`node scripts/fixed-sleeps.mjs --tighten`).
- `test/github-project.test.js` — the GitHub mirror of the requirements as a person runs it: the real workstreams file puts every requirement of slices 3 and 4 in exactly one workstream and may name ids a later copy brings, and the command is a dry run by default, with no network call.
- `test/github-project-desired.test.js` — that mirror's desired state: the first clause of a rule, each issue's title, body, labels and open or closed, the marker, the project's fields and options.
- `test/github-project-gh.test.js` — that mirror applied through an in-memory stand-in for `gh`: a first apply, a second that changes nothing, drift put right, a removed requirement labelled and closed, and nothing ever deleted.
- `test/github-project-gh-owner.test.js` — that mirror's project found, made and filled through GraphQL by the owner's login, with a runner for which every `gh project` verb fails with "unknown owner type", and an owner or a list that is not there an error naming the owner, never no projects.
- `test/no-gh-project-verb.test.js` — no script under `scripts/` builds a `gh project …` argument list or names `item-edit`: gh checks scopes `PROJECT_TOKEN` lacks, so item values are set and cleared by GraphQL.
- `test/github-project-gh-safety.test.js` — that mirror's care: every call names its repository or owner, gh must point at the origin's repository, mutating calls are paced and retried once on a secondary rate limit, and a list that hit its cap is refused.
- `test/github-project-retry.test.js` — that mirror's patience: a timeout, a reset connection, a 502, 503 or 504 or "something went wrong" is waited out 5, 15 and 45 seconds and tried again, a fourth failure stops the run, and a create that went through before the failure is never made twice, and only an issue the signed-in login wrote is taken up again. The worst case is 65 seconds of waiting (5 + 15 + 45) for one call, and the same again for each look at GitHub before a retried create, before the run stops with gh's words.
- `test/github-project-waves.test.js` — that mirror's waves plan, `requirements/waves.json`: read and refused, each requirement's Wave and Order derived from it (a reordered plan moves Order), the iterations of the Wave field, the tally `--check` prints with a warning for each requirement not proved in no wave, and the real plan holding every requirement of slices 3 to 10 not yet proved.
- `test/github-project-fields.test.js` — that mirror's fields that are not a single choice, each derived: Closed on set on close from the issue's closedAt (for one closed before the field existed too), cleared on reopen, unchanged when right and put right when not; Wave an iteration field with a wave's dates, Order a number, both moved by a reordered plan and cleared for a requirement in no wave, an iteration kept by its id when its dates change; and the rule Started on follows.
- `test/github-project-adopt.test.js` — whose issues the mirror and the build status take for their own: the owner's and the workflows' bot's (`app/github-actions` as gh gives it), never a stranger's or another app's; the bot's first apply made and its second changing nothing; and an apply by any other login refused.
- `test/github-project-run.test.js` — that mirror run by its workflow: the issues written with the workflow's token and by its bot, the project with `PROJECT_TOKEN` alone, a second run changing nothing, a missing or refused project token a warning with the issues mirrored alone, a seed with warnings applying nothing, `--accept-warnings` and `--allow-removals` refused, anything else an error, no token printed, and the command handing over in GitHub Actions; the time budget; issues the creator list does not give back still made once and never again by a later push (the newest issues show them); more than 20 creates on a board with its issues refused; and GitHub's rate limits a warning.
- `test/github-project-downgrade.test.js` — that mirror when a requirement's proof goes down (proved to part or open: the issue reopened and relabelled, Status and Closed on put right, the edits done before any creating) and when GitHub is slow to list the bot's new issues (looked for again, the newest issues read too, no duplicate and no needless stop).
- `test/github-project-workflow.test.js` — the workflow that runs that mirror: woken by a push to main alone, `issues: write` its one write permission, one run at a time and none cancelled, main checked out with nothing installed, the one command, and the project secret given only to it.
- `test/claude-review-workflow.test.js` — the workflow that leaves Claude's review on a pull request: woken by a pull request, never `pull_request_target`; skipped for forks, drafts and Dependabot; `pull-requests: write` its one write permission; the token given only to the step that checks it and to the action; no checkout keeps credentials; and the review approves, pushes and edits nothing.
- `test/github-project-blocks.test.js` — that mirror's blocked-by links: each open question's issue blocking the issues of the requirements it blocks, made once, a link the requirements dropped removed and a person's kept, and a refusal by GitHub a warning with the issues and project still mirrored.
- `test/github-project-plan.test.js` — that mirror's plan: what differs between the desired state and what GitHub holds, for the issues, the labels and the project.
- `test/instruction-counts.test.js` — the benchmarks' work counted in CPU instructions: Cachegrind's output read, each case counted less its setup, the claims checked, nothing counted and said so where Valgrind is not installed, and every benchmark case still doing its work.
- `test/ignore-entries.test.js` — an entry of `.ignore` that git ignores as build output may be missing in a fresh checkout, and any other entry that names a file must exist, so a misspelt path is caught.
- `test/licences.test.js` — licences through the whole build chain, and the one allowance for a GPL tool run in CI alone and never shipped.
- `test/offline.test.js` — no network request but the one exception, a send to an AI model the user set up: the bundled engine makes none, and the core's AI send makes none of its own, going only through the transport it is handed.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI; the one module that may reach the network, reached only from the send dialog, and nothing in the AI's folder on a timer or an event.
- `test/ai-disclosed.test.js` — the AI use disclosed in the README: content goes only to models the user sets up, only when the user sends it, and the one exception to no network use stated precisely (spec §19, ai_disclosed).
- `test/public-readiness.test.js` — fit to be public and kept so: a clean history, a fresh clone set up from the README alone, and GitHub settings that let only a collaborator contribute.
- `test/repository-scans.test.js` — the source scans behind the one network exception: the AI send module found however it is imported, Obsidian's `request(` taken for a request, and every timer and event found.
- `test/quality-metrics.test.js` — the quality metrics are held to a committed baseline, and a worse one fails without a recorded reason.
- `test/quality-baseline.test.js` — the baseline cannot be loosened without a reason, is whole, and says which machine measured it.
- `test/quality-instructions.test.js` — the instruction counts in the ratchet: one metric for each benchmark, with a small tolerance, held only against counts from the same machine; not measured where Valgrind cannot run, which fails only on Linux; recorded and printed until the baseline holds them; a claim that does not hold failing always; test duration only warning.
- `test/quiet-reporter.test.js` — the quiet test run when a failure's details cannot be passed on, as when an assertion holds a function: every failure still reported, the run failed, never crashed.
- `test/run-ceiling.test.js` — every run of the npm test commands, in CI too, is stopped with one line at a memory or time ceiling, before a runaway test can exhaust the machine; a run within both passes through unchanged.
- `test/requirements.test.js` — the requirements graph, the one source: started requirements proved, tests where they say.
- `test/requirements-note.test.js` — the requirements kept as a graph note: the graph as the one block of a Markdown note is read by every tool that reads the requirements, and passes the same audit as the graph file (requirements_as_graph_note).
- `test/check-requirements-flips.test.js` — the requirements graph is edited here, in pull requests (Roger, 16 Oct 2026: no vault holds it any more): records, links and comments may be added, changed and removed, but a pull request never moves a test back in status (planned to partial, partial to written, planned to written only), never flips one forward without its file, and never removes a test that is partial or written.
- `test/slice-done.test.js` — a slice is done only when every one of its requirements is proved by a written test whose file is there, in a copy whose banner is as it should be, whose every slice is a whole number and whose every test is kept where the check knows: `check-requirements.mjs --done <slice>` says so or lists what is missing, and the slice board's overview says the same, each tried on tampered copies of the requirements; every slice before the one under way is done (spec §12, done_means_proved).
- `test/slice-board-style.test.js` — the slice board's stylesheet: colour tokens that agree in light and dark, the altitude switch by CSS alone, a layout that holds at 400px, and the source written one rule and one declaration to a line.
- `test/slice-board.test.js` — the slice board: a CSS-only HTML page of how far the slice under way is proved, from the requirements copy and, optionally, the open pull requests.
- `test/wiki.test.js` — the project wiki: every page made from its file in the repository, ending with the file and commit it came from, the proved counts as the slice board gives them, every answered question a decision and every other open, the roadmap's chart free of the characters it reads as syntax, and the releases from GitHub or `versions.json`.
- `test/wiki-developers.test.js` — the wiki's developer pages: the architecture graph naming only paths and requirements that exist and every package, drawn with each thing's kind and a planned part dashed; every extension point, contract check, design token, host member and problem code listed from the code; each requirement marked released, nightly only, being built or planned against the latest release; and the plug-in example installing and passing its contract.
- `test/wiki-guide.test.js` — the wiki's user guide: every screenshot taken shown once and no other asked for, every setting listed from the editor's own options, plain words, and a new button of the drawing reported when the guide does not explain it.
- `test/wiki-review.test.js` — the review of the wiki pages people write or edit: each checked and never changed, a suggestion for each broken link or picture, old version and long sentence, a person's edit to a made page reported, and an issue text that pings no one.
- `test/wiki-workflow.test.js` — the workflow that makes the wiki: woken by a push to main or a stable release, the pages made with read access only, and the one job that writes running no code of the repository.
- `test/nightly-workflow.test.js` — the nightly pre-release: run each night and by hand, built only when main moved and published only after the full suite passes, the one job that writes running no code of the repository, the last seven kept, and the version `scripts/nightly-version.mjs` gives it.
- `test/site.test.js` — the project's home page: made from `site/index.html` and `site/words.json` with every word used and none missing, the search and AI basics (title, description, canonical address, structured data, sitemap, robots and llms.txt), WCAG 2.2 AA in both schemes, and no side said by left or right.
- `test/site-workflow.test.js` — the workflow that publishes the home page: woken by a push to main, each morning or by hand, the page made with read access only, and the one job that writes to GitHub Pages running no code of the repository.
- `test/speed-index.test.js` — the one measure of a machine's speed, which the quality metrics record and scale their timings by: fixed plain work, the least of seven runs.
- `test/timed-assertions.test.js` — a test asserts the work done, never the time taken: no JavaScript test or its support asserts a span of elapsed time; a polling deadline, mock timers and a clock handed to the code tested are allowed.
- `test/test-files.test.js` — every file a test or a device-check note names is made by `scripts/make-test-files.mjs`, and the images it makes decode and move: the GIF's compressed data, the APNG's frames, the WebP's lossless frames, the SVG and the PDF (editor spec §12, tests_self_contained, test_files_generated).
- `test/test-vault.test.js` — the test vault: dummy notes tied to requirements, nothing Obsidian writes committed, each session clean.
- `test/test-status-partial.test.js` — the third test status, `partial`: a test whose file is there but does not yet prove every rule its record covers. It needs its file like a written one, leaves its requirement unproved in `--done` (the reason says partial), may be flipped to only from planned and to written (every backward move refused), and counts on the slice board as part and in progress, never proved.
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
- `test/wcag.test.js` — every view and page of every host (Obsidian's card in each state, its details, edit pane, export form, AI send dialog, proposal, quick-info tooltip, style, step and view blocks, table, Live Preview card, settings and the menus it gives Obsidian; the browser editor's page in each state) passes axe-core's WCAG 2.2 A and AA rules and the 4.5:1 text contrast, in the light and the dark theme; the check is tried on planted faults first; a host with no entry fails (editor spec §11, wcag_aa, wcag_new_hosts, wcag_checked).
- `test/a11y-semantics.test.js` — every control of every view and page of every host (the views `test/wcag.test.js` checks, kept in `test/repository/views-obsidian.js` and `views-page.js`) has an accessible name, is read as a control and says its state (checked, selected, expanded), as axe-core reads the accessibility tree; each drawing's text version counts the things drawn and says each as its box is labelled; the check is tried on planted faults first (editor spec §41, a11y_semantics_auto).
- `test/a11y-keyboard.test.js` — a keyboard-only run of every view and page of every host (the views `test/wcag.test.js` checks): Tab and Shift+Tab reach every element of the tab order with the page's own key handlers live, no element keeps the focus (a field that takes Tab is left with Escape then Tab), an action out of the order is in a widget whose arrow keys reach it, one of each kind of action the page draws itself is operated with Enter or Space, and a dialog of ours keeps the focus in it and is left with Escape from every control; the check is tried on planted faults first; the browser editor's page is run in the four files below, and each of its states is checked to be in one of them (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-1.test.js` — part 1 of the keyboard-only run of the browser editor's page: the states `test/repository/keyboard-page.js` gives part 1, split over four files so they run side by side (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-2.test.js` — part 2 of the keyboard-only run of the browser editor's page: the states `test/repository/keyboard-page.js` gives part 2, split over four files so they run side by side (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-3.test.js` — part 3 of the keyboard-only run of the browser editor's page: the states `test/repository/keyboard-page.js` gives part 3, split over four files so they run side by side (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-4.test.js` — part 4 of the keyboard-only run of the browser editor's page: the states `test/repository/keyboard-page.js` gives part 4, split over four files so they run side by side (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-devices.test.js` — the keyboard-only run of every view of the Obsidian host again, on a phone and on a tablet with a keyboard attached, where the layout differs: tabs and a bottom sheet in the pane, a sheet for the details (editor spec §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-1.test.js` — half 1 of the keyboard-only run of the browser editor's page in a phone's width, its phone layout: the states `test/repository/keyboard-page.js` gives half 1 (editor spec §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-2.test.js` — half 2 of the keyboard-only run of the browser editor's page in a phone's width, its phone layout: the states `test/repository/keyboard-page.js` gives half 2 (editor spec §11, keyboard_any_device).
- `test/speed-budgets.test.js` — each host held, in CPU instructions, to a budget for drawing 50 things and 500, a query over a 10 000-thing mesh (100 notes of 100 things, until slice 6 builds the mesh) and a cold start of each host: every budget set in `scripts/benchmarks/budgets.mjs` with where its number comes from, each a benchmark's claim in the quality ratchet, each case doing its work, and a count over its budget breaking the claim (editor spec §41, speed_budgets).
- `test/ux-copy.test.js` — every message the user reads in every view of every host (the views `test/wcag.test.js` checks, with the notices and menu items the host shows; the person's own words left out) reads at grade 9 or lower, keeps its sentences to 25 words and uses none of the listed jargon (scored by `scripts/plain-english.mjs`); a message that misses for a reason is recorded in `quality/copy.json` and may never score worse without the record raised; the check is tried first (editor spec §41, ux_copy_auto).
- `test/whitespace.test.js` — the three copies of the one whitespace set are the same, and the set is openGQL's.

## The requirements in a GitHub Project

- **One way only.** `requirements/editor-requirements.gql` stays the only source. `scripts/github-project.mjs` mirrors it
  into a GitHub Project titled "graph-note requirements", one issue for each requirement of the chosen slices
  (`--slices 3,4` by default). The issues and project items are derivatives: regenerated, never edited by hand, and each
  opens on its rule, then a do-not-edit banner. Its title is the requirement's section, a dot and the id's words.
- **Where each requirement goes.** `requirements/workstreams.json` maps a workstream id to its title and its requirement
  ids; a requirement it does not list falls to `S3`, and an id the current copy does not hold yet is fine. An issue
  carries the labels `slice-N`, `workstream:<id>` and `status:open|part|proved`, and is closed when proved. Its status
  is the one the slice board reads. The project's fields are Slice, Workstream, Proof (open, part, proved) and Build
  status (Not started, In PR, Checks failing, Checks passing, Merged, Released); the built-in Status field (Todo, In
  Progress, Done) is the board's own, and the mirror never makes it or changes its options. The mirror makes Build status
  and its options, and **seeds** an item that has no value from where its requirement stands on GitHub
  (`scripts/build-status-seed.mjs`), never more: proved on main and by the copy of a *published* release (a draft does not
  count): Released and Done; proved on main only: Merged and Done; held by an open pull request of this repository, by
  its copy's diff or its `Requirements:` line: In PR and In Progress; otherwise Not started and Todo. A Build status
  already set is never overwritten, nor is a Status of In Progress or Done; only Todo, the board's default and no choice,
  is replaced by a seed that says more. Nothing moves back from Released or Done. What is proved on main is read from
  main through the API, not from the checkout the script is run from. `--check` prints the tally of what it would seed
  for each option (`seeded Build status: …`, `seeded Status: …`) to confirm before `--apply`. A requirements file the
  seed could not read (main's, a release's, a pull request's) is a warning: `--check` says an apply would stop, and
  `--apply` stops unless `--accept-warnings` is given, since it would fix wrong values for good. After the
  first seed, the values come from the build status workflow below, from GitHub's events alone. The project is found by
  GraphQL (`repositoryOwner(login:) { projectsV2 }`, a user or an organization), never by `gh project list`, which asks
  gh to resolve the owner's type and fails ("unknown owner type") for a token with only the project scope. The project
  is also made (`createProjectV2`, with the owner's node id) and filled (`addProjectV2ItemById`, with the issue's node id)
  through GraphQL, not by `gh project create` and `gh project item-add`; only `gh project item-edit`, which takes ids,
  is still used. An owner that cannot be found, or an answer with no list of projects, is an error naming the owner and
  never taken for no projects, which would make the project a second time.
- **Every other field is derived, never authored** (Roger, 15 Oct 2026). **Closed on** is a date field, the day (UTC)
  of each issue's `closedAt`: set for every closed issue, those closed before the field existed too, cleared on reopen,
  and put right if anyone changes it. **Started on** is a date field, the day a draft or open pull request of this
  repository first took the requirement on, by its copy or its `Requirements:` line: the build status sets it where
  there is none, keeps it when the pull request merges and while another pull request holds the item, and clears it
  when the item is let go; the seed carries the earliest day of the open pull requests that hold an item, so a sync sets
  it where none is and clears it only for an item Not started (none holds it, no test of it is written and its Build
  status is not past Not started); one proved, `part` on main or In PR or later keeps it. **Wave** and **Order**
  come from the waves plan below.
- **The waves plan is `requirements/waves.json`**, the one place the order of the work lives: the waves in order, each
  with its workstreams in order and a planned `start` and `end`, `estimate: true` marking the dates as estimates (the
  wave's title on the board then ends "· est.", and `--check` prints a note that they are estimates). Its last wave is
  a placeholder with no workstreams, for Roger's held changes after all waves; the wave before it holds only the
  Obsidian community release (R2), which Roger put after all the planned work. Wave
  is an *iteration* field, one iteration for each wave with its dates, made and kept by `createProjectV2Field` and
  `updateProjectV2Field` with `iterationConfiguration` (an iteration whose title is unchanged keeps its id, so the items
  keep their wave). Order is a number field: the wave's position times 10 000, the workstream's times 100, then the
  requirement's (those its workstream lists, in its order, then those it holds by default), so 10 203 is the third
  requirement of the second workstream of the first wave. A requirement whose workstream is in no wave has neither, and
  `--check` prints a tally for each wave and warns of each requirement in no wave that is not proved.
- **See the plan with `npm run project:plan`.** It is a dry run and makes no network call, so it compares with an empty
  GitHub. `--check` reads GitHub and prints the real diff, changing nothing. `--apply` prints the same plan, then does
  it with `gh`: it finds each issue by its hidden `<!-- requirement:<id> -->` marker, changes only what differs, and
  never deletes (an issue whose requirement went is labelled `requirement:removed` and closed, with a comment).
- **The full mirror runs on every push to main** (Roger, 15 Oct 2026, option A), in `.github/workflows/project-mirror.yml`:
  `node scripts/github-project.mjs --apply --slices 3,4,5,6,7,8,9,10`, which in GitHub Actions hands over to
  `scripts/github-project-run.mjs`. So issues close and Proof follows main with no session doing it. The issues and
  labels are written with the workflow's own token, whose one write permission is `issues: write`, so the issues it makes
  are written by `github-actions[bot]`; the project is read and written with `PROJECT_TOKEN` (the project scope only), each
  call routed to its token. A missing `PROJECT_TOKEN`, one GitHub refuses (only a 401, a 403 or "Bad credentials" is
  the token's trouble), or any other failure of a project call (a mirror error, in gh's own words, such as an input the
  schema refuses) is a `::warning::`, and the issues are mirrored without the project; a seed made despite warnings applies nothing, with a `::warning::`; neither fails the run, and the
  workflow never passes `--accept-warnings` or `--allow-removals`. An apply may take 45 minutes (`MIRROR_BUDGET_MINUTES`
  sets another), inside the job's 60, since a first run makes some 2,000 paced calls: once that is spent it makes no
  more and warns "board partly updated; the next push continues", exit 0, and the next push plans again from what
  GitHub holds. GitHub's rate limits (a 403 or 429 that says "rate limit" or "submitted too quickly") warn "rate
  limited; the next push continues", exit 0. **No issue is ever made twice:** the first issue an apply makes is looked
  for at once in the list by its creator, and before making any the apply looks among the hundred newest issues for one
  of its own that list missed; either way it stops creating and warns "bot-created issues aren't listed by creator=…;
  creating stopped to avoid duplicates", exit 0, so a creator filter that ever failed could not make every push create
  the issues again. And a run of the workflow makes at most 20 issues on a board that has its issues already (a first
  mirror makes them all); a plan with more is refused with a warning and nothing applied, for a person to check, as the
  removal guard does. Anything else is an `::error::`. It runs main's own code
  only: woken by a push to main alone, it checks out main, installs nothing and keeps no cache. One mirror runs at a time
  (`concurrency: project-mirror`, `cancel-in-progress: false`): GitHub keeps one run waiting in the group, a newer push
  replacing the one that waited and never the one running, which is enough since each run mirrors main as it stands.
- **Only what it made is its own.** An issue is adopted only when the repository's owner or `github-actions[bot]` wrote
  it (gh gives the bot as `app/github-actions`, the REST API as `github-actions[bot]`), its body has the generated banner, and its marker is the last thing in
  it; only those two logins' issues are read, a marker anyone else writes is ignored, and an issue whose banner or
  closing marker was edited away is no longer ours, so a new one is made. `--apply` stops, unless `--allow-removals` is
  given, when the requirements file holds no requirements or the plan removes more than 10 issues.
- **It goes only where this checkout's origin says.** `gh` runs in the repository folder with `GH_REPO` and `GH_HOST`
  removed, must point at the origin's repository or the run stops, and names the repository (`--repo`) or the owner
  (`--owner`) on every call. Calls that change something are paced about a second apart and tried once more after a
  secondary rate limit; a list that comes back as long as its cap is refused. An origin on any host but github.com is
  refused, and an error never repeats a login or token from the remote.
- **Apply as the owner, or let the workflow apply.** Issues are adopted only when the owner or the bot wrote them, so an
  `--apply` signed in as any other login is refused before it changes anything: its issues would be made again by
  every later run.
- **The project is dedicated to the script.** Changing the options of Slice or Workstream replaces them in GitHub, which
  clears the value on every item, and the script sets the values again on the items it manages. A value on an item the
  script does not manage would be lost, so keep nothing else in this project.

## The build status of each requirement

- **Where a requirement's build is up to shows on the project, from GitHub's events alone** (Roger, 15 Oct 2026). The
  "Build status" field and the built-in "Status" field are never authored by a person, and the mirror only gives an item
  its first values (see above): `scripts/build-status-run.mjs` sets them from what happens to a pull request, in the
  workflow `.github/workflows/build-status.yml`.
- **No hand-linking.** A pull request's items are the requirements whose tests its `requirements/editor-requirements.gql`
  newly marks written, against the base branch's (a merged pull request: its merge commit against that commit's first
  parent; a release: the tag against the release before it). Both files are read through the API as data, a file of
  over 3 MB being a warning and not read. At most 200 requirements are handled for one pull request, with a warning above.
- **A helper opens a draft pull request as its first step,** with the line `Requirements: id1, id2` in its description,
  so the items it will build are taken on (In Progress, In PR) before any test of its copy is written. That line is the
  only part of the description that is read: it is split at commas, an id is kept only if it is plain (letters, digits,
  underscore, dot and hyphen) and is in main's requirements file, and nothing else is ever echoed. Once the copy marks
  tests written, the copy's diff decides, and an id the line names that the landed copy does not prove is let go, with a
  warning in the comment (never a failure).
- **Lists are of this repository's own before any cap.** The open pull requests and the pull requests merged in a span
  are paged through (ten pages at most) keeping only those whose head and base are this repository, so a crowd of fork
  pull requests cannot hide one that holds an item; the issues are asked for by their creator (the owner, and
  `github-actions[bot]`) from the REST list endpoint, `repos/{owner}/{name}/issues?state=all&creator=…`, paged through,
  in the build status and in the mirror (which adopts only those two logins' issues), so issues others file never reach
  the cap. Not `gh issue list`, which may use the search: capped at 1,000 and behind its index, so a create tried again
  could be made twice. A pull request, which that endpoint lists too, is left out.
- **Which pull requests.** Only those of this repository: one from a fork moves nothing and gets no comment. The pull
  requests an event names must still have, as their head, the commit its checks ran on. Merged counts only when the pull
  request merged into main.
- **The stages.** In PR while CI runs or has not started, Checks failing when CI's run fails, Checks passing when it
  passes (CI's own run only, found by its workflow path: the other workflows of a pull request, such as code scanning or
  the dependency review, are not the build's checks), Merged on the merge (a push to main), Released when a release is
  published, and Not started again if the pull request is closed unmerged. An item never goes back from Merged or
  Released.
- **The built-in Status follows:** In Progress while a same-repository pull request, draft or open, holds the item; Done
  when it merges into main or is released; Todo again when the pull request closes unmerged, unless another open
  same-repository pull request still holds the item (which also keeps its Build status). Never back from Done.
- **One comment, updated at each step,** on the pull request, with links to the items, the board and the run; none when
  a pull request moves no requirement. A release comments, with the stage Released, on each pull request merged since the
  release before that proved any of its requirements. A comment is tried first; only if it fails and the pull request's
  own `locked` field, read from the API, is true (every pull request's is, and a merged one's is closed too) is it
  unlocked, commented and locked again in the one step. The lock is taken up again with the repository's retry for a
  short failure of GitHub; if it still fails, the warning says that pull request `#N` was left unlocked. It is made with the workflow's own token, with
  `pull-requests: write` as the only write permission (it is what locking needs, as the lock workflow shows). When
  two runs would make it at once it is looked for again just before it is made.
- **`PROJECT_TOKEN` is for the board alone** (a classic token with the `project` scope, as a secret): listing the project,
  reading its fields and items and setting their values. The issues, the pull requests, the files and CI's run are read
  with the workflow's own token, which also leaves the comments. (`public_repo` was asked for to read issues and the
  signed-in login; it is no longer used by this workflow, and whether to keep that scope is the owner's call.) When
  `PROJECT_TOKEN` is missing or GitHub refuses it (expired: 401), the run says so in a `::warning::` annotation and a line
  in the comment, and does not fail: CI never fails over it.
- **Nothing of a pull request is run with the secret.** The workflow follows the checks of a pull request (CI, and the
  `Build status trigger` workflow, which has no secret and does nothing) instead of being woken by the pull request, so
  its definition is the one on main and its job checks out main, with no package cache. No `pull_request_target`, no
  event text in a command line, and the script prints no token. Runs are grouped by the commit of the checks, so one pull
  request's waiting run never replaces another's. Actions are pinned to commit hashes at least 7 days old.

## The wiki

The [GitHub wiki](https://github.com/rogerbucks/graph-note/wiki) is made from the repository by `.github/workflows/wiki.yml`
on every push to main and every release, so it is never edited by hand: an edit there is overwritten. `scripts/wiki.mjs`
writes the status, roadmap, decisions, open questions, quality and releases pages from the files that hold them, and
copies the pages written by a person from `wiki/`, filling each `<!-- wiki:NAME -->` marker. `wiki/How-to-use-Graph-Note.md`
is the user guide, in plain words for people who are not technical: a change people will see changes it in the same pull
request. Its pictures are `<!-- wiki:shot NAME -->` markers, taken from the build by `scripts/wiki-screens.mjs` (each
shot is a state of `packages/obsidian/harness`, listed in `SHOTS`), and its settings come from the core's `OPTIONS`. A
button of the drawing the guide does not name is a warning on the wiki's run. People may edit the wiki too: their pages
are never changed by the workflow. `scripts/wiki-review.mjs` checks each page a person changed last, on every run and on
every wiki edit, and the workflow keeps the suggestions in one open issue labelled `wiki-review`, closed when none is
left. A person's edit to a page the wiki makes is listed there before the next run replaces it. The developer pages
(`wiki/For-developers.md`, `Architecture.md`, `Writing-a-plug-in.md`, `Adding-a-host.md`) are filled from the code by
`scripts/wiki-developers.mjs`: the architecture is the graph note `requirements/architecture.gql` (add a new package or
interface there), and a new extension point needs its words in `POINT_ABOUT`, or the wiki's make fails. They describe
main, the nightly build, and mark each requirement against the latest stable release. To look at the wiki before a merge:
`node scripts/wiki-screens.mjs --out out/images && node scripts/wiki.mjs --out out --labels out/images/labels.json`.

## The quality ratchet

- **Every release is walked through for accessibility** (spec §11): the keyboard and screen reader list in
  [RELEASING.md](RELEASING.md), for what the automated WCAG check (`test/wcag.test.js`) cannot see. Every interface in every
  host meets WCAG 2.2 Level AA, and a new host does before its first release: add its views to `test/wcag.test.js`.
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
  cores, with Node pinned to one thread, V8's predictable mode, a fixed collector schedule, one random seed and
  WebAssembly compiled once (the drawings' by the optimising compiler, in their warm draw), and keeps each case less its
  setup; a case that counts nothing beyond its setup fails the run. It runs on Linux only, in
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
- **A test waits for the state it asserts, never a number of milliseconds** (15 Oct 2026). A sleep holds only while the
  machine is as fast as when it was written: under a loaded full run the work takes longer, and the test fails once in
  a while and passes alone. Wait with the test support's `until(() => …)` on the state asserted; where nothing should
  change, wait for a positive sign that the work is done (a notice counted, the tools drawn again) and then assert.
  `scripts/fixed-sleeps.mjs`, run by `test/fixed-sleeps.test.js`, fails a fixed sleep beyond each file's allowance in
  `test/fixed-sleeps.json`, and an allowance higher than the file needs, so a sleep taken out stays out.
- **A baseline from the CI runner:** run the "Quality baseline" workflow by hand, download its `quality-metrics`
  artifact (its log prints the same), and commit its `metrics.json` as `quality/baseline.json` in a normal pull
  request. Each benchmark is bundled on its own, and the hash of its bundle, with the machine, Node, Valgrind and the
  flags, is its fingerprint: one whose fingerprint is unchanged since the committed baseline keeps that count, so only
  the benchmarks a change reaches are counted again. Tick "count every benchmark" to count them all; a release always
  does. Ticked, "spread" also writes `instruction-spread.json`, every benchmark counted three times: its
  `largest_spread` is how far a count moved between runs there, which the tolerance must stay well above.
- **The Graphviz inside the engine is watched** (spec §13): `node scripts/engine-version.mjs` reads its version from the
  engine, checks the notices name it, and checks `quality/advisories.json` offline (it warns when the cache was last
  checked over 14 days ago). Only `--refresh` and `--watch` ask: OSV and NVD for Graphviz, merged, and OSV for the
  package that wraps it. The release's quality job refreshes and checks. The "Engine advisories" workflow, run by hand
  (its weekly schedule is off until the public release), is read-only: it fails when the published advisories differ
  from the committed cache, and then someone runs `--refresh` and opens a pull request. The plugin never asks.
