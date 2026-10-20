# Contributing

**Who can contribute.** For now, only collaborators may open pull requests and issues. This holds until the community
release. Ideas, questions and bug reports are welcome in
[GitHub Discussions](https://github.com/rogerbucks/thoughtknot/discussions), which anyone may join. To ask to join as a
collaborator, start a discussion there and say what you would like to work on.

How the code is written here. Every rule a tool can check is checked: by `test/conventions.test.js`, by the linter, or by
CI. A change that breaks one fails before it is merged.

## How a change is made

- **Spec, then test, then code.** Each behaviour is a requirement in the spec first. Its test is written next and seen
  to fail, and only then is the code written. A commit message says which tests were seen failing first.
- **The requirements are edited here.** `requirements/editor-requirements.md` is the one source of the requirements,
  changed in a pull request like any file; no vault holds them (Roger, 16 Oct 2026). Once graph notes can hold it, the
  graph moves into one.

### The status of a test

- **A test in the requirements copy has one of three statuses.**
  - `planned`: no file yet.
  - `partial`: the file is there but does not yet prove every rule its record covers. This happens when several
    workstreams add cases to one shared file over time.
  - `written`: it proves them all.
- **A `partial` or `written` test must have its file.** A `planned` test whose file is there is refused.
- **A requirement is proved only when a test proving it is `written`.** A `partial` one leaves it unproved.
  `check-requirements.mjs --done` lists it with "partial" in the reason. The slice board counts it as part, in progress,
  never proved.
- **A test moves only forward:** planned to partial, partial to written, or planned to written. The flip check refuses
  every backward move, and a flip to `partial` needs the file.
- **A flip to `partial` moves no requirement in the build status.** Only a test newly `written` does, so nothing is
  Merged or Released on a partial test.

### Tests seen failing first

- **CI proves it.** `scripts/tests-first.mjs` replays each new commit. Its tests run against its parent's code, and
  every test new in the commit must fail there.
- **A test written after its code has its reason kept, or the build fails.** One example is a test that pins behaviour
  that already existed. Its reason goes in `test/seen-failing/`, one file for each test. It is written by
  `node scripts/tests-first.mjs --excuse <test file> <test> <reason>`. The file is named after the test file and a
  digest of the test.
- **What a reason holds.** A reason holds only `file`, `test`, `seen_failing_first`, `evidence` and, for a fault,
  `fault` (true) and `commits`. `--excuse` never overwrites one without `--force`. Its flags come before its arguments.
- **`--excuse --fault` keeps the reason a recorded fault is accepted, and which commit fixed it.** A recorded fault is a
  test that failed at its own commit. It names every commit at which the records hold the fault, so a later fault of the
  same test is not excused. It refuses a fault in a file none of whose tests could run, which the replay did not replay
  at all.
- **How the tally counts a fault.** `--tally` and `summary` count an excused fault as `faultsExcused`, not as not
  replayed. That leaves `excused` for the passed-first reasons.

### The records of the replays

- **The records of the replays are in `test/tests-first/`** (`node scripts/tests-first.mjs --update`). There is one file
  for each replayed commit that changed a test, named after the commit. They sit over `baseline.json`, the single record
  as it stood when it was split (11 Oct 2026), frozen at its head. Together they give, for each test file, what was seen
  failing first, what was excused, and what could not be replayed.
- **CI fails a commit since the baseline that changed a test and has no record** (`--complete`). So each commit's record
  is written once, on the branch that made it.
- **A test may come a commit before its code.** A new test may fail at its own commit, and again when its file is run
  once more there. It is then recorded as not replayed, naming it, and `--check` warns of it. One that passes the second
  time fails the record, and so does a run that did not finish, so it is run again.
- **A fault that comes back on every run** means the commit has to be rewritten together with its code. A test that
  failed at the parent is never taken for one held before: it is judged in the commit that makes it pass.
- **`node scripts/tests-first.mjs --tally` is for a reader outside the repository.** It writes nothing and prints one
  JSON document. The document holds the baseline's head and the counts for each test file: replayed, not replayed, seen
  failing, excused, passed first. It also holds every reason kept, with its file's path and its content. Add
  `--repo <dir>`, first, to read another repository.

### Merging the records

- **The records never conflict.** Two branches that replay different commits, or excuse different tests, write
  different files. No field is rewritten by every update. So any merge, GitHub's own among them, joins them with nothing
  to resolve.
- **Pull requests are merged with a merge commit only.** A squash or a rebase merge makes new commits. So the records of
  the branch's own commits name commits main never holds, and the new ones have none.
- **A branch begun before the split** merges main once. That merge conflicts in the two old files one last time. Put it
  right in four steps:
  1. Take main's `test/tests-first/baseline.json` (`git checkout origin/main -- test/tests-first/baseline.json`).
  2. Keep the branch's own `test/seen-failing.json`.
  3. Run `node scripts/tests-first.mjs --migrate`, which moves its reasons into `test/seen-failing/`.
  4. Run `--update`, which records its commits.
- **`--migrate` checks every reason before it writes any.** It leaves a reason main already keeps differently as it is,
  naming it, for a person to choose between the two.

### Checks, review and writing

- **The gate before every commit:** `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test`, plus
  `ruff check` and `ruff format --check` when the Python library changed. CI runs them all again.
- **Cheap checks while working.** Each runs less than the gate does.
  - `npm run test:ai` runs the suite quietly. It prints one line when all pass. For a failure it prints only its file
    and line, name, short expected and actual, and the first stack frame in our code.
  - `npm run test:changed` runs only the tests the change reaches. It finds them by the naming under "Tests mirror the
    code" and by the import graph (`scripts/import-graph.mjs`). That is every test that imports a changed file,
    directly or through others, or names it to build. It runs the whole suite when something shared changed.
  - `npm run test:ai:py` does the same for the Python library.
- **The cheap checks are for working.** `npm test` and the gate above still run in full before every merge, and in CI.
  `AGENTS.md` is the short guide for AI sessions, and `.ignore` keeps generated and bulky files out of code searches.
- **A large or risky change goes through a pull request**, and is merged only once CI passes on it. That means one that
  touches many files, changes a library both languages share, or changes the build, CI or dependencies. The biggest are
  reviewed before merging. A small, contained change may be committed straight to `main` once the gate passes.
- **UK spelling** in code, comments, messages and the interface.
- **Plain language for every reader, ADHD readers included** (Roger, 18 Oct 2026). This covers every document and code
  comment. Keep sentences to 25 words and paragraphs to 80. Put a heading at least every 400 words. Lead with the point,
  and use lists and tables where they help. Leave out filler words; `scripts/plain-docs.mjs` lists them, each with what
  to write instead. `node scripts/plain-docs.mjs <path>` lists what to fix. A file may never get worse, and a new file
  starts clean.

## Signing off your work

Every commit in a pull request ends with a sign-off line. It says the person who made it has the right to send it under
the project's licence, as the [Developer Certificate of Origin](https://developercertificate.org) sets out:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it.

- **A commit any AI agent writes carries Roger's sign-off, not the agent's.** Claude, Antigravity and graph-note are
  such agents. An AI cannot certify where code came from. Roger directs that work, so he certifies it (Roger, 19 Oct
  2026; widened to every agent 20 Oct 2026). Such a commit ends with this line, in place of `-s`:
  `Signed-off-by: Roger Bucks <264575592+rogerbucks@users.noreply.github.com>`. Add it with `git commit --trailer`.
- **CI checks it.** `node scripts/public-readiness.mjs --history` refuses a commit from 20 Oct 2026 on with no
  sign-off, or one that names only a bot or an AI. Merge commits and Dependabot's own updates are left out.

The sign-off is how a fork or a pull request stays clear about who wrote what. It also keeps the project free to stay
under the [Mozilla Public License 2.0](LICENSE). People who take part follow the
[code of conduct](CODE_OF_CONDUCT.md), and a fork goes by its own name ([TRADEMARKS.md](TRADEMARKS.md)). A security problem
is reported in private, as [SECURITY.md](SECURITY.md) says, never in a public issue.

## Obsidian’s guidelines

The plugin store's own linter (`eslint-plugin-obsidianmd`, run by `npm run lint` with no warnings allowed) checks most
of Obsidian's rules, sentence case in the interface among them. These are the guidelines it does not check:

- **Styles use the theme variables**, such as `var(--text-normal)` or `var(--color-orange)`, never a fixed colour. Every
  selector in `styles.css` is scoped by one of the plugin's own classes, `thoughtknot-*` or `gql-*`.
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
- **No network requests,** with one exception (spec §13, §19). The exception is a send to an AI model the user has set
  up, only when the user sends it. It is made by `packages/obsidian/src/ai/send.ts` alone with Obsidian's `requestUrl`,
  never an SDK. It is reached only from the send dialog. No databases and no remote images.

## Code style

- **One formatter for each language.** Prettier for JavaScript, TypeScript, CSS, JSON and YAML (`.prettierrc.json`:
  120 characters, single quotes). Ruff for Python. Run `npx prettier --write .` and, in `python/graph_spec`,
  `uv run --locked ruff format`. CI runs `npm run format:check` and `ruff format --check`.
- **TypeScript is strict** in every package (`"strict": true`). The core is written in erasable TypeScript only, so
  Node runs its tests with no build.
- **The Python library follows PEP 8**, checked by `ruff check`: rules E, W, F and N. Lines go up to 99 characters, the
  most PEP 8 allows by agreement. A `# noqa` is allowed only with its reason on the same line.
- **Tools are pinned exactly** and carry a licence on the allow-list. They run no install scripts, and are taken only
  once a release is at least 7 days old.

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
  Python's tools expect. Tools that run from the command line go in `bin/`, and the browser harness in `harness/`. The
  Claude Code editor's local server runs in Node and goes in `packages/claude-code/server/`. It is held to the same
  naming, size and comment rules as `src/`.
- **One module, one purpose.** Each module opens with a comment saying what it is for, in a sentence of at least five
  words, and which part of the spec.
- **The public interface is documented where it is declared:** every export has its own comment, directly above it. In
  `packages/graph-spec`, whose modules are CommonJS, that is every name in `module.exports`, at its declaration.
- **The core is host-free:** it imports no Obsidian, editor or Node module, so it runs on a phone and, later, in VS Code.
- **Small modules, one responsibility each, in folders named for their feature** (spec §13, "No monolith files"). No
  source file is over 400 lines, and no test file over 600, checked in CI. A split follows responsibilities, never line
  counts.
- **Named so a search by name finds it:** folders and files are named for the feature they hold, never `utils`, `misc`,
  `helpers`, `common` or `lib`.
- **The README's "How the packages fit"** names every package, its layer and its guide, so a reviewer sees the whole
  before the parts.
- **Each package has a short `GUIDE.md`** saying where things live and naming every folder of its source. It changes in
  the same commit as the code it describes.
- **Small, typed interfaces:** a module exports a few typed things, so it can be used without reading its inside. In
  Python, every public module, class, method and function has its docstring (Ruff's D1 rules check it) and type hints.
- **A package's entry points stay put.** These are the modules other code and the vault import: `gql_profile.py`,
  `graph_rules.py`, `graph_spec.py`, `graph_svg.py`, `graph-spec-check.js` and the core's `index.ts`. They re-export
  the smaller modules, so a split never breaks a caller. The released `graph-spec-check.js` is built into one file and
  never edited by hand.
- **Tests mirror the code:** a module's tests sit in a file named after it, and each test file runs on its own in
  seconds. A test moved between files keeps its name, so the tests-first record knows it is not new.

## Tests that span modules

These test behaviour across modules, or the repository itself, so they are named after their subject.

### The core

- `packages/core/test/abuse.test.js` — no sequence of edits or text crashes the viewer (spec §12).
- `packages/core/test/bidi-labels.test.js` — each element of the display layer that shows the person's own names,
  labels or values is read from its first strong letter. It is set apart from the words around it
  (`unicode-bidi: plaintext`). Each is an element the layer makes (editor spec §42, bidi_labels; partial until the
  drawing and the exports join it).
- `packages/core/test/display.test.js` — styled views and paths change only what they choose, and keep the locked hues, contrast and legend (editor spec §7).
- `packages/core/test/view-parity.test.js` — every view of the shared table (`python/graph_spec/tests/view_cases.json`)
  is found in its note, read, and returns the things the table gives. Every query outside the view profile gets the
  table's refusal (editor spec §7, views_agree_with_grafeo).
- `packages/core/test/views-across.test.js` — a view saved as shown is written in the style graph, never the data, and reopens the same (editor spec §7).
- `packages/core/test/edge-cases.test.js` — empty, broken and oversized inputs each give a stated result, never a blank or a crash (spec §9).
- `packages/core/test/edits.test.js` — every edit from the pane round-trips; locking writes a schema the checks pass.
- `packages/core/test/proposals-checked.test.js` — a proposal is run through the graph spec's own change-set check, and
  the answer shown.
  - Every proposal written, removals and decisions included, passes it.
  - A removal is a DELETE, a change of a value a SET, and a change's id is derived from its statement.
  - A decision is kept as a Decision in the note's judgement graph, and a rejected addition leaves the live graph.
  - The decider is the settings' text as typed or "you" (editor spec §17, proposals_checked, decider_named; the graph
    spec's cs-rejected-out).

### The core: undo, copies and exports

- `packages/core/test/undo-over-theirs.test.js` — undo never undoes over a change another program, a sync or another
  pane made to the block. The history starts again from the note as it now is, and Undo and Redo say why there is
  nothing to take back. A change elsewhere in the note leaves undo working (editor spec §9, undo_never_over_theirs;
  §26, cc_undo_safe).
- `packages/core/test/undo-one-block.test.js` — undo stays in its block. Switching the pane to another block starts
  that block's own history, so Undo and Redo never write one block's text into another. A reason that held for the
  block left is not given for the one chosen (editor spec §9, undo_stays_in_its_block).
- `packages/core/test/block-copy.test.js` — the block followed, not its copy. Another program may paste a copy of the
  open block and then edit the original. The session keeps to the original, so Undo never reverts the copy while their
  edit survives. A copy it cannot tell from the block stops it. Every write and Undo is refused, saying so, until a
  block is chosen again (editor spec §9, block_followed_not_its_copy).
- `packages/core/test/notes-export.test.js` — each data export keeps the `///` notes where its format has comments: a
  GQL block's `///` lines and GraphML's XML comments. They are read back as written however hostile. CSV has no
  comments, so it leaves them out. The text an engine is given keeps them too (editor spec §24, note_standard).
- `packages/core/test/imports.test.js` — the core imports no host.
- `packages/core/test/hosts-boundary.test.js` — the host-side modules of the core (`src/hosts/`, reached as
  `@thoughtknot/core/hosts/<module>`) are imported by no gate or other core module. They are not exported by the entry,
  and import only types from the core (editor spec §19, model_ceiling).

### The Claude Code editor: build, server and page

- `packages/claude-code/test/build.test.mjs` — the build writes the mod's hooks bundle, with no WebAssembly engine, and a render script that draws.
- `packages/claude-code/test/editor-threats.test.js` — the browser editor's server against its threat model, each
  threat tried on the running server (editor spec §26, test_cc_threats). The threats are:
  - loopback only, wrong Host, wrong Origin, no token or a wrong one, a token in the address, and a stale write;
  - an oversized body, the content security policy, no CORS, and a path escape on the test-only note route;
  - the server's own limits, no outgoing request, and the idle stop.
- `packages/claude-code/test/editor-threats-process.test.js` — the same threat model tried on the server's process: no
  argument taken, and the token handed over once and kept nowhere. There is no start when orphaned, and every way the
  process stops is tried (editor spec §26, test_cc_threats).
- `packages/claude-code/test/editor-export.test.js` — the browser editor's export written by the server (editor spec
  §26, test_cc_export). Only new files go in the export folder, never over a file or through a link. A name is only a
  name, and an export is written whole or not at all. Every change checks the token, Host, Origin and body limit.

### The Claude Code editor: its page

- `packages/claude-code/test/editor-page.test.js` — the browser editor's page (editor spec §26; test_cc_page). It
  covers cc_core_only (C4), accessibility and motion (C8), the host shell (C5) and editing (C9).
  - Accessibility and motion (C8, `editor-page-access.js`): the skip link, and menus walked by the arrow keys. It checks
    an accessible name on every control, the keyboard kept in place across a redraw, and a visible focus. Reduced
    motion stills the page, and the text version is present and kept in step with the note.
  - The host shell (C5): one Markdown renderer with raw HTML off, and text shown as text. Layout runs in a same-origin
    worker. It covers the theme, icons as image files, offline, and settings read only.
  - The page takes everything from the core and the display layer shared with the Obsidian host
    (`packages/core/src/display/`), and imports no Obsidian code. This is tried on the layer's imports and on a bundle
    of the page's side. It is also tried on the layer run through a plain host with no Obsidian in the process.
  - Editing (C9, `editor-page-editing.js`, over `editor-page-live.js`): the page as built is run in a DOM against the
    real server and a vault on disk. The page opens the note with the drawing inline, its details and the edit pane of
    the Obsidian host. That pane is the layer's `display/editor/`, and the plugin keeps only its vault note.
  - The drawing's colours are set through the CSSOM, so no style attribute or sheet reaches the parser under the policy
    as it was. What is typed is written by the server and drawn again. Undo and Redo work.
  - A block changed on disk meanwhile is never overwritten, and is kept as a draft. Undo never goes over another
    program's change. Nothing is written while the note is above the gate.

### The Claude Code editor: parity with Obsidian

- `packages/claude-code/test/editor-parity.test.js` — the same edit writes the same bytes in the browser editor's
  session and in Obsidian's edit pane, Undo and Redo too. So does a decision on a proposal, through the page's card
  against Obsidian's strip. It runs over shared cases (editor spec §26, cc_same_bytes; test_cc_parity).
  - C9 adds (`editor-parity-page.js`) every kind of edit the pane makes. Each is made on the page as built and in the
    plugin's pane, byte for byte.
  - The edits are typing, a fix, a suggestion, Undo and Redo, and Lock the graph. They include an estimated link's
    quick fix from the drawing, and another block chosen. The note changed elsewhere first, and a stale write, are
    tried too.

### The Claude Code editor: the mod and its gates

- `packages/claude-code/test/editor-mod.test.js` — `/graph edit` from the mod, tried on the launcher over real server
  processes started as the host starts one. The address is handed to the pane alone and never to the conversation. A
  start that fails is said plainly, and there is one server for each session. The server is stopped by the session
  ending, `/graph stop` and its own end (editor spec §26; test_cc_mod, partial until C7 adds its cases; C3's gate cases
  are in it).
- `packages/claude-code/test/editor-mod-matrix-links.test.js` — a matrix note whose real path is outside the vault is
  not read. That holds whether it is by a link on the note or on a folder above it. A note the host cannot place is not
  read either, and the server is handed the same refusal. The real path is asked of a host that can only start a
  process (editor spec §26, cc_classified_asks; §19, model_ceiling).
- `packages/claude-code/test/editor-mod-matrix.test.js` — Claude's level from the destination matrix, in the mod and
  the server. The mod reads the matrix note from inside the vault only. It hands the server the row, switches, class
  names and rows. Both gates give the same answer on the same inputs. They fail closed alike when the note cannot be
  read (editor spec §26, cc_classified_asks; §19, model_ceiling).

### The Claude Code editor: Claude's proposals and the gates

- `packages/claude-code/test/editor-mod-claude.test.js` — Claude is the only AI the browser editor offers. What it
  changes in the note open in the pane reaches it as a proposal through the mod. That is a checked change set the user
  accepts or rejects. The store writes it whole and in turn. It applies only on accept, and its key is good for that
  one route. It is refused for a note above its clearance (editor spec §26; cc_claude_only,
  cc_claude_proposes).
- `packages/claude-code/test/editor-mod-claude-tools.test.js` — `guardOpenNote` refuses Claude's own Write, Edit,
  NotebookEdit and Bash calls on the note open in the editor. The refusal points to the propose tool. So a change
  to that note is never applied by Claude's own tools while `guardOpenNote` holds. A note that carries instructions
  gets a proposal that waits on the card, never a change (cc_claude_proposes; risks AI-1, AI-3).
- `packages/claude-code/test/editor-mod-claude-limits.test.js` — what the security review of #483 found. A proposal
  cannot grow the note without limit: its size, a value's and a reason's length, and how many wait. The proposer's key
  is passed on standard input and not in the environment. Claude's own text never carries the user's yes, and what it
  says it read is one line (editor spec §26; cc_claude_proposes).
- `packages/claude-code/test/editor-mod-gate.test.js` — the gate's hardening from the review of #475, tried on the
  launcher. Only the person typing in the composer can say yes. The yes goes to the server for the content it was given
  about (editor spec §26; cc_classified_asks).
- `packages/claude-code/test/editor-mod-support.test.js` — the page the build makes is there before the editor tests
  start a server. In a fresh checkout the suite runs before `npm run build` and beside the build's own test. A server
  never refuses to start there for want of the page (editor spec §26).
- `packages/claude-code/test/editor-store-gate.test.js` — the gate inside the server's note store, asked before every
  send. It covers a read, a draft, the change stream and a stale write's answer. A yes does not carry over to changed
  content (editor spec §26; cc_classified_asks, cc_credential_never).

### The Obsidian plugin

- `packages/obsidian/test/accessibility.test.js` — contrast in both themes, and a keyboard path for every action.
- `packages/obsidian/test/matrix-send.test.js` — the send dialog and the destination matrix note. The note is read each
  time what will be sent is shown. A note that cannot be read refuses plainly, with nothing ready to send. A read that
  finishes after the model or the question changed makes nothing ready (editor spec §19, model_ceiling).
- `packages/obsidian/test/notes-shown.test.js` — a note shown in a thing's or link's details as Markdown through the
  one renderer, raw HTML never rendered. A setting draws notes as callouts joined by a dashed line. It is off by
  default, over a layout the same as without them. The same note's first paragraph shows in the quick-info tooltip
  (editor spec §24, note_shown, note_callouts).
- `packages/obsidian/test/details-open.test.js` — the details panel kept open by a setting, off by default, in a card
  and in the pane. It shows the graph's summary while nothing is chosen. It sits beside the drawing, and below it where
  the card is narrow (editor spec §24, details_always_visible, details_narrow).
- `packages/obsidian/test/build.test.mjs` — the build writes the files the plugin is installed from.
- `packages/obsidian/test/remote-images.test.js` — an image from outside the vault, in a thing's details or a note
  embedded there, is a link with a Load image button. Only pressing it loads that image (editor spec §18,
  remote_images_asked).
- `packages/obsidian/test/inline.test.js` — editing in place in the drawing's card.
- `packages/obsidian/test/views-many.test.js` — several views of one graph, in one note or in several. Each is drawn
  from the one data set where it is written, and none copies it. A view of a graph written in another note says which
  and opens it (editor spec §7, many_views_one_data, view_of_another_note).

### The graph format library

- `packages/graph-spec/test/characterisation.test.mjs` — the library gives the answers recorded before it moved here.
- `packages/graph-spec/test/commas.test.mjs` — both readers read a missing comma the same way, and write it into the same corrected text.
- `packages/graph-spec/test/escapes.test.mjs` — both readers read quoted text's escapes as GQL does. They refuse one GQL
  does not name, with the fix that doubles the backslash, and quote a text alike (req:3.gql-escapes; one table,
  `escape-cases.json`).
- `packages/graph-spec/test/problem-codes.test.mjs` — every problem the JavaScript reader raises passes a stable code
  from `src/reader/problem-codes.json`, with that code's message and fix. The blocks of `problem-code-cases.json` are
  refused with their codes (editor spec §42, problem_codes).
- `packages/graph-spec/test/layout.test.mjs` — the layout source is byte-identical to the Python library's.
- `packages/graph-spec/test/lint-parity.test.mjs` — the JavaScript dialect linter matches the Python one.

### The Python library

- `python/graph_spec/tests/test_changeset_header.py` — a change set's first line is read as the reader reads a
  block's, in the engine's copy and the rules'. Lines end at LF only, and whitespace is GQL's set.
- `python/graph_spec/tests/test_engine_gets_corrected.py` — every route to the engine gives Grafeo the reader's
  corrected text. So a link type without its colon is accepted by both parsers. The text keeps the block's own lines
  (req:3.engine-gets-corrected, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_gets_commas.py` — every route to the engine gives Grafeo the reader's corrected
  text, with each missing comma written in. It goes at the end of the code on its line. So a block missing one loads as
  the profile parser reads it, and no line is added (req:3.engine-gets-commas, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_text_comments.py` — every route to the engine gives Grafeo each whole-line
  comment as a `/* */` comment on its own line. A `*/` in its text is broken up, and a line ends at LF only
  (req:3.engine-keeps-comments, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_problem_codes.py` — every problem the Python reader raises passes the stable code
  `problem-codes.json` gives it, the same as the JavaScript reader's. The blocks of `problem-code-cases.json` are
  refused with the same codes (editor spec §42, problem_codes).
- `python/graph_spec/tests/test_escapes.py` — the Python reader answers `escape-cases.json` as the JavaScript one does, and what the engine writes for Grafeo keeps a text's escapes (req:3.gql-escapes).
- `python/graph_spec/tests/test_id_once_engine.py` — every route to the engine reads the block with the reader first.
  So no id reaches it twice in a graph (req:3.engine-reads-first, req:3.id-once).
- `python/graph_spec/tests/test_ids_engine.py` — every route to the engine refuses a SET of a node's id. It also
  refuses a node id that is not text, read by the reader first (req:3.set-keeps-id, req:3.id-is-text).
- `python/graph_spec/tests/test_layout_source.py` — the Graphviz source is the one written before the move.
- `python/graph_spec/tests/test_licences.py` — every Python package carries an allowed licence.
- `python/graph_spec/tests/test_parity.py` — the Python library gives the JavaScript library's answers.
- `python/graph_spec/tests/test_reader_agrees_with_grafeo.py` — the reader and its plain rules give Grafeo's answers, Grafeo being the reference engine and a test dependency only (req:17.engine-agreement).
- `python/graph_spec/tests/test_view_parity.py` — Grafeo, running each view of `view_cases.json` as written, returns the
  things the core returns (editor spec §7, views_agree_with_grafeo). It is given a fixed list of GQL's and Cypher's
  words. It refuses as a name and as a kind exactly the words the core keeps from them.
- `python/graph_spec/tests/test_settings.py` — what a host sets after importing the library.

### Colours and direction

- `test/forced-colours.test.js` — every view in forced colours and with more contrast asked for (editor spec §44,
  forced_colours).
  - Each sheet gives every colour token its system colour (`FORCED_TOKEN_COLOURS`). For more contrast, secondary text
    and lines take the full text colour (`MORE_CONTRAST_TOKENS`).
  - The drawing draws each box, line and word in the system's colours, in the plugin and as the page's image.
  - Nothing is shown by a shadow alone, and no focus ring is hidden without another way of showing focus. Only the
    rules listed keep their own colours.
- `test/host-adapters.test.js` — every host's real adapter passes the one host contract of
  `packages/core/src/display/host-contract.ts` (editor spec §43, hosts_pass_contract). Obsidian's is built as the plugin
  builds it, and the browser page's runs in a DOM. It is partial until the standalone app and VS Code join it.
- `test/rtl.test.js` — the style sheets say sides by reading direction (`margin-inline-start`, `inset-inline-end`,
  `text-align: start`), so the interface mirrors in a right-to-left language. The only rules on a physical side are
  those placed at a point measured on the screen, each listed with why. Each view's root reads in the host's direction
  (`readInHostDirection`), and the drawing keeps the screen's (editor spec §42, rtl_mirrors).

### Languages, tokens and text size

- `test/pseudo-locales.test.js` — every view of every host, drawn in the test languages `en-XA` and `ar-XB`.
  - `en-XA` is accented and 40 per cent longer, and `ar-XB` is read right to left.
  - No catalogue word is left in UK English, and each view reads in the language's direction. No part is set on a
    physical side but those placed at a measured point.
  - The words the code still says itself, not yet in the catalogue, may not grow in number.
  - No box that holds words has a fixed width or clips them, unless listed with why.
  - Editor spec §42, pseudo_locales_checked. It is partial, as overlap needs a layout: RELEASING.md, AX-20 and AX-21.
- `test/theme-tokens.test.js` — the interface is styled through the design tokens alone (editor spec §44,
  ui_theme_tokens).
  - Every rule of `styles.css` and the browser page's `page.css` reads a `--gn-*` token (`THEME_TOKENS`) or an
    element's own measure, never a host's variable.
  - Each sheet maps its host's theme to every token in one block. Obsidian's does so by the core's table
    (`OBSIDIAN_TOKEN_MAP`), and the page's from the theme it is built with.
  - No token takes a name the drawing's own colours use.
- `test/text-scaling.test.js` — text scales to 200 per cent with nothing lost (editor spec §44, text_scaling). Every
  text of the interface is sized by a token or its parent's size, never in pixels or points. The drawing's own marks
  are aside, as they scale with its zoom. No line height is fixed, and no box that holds text has a fixed height. The
  browser page's theme sizes its text in rem.

### Test tooling and the build status's parts

- `test/import-graph.test.js` — the import graph, and the tests that reach a changed file through it. It covers imports
  by path and by package name, and a file or folder a test names to build or walk. It also covers how
  `npm run test:changed` picks them (editor spec §13, affected_tests_by_imports).
- `test/cheap-checks.test.js` — the quiet test run, running only a change's tests, the AI guide and the search ignore file.
- `test/build-status.test.js` — the build status's pure part. It covers the requirements a pull request moves, found
  from the tests it newly marks written. It also covers the stage an event gives, which value may replace which, and the
  comment and the annotations.
- `test/build-status-gh.test.js` — the build status's calls to GitHub, through in-memory stand-ins for `gh`. They cover
  a pull request, the requirements file at a ref and its size, CI's run and the releases. They also cover the pull
  requests merged in a span, the one comment, leaving it on a locked conversation, and the two tokens kept apart.
- `test/build-status-seed.test.js` — the first values the mirror gives an item that has none. They are Released,
  Merged, In PR or Not started, with the built-in Status to match. A draft release does not count. It checks the tally
  `--check` prints, and that a value already set is never overwritten (only Todo replaced).
- `test/build-status-gh-lock.test.js` — leaving the comment on a conversation that may be locked. A pull request is
  unlocked only when its own `locked` field is true; a refusal that says blocked unlocks nothing. The lock is taken up
  again with the repository's retry, or the pull request is said to be left unlocked.
- `test/build-status-gh-lists.test.js` — the open pull requests and those merged in a span, of this repository's own before any cap, past a crowd of fork pull requests.
- `test/build-status-board.test.js` — the build status's project board: each item's Build status and Status, and
  setting either. The issues are read with the workflow's token, and the project with the project token alone. Every
  trouble that is the board's own is tried.

### The build status: runs, claims and workflows

- `test/build-status-run.test.js` — the build status event by event.
  - The events are a pull request opened, CI's checks failing and passing, its merge and closing, and a release.
  - It covers the pull requests it leaves alone: a fork, a stale one, one merged elsewhere. It covers a very large one
    too.
  - A project token that is missing, expired (401) or refused warns and never fails.
- `test/build-status-env.test.js` — the build status run whole from a workflow's environment. It covers the event file,
  the two tokens each to its own runner, the exit code, and a requirements file too large to read.
- `test/build-status-started.test.js` — Started on: the day a pull request of this repository first took a requirement
  on, by its copy or its Requirements line.
  - It is set once. It is kept when the pull request merges, or while another pull request holds the item.
  - It is cleared when the pull request closes unmerged and nothing else holds it.
  - The mirror's seed sets the earliest such day where none is. It clears it only for an item Not started. It keeps it
    for one proved, `part` on main (1 of 3 tests written and merged), or In PR or later.
- `test/build-status-claims.test.js` — the built-in Status field (Todo, In Progress, Done), and an item two pull
  requests hold. It also covers the `Requirements:` line of a draft pull request, the only part of its untrusted
  description that is read.
- `test/build-status-comments.test.js` — the comments after a pull request is closed and locked. They are the Merged
  comment, and the Released comment a release leaves on each pull request it moves. It is left by unlocking, commenting
  and locking again, and every way that can fail is tried.
- `test/build-status-workflow.test.js` — the two build status workflows. They are woken only by the checks of a pull
  request, a push to main and a release. The project secret is given only to the script on main. No event text goes in
  a command line, and they hold least privilege.

### The library's release

- `test/lib-release.test.js` — each release publishes the library on GitHub, never on npm (spec §41, lib_github_release).
  `scripts/library-release.mjs` builds two packages, graph-spec and the core, and the test installs both with no
  registry and runs a program on them.
  - `scripts/changelog.mjs` writes the release notes: the pull requests merged since the last release, and a Library
    changes section. That section says what the interface added or broke, and the version rule (version_promise_told).
  - `--check` refuses notes without it. The release runs it before it drafts, and the release check tries it first.
- `test/lib-public-api.test.js` — the library's public interface (spec §41, lib_public_api). It is declared in
  `public-api.json`, which `node scripts/public-api.mjs --update` writes. A break since the last release fails
  unless the package takes a new major version. Before 1.0.0 that is the leftmost part that is not 0, such as 0.8.0.

### The graph spec

- `test/graph-spec-text.test.js` — the graph spec's text is in `requirements/graph-spec.gql` (spec §13,
  graph_spec_in_repo; ARCH-11). Every § either library cites is one of its sections; the editor's own say "editor spec".
- `test/graph-spec-index.test.js` — the graph spec file is true to itself (spec §51, spec_index_true; GS1): its counts,
  the paths it names, and no pending rule that a test proves.
- `test/graph-spec-proved.test.js` — every graph-spec rule a test here cites by its id counts as proved (spec §51,
  spec_rules_proved; GS1). A 'general' proof or a case kept outside the repository counts for nothing.
  `quality/graph-spec-unproved.json` lists the rest, and it only shrinks: `node scripts/graph-spec-proved.mjs --update`.
  A rule also counts as proved when its proof names a test in a conformance case kept here.
- `python/graph_spec/tests/test_conformance_suite.py` — the graph spec's conformance suite passes on the code here
  (spec §51, spec_conformance_in_repo; GS1). The suite is in `python/graph_spec/conformance/`.

### The repository, its community files and device checks

- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/walkthrough-record.test.js` — each stable release keeps a record of the accessibility walk-through (spec §11,
  walkthrough_recorded; UX-1). `scripts/walkthrough-record.mjs --new` writes an empty one to fill in. The release and
  its dry run fail until every check is ticked, or given its reason, in every host and theme.
- `test/community-files.test.js` — the code of conduct says how to report a problem in private. `TRADEMARKS.md` keeps
  the name for the original. CONTRIBUTING.md and the pull request template ask for every commit to be signed off
  (editor spec §13, community_files). `SECURITY.md` names the supported versions, a private way to report and a
  reply time (security_policy).
- `test/working-group.test.js` — `docs/agents/ROLES.md` gives Roger, Claude, Antigravity and graph-note their work,
  labels and branches, and repeats the rules each keeps. `AGENTS.md` points to it.
- `test/device-check-notes.test.js` — the device checklist numbers every item (editor spec §3, tried first in a test
  vault).
  - The test vault holds one note for each item after Before in `Device checks/`. The note's checklist line is the
    item's words.
  - Each note's graph blocks read as it says they do, by the repository's reader and checker, and `parseView` for a
    view.
  - The index lists the notes in order.
- `test/device-check-quotes.test.js` — what a device check note quotes from Obsidian's screen is computed from the
  note's own graph blocks with the real functions, and matches exactly. The quotes are a read-back, a label, the tap
  text of an estimate and a box's details. They are also an export's footer and file name, and the conversion notice.
  The notes' generator scripts and filler set up the case they describe (editor spec §3).
- `test/engine-version.test.js` — the Graphviz version is read from the engine, named in the notices, and checked against published advisories.
- `test/ethos.test.js` — the project's ethos (`requirements/ethos.gql`). Every rule names the requirements that check
  it, or says a person checks it or nothing does yet, and only requirements that exist. Each fault is named. The wiki's
  Ethos page shows each principle and each rule's state (editor spec §41, ethos_checked).
- `test/fixed-sleeps.test.js` — no new fixed sleep in the tests. An awaited `wait(20)` or the like outside a polling
  loop is held, file by file, to the allowance in `test/fixed-sleeps.json`. That allowance only goes down
  (`node scripts/fixed-sleeps.mjs --tighten`).

### The GitHub mirror of the requirements

- `test/github-project.test.js` — the GitHub mirror of the requirements as a person runs it. The real workstreams file
  puts every requirement of slices 3 and 4 in exactly one workstream. It may name ids a later copy brings. The command
  is a dry run by default, with no network call.
- `test/github-project-desired.test.js` — that mirror's desired state. It covers the first clause of a rule, and each
  issue's title, body, labels and open or closed. It also covers the marker, and the project's fields and options.
- `test/github-project-gh.test.js` — that mirror applied through an in-memory stand-in for `gh`. It covers a first
  apply, a second that changes nothing, and drift put right. A removed requirement is labelled and closed, and nothing
  is ever deleted.
- `test/github-project-gh-owner.test.js` — that mirror's project found, made and filled through GraphQL by the owner's
  login. The runner used is one for which every `gh project` verb fails with "unknown owner type". An owner or a list
  that is not there is an error naming the owner, never no projects.
- `test/no-gh-project-verb.test.js` — no script under `scripts/` builds a `gh project …` argument list or names
  `item-edit`. gh checks scopes `PROJECT_TOKEN` lacks, so item values are set and cleared by GraphQL.
- `test/github-project-gh-safety.test.js` — that mirror's care. Every call names its repository or owner, and gh must
  point at the origin's repository. Mutating calls are paced and retried once on a secondary rate limit. A list that hit
  its cap is refused.

### The GitHub mirror: retries, waves and fields

- `test/github-project-retry.test.js` — that mirror's patience.
  - A timeout, a reset connection, a 502, 503 or 504, or "something went wrong" is waited out 5, 15 and 45 seconds and
    tried again. A fourth failure stops the run.
  - A create that went through before the failure is never made twice. Only an issue the signed-in login wrote is
    taken up again.
  - The worst case is 65 seconds of waiting (5 + 15 + 45) for one call. The same again is spent on each look at GitHub
    before a retried create, before the run stops with gh's words.
- `test/github-project-waves.test.js` — that mirror's waves plan, `requirements/waves.json`, read and refused.
  - Each requirement's Wave and Order are derived from it, and a reordered plan moves Order.
  - It covers the iterations of the Wave field, and the tally `--check` prints. That tally warns of each requirement in
    no wave that is not proved.
  - The real plan holds every requirement of slices 3 to 10 not yet proved.
- `test/github-project-fields.test.js` — that mirror's fields that are not a single choice, each derived.
  - Closed on is set on close from the issue's closedAt, for one closed before the field existed too. It is cleared on
    reopen, unchanged when right and put right when not.
  - Wave is an iteration field with a wave's dates, and Order a number. Both are moved by a reordered plan and cleared
    for a requirement in no wave. An iteration is kept by its id when its dates change.
  - It covers the rule Started on follows.
- `test/github-project-adopt.test.js` — whose issues the mirror and the build status take for their own. They take the
  owner's and the workflows' bot's (`app/github-actions` as gh gives it), never a stranger's or another app's. The
  bot's first apply makes them, and its second changes nothing. An apply by any other login is refused.

### The mirror's workflow and other workflows

- `test/github-project-run.test.js` — that mirror run by its workflow.
  - The issues are written with the workflow's token and by its bot, and the project with `PROJECT_TOKEN` alone. A
    second run changes nothing.
  - A missing or refused project token is a warning, with the issues mirrored alone. A seed with warnings applies
    nothing.
  - `--accept-warnings` and `--allow-removals` are refused, and anything else is an error. No token is printed, and the
    command hands over in GitHub Actions.
  - It covers the time budget. Issues the creator list does not give back are still made once, and never again by a
    later push; the newest issues show them.
  - More than 20 creates on a board with its issues are refused, and GitHub's rate limits are a warning.
- `test/github-project-downgrade.test.js` — that mirror when a requirement's proof goes down, and when GitHub is slow.
  - Proof going down is proved to part or open. The issue is reopened and relabelled, and Status and Closed on are put
    right. The edits are done before any creating.
  - GitHub may be slow to list the bot's new issues. They are looked for again, and the newest issues read too. There
    is no duplicate and no needless stop.
- `test/github-project-workflow.test.js` — the workflow that runs that mirror. It is woken by a push to main alone, and
  `issues: write` is its one write permission. One run goes at a time and none is cancelled. Main is checked out with
  nothing installed, the one command runs, and the project secret is given only to it.
- `test/claude-review-workflow.test.js` — the workflow that leaves Claude's review on a pull request.
  - It is woken by a pull request, never `pull_request_target`. It is skipped for forks, drafts and Dependabot.
  - `pull-requests: write` is its one write permission. The token is given only to the step that checks it and to the
    action.
  - No checkout keeps credentials, and the review approves, pushes and edits nothing.
- `test/github-project-blocks.test.js` — that mirror's blocked-by links. Each open question's issue blocks the issues
  of the requirements it blocks, made once. A link the requirements dropped is removed, and a person's is kept. A
  refusal by GitHub is a warning, with the issues and project still mirrored.
- `test/github-project-plan.test.js` — that mirror's plan: what differs between the desired state and what GitHub holds, for the issues, the labels and the project.

### Benchmarks, licences, network and policy

- `test/instruction-counts.test.js` — the benchmarks' work counted in CPU instructions. Cachegrind's output is read,
  and each case counted less its setup. The claims are checked. Nothing is counted, and it says so, where Valgrind is
  not installed. Every benchmark case still does its work.
- `test/ignore-entries.test.js` — an entry of `.ignore` that git ignores as build output may be missing in a fresh
  checkout. Any other entry that names a file must exist, so a misspelt path is caught.
- `test/licences.test.js` — licences through the whole build chain, and the one allowance for a GPL tool run in CI alone and never shipped.
- `test/offline.test.js` — no network request but the one exception, a send to an AI model the user set up. The
  bundled engine makes none. The core's AI send makes none of its own, going only through the transport it is handed.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI. It also covers the one
  module that may reach the network, reached only from the send dialog. Nothing in the AI's folder runs on a timer or
  an event.
- `test/workflow-timeouts.test.js` — every job of every workflow sets a time limit. So a hung step never holds a
  runner for hours (editor spec §13, ci_jobs_time_limited).
- `test/releasing.test.js` — RELEASING.md lists the steps of a release in order and how to go back. It names every
  secret a workflow uses (editor spec §13, release_steps_written).
- `test/release-prepare.test.js` — one command bumps every file that carries the version, both lockfiles included
  (editor spec §13, release_steps_written).
- `test/release-from-main.test.js` — a stable release is built only from a tag on main. The release's first job checks
  the tag before anything is installed, and every other job waits for it (editor spec §13, release_from_main).
- `test/ai-disclosed.test.js` — the AI use disclosed in the README. Content goes only to models the user sets up, only
  when the user sends it. The one exception to no network use is stated precisely (spec §19, ai_disclosed).
- `test/public-readiness.test.js` — fit to be public and kept so. It covers a clean history, and a fresh clone set up
  from the README alone. It also covers GitHub settings that let only a collaborator contribute.
- `test/repository-scans.test.js` — the source scans behind the one network exception. The AI send module is found
  however it is imported, and Obsidian's `request(` is taken for a request. Every timer and event is found.

### What CI runs for a change

- `test/fresh-clone.test.js` — when a pull request runs the fresh clone. It runs only for a change that can alter what
  the README's steps do. That is the steps, the npm scripts, the hook or the git settings (spec §13, Delivery).
- `test/ci-plan.test.js` — what CI runs for a change. A draft runs only the tests its change reaches. Anything else runs
  everything, and a failed plan runs everything too (spec §13, touched_tests_only).

### The quality ratchet and the test runner

- `test/quality-metrics.test.js` — the quality metrics are held to a committed baseline, and a worse one fails without a recorded reason.
- `test/quality-baseline.test.js` — the baseline cannot be loosened without a reason, is whole, and says which machine measured it.
- `test/quality-instructions.test.js` — the instruction counts in the ratchet.
  - There is one metric for each benchmark, with a small tolerance. It is held only against counts from the same
    machine.
  - It is not measured where Valgrind cannot run, which fails only on Linux. The counts are recorded and printed until
    the baseline holds them.
  - A claim that does not hold always fails. Test duration only warns.
- `test/risk-register.test.js` — the register of known risks is well formed. The release is stopped by an open fix-now
  risk, an overdue one or a stale one. RISKS.md is what the script writes from the register.
- `test/risk-panel-workflow.test.js` — the risk panel workflow runs by hand and spends a Claude session only when
  something moved. It keeps its token to one step, and its one writing job keeps an issue up to date with gh alone.
- `test/security-alerts.test.js` — the security alerts each release reads, through a fake GitHub and OSV. A stable
  release stops on any open alert, a nightly on high and critical ones, and a list not read is never taken as empty.
- `test/security-workflow.test.js` — the release, its dry run and the nightly read the security alerts in a job that
  installs nothing. The daily Security workflow writes its issue with gh alone, and fixes only on security branches.
- `test/quiet-reporter.test.js` — the quiet test run when a failure's details cannot be passed on, as when an assertion
  holds a function. Every failure is still reported, and the run failed, never crashed.
- `test/run-ceiling.test.js` — every run of the npm test commands, in CI too, is stopped with one line at a memory or
  time ceiling. That happens before a runaway test can exhaust the machine. A run within both passes through unchanged.

### The requirements, slices and slice board

- `test/requirements.test.js` — the requirements graph, the one source: started requirements proved, tests where they say.
- `test/requirements-note.test.js` — the requirements kept as a graph note. The graph as the one block of a Markdown
  note is read by every tool that reads the requirements. It passes the same audit as the graph file
  (requirements_as_graph_note).
- `test/check-requirements-flips.test.js` — the requirements graph is edited here, in pull requests (Roger, 16 Oct
  2026: no vault holds it any more).
  - Records, links and comments may be added, changed and removed.
  - A pull request never moves a test back in status. Only planned to partial, partial to written, and planned to
    written are allowed.
  - It never flips one forward without its file, and never removes a test that is partial or written.
- `test/slice-done.test.js` — a slice is done only when every one of its requirements is proved by a written test whose
  file is there.
  - The copy's banner must be as it should be, every slice a whole number, and every test kept where the check knows.
  - `check-requirements.mjs --done <slice>` says so or lists what is missing. The slice board's overview says the
    same. Each is tried on tampered copies of the requirements.
  - Every slice before the one under way is done (spec §12, done_means_proved).
- `test/readme-status.test.js` — the README's status line is made from the requirements graph, never by hand
  (readme_status_generated). It names how many slices there are, which are done and which is in progress.
  `node scripts/readme-status.mjs --write` puts it right after a slice is done.
- `test/slice-board-style.test.js` — the slice board's stylesheet. Its colour tokens agree in light and dark, and the
  altitude switch works by CSS alone. The layout holds at 400px. The source is written one rule and one declaration to
  a line.
- `test/slice-board.test.js` — the slice board: a CSS-only HTML page of how far the slice under way is proved. It is
  made from the requirements copy and, optionally, the open pull requests.

### The wiki and its pages

- `test/waves-on-time.test.js` — the plan stays true to the work. A wave behind for more than its own length fails,
  unless `requirements/waves.json` gives its reason.
- `test/wiki.test.js` — the project wiki. Every page is made from its file in the repository, ending with the file and
  commit it came from. The proved counts are as the slice board gives them. Every answered question is a decision and
  every other open. The roadmap's chart is free of the characters it reads as syntax. The releases come from GitHub or
  `versions.json`.
- `test/rename-to-thoughtknot.test.js` — the rename to ThoughtKnot (`scripts/rename-to-thoughtknot.mjs`): every form of the product name changes. The repository's address, its site, the GitHub Project's title and the kind of note keep theirs. A second run changes nothing.
- `test/wiki-developers.test.js` — the wiki's developer pages.
  - The architecture graph names only paths and requirements that exist, and every package. It is drawn with each
    thing's kind, and a planned part dashed.
  - Every extension point, contract check, design token, host member and problem code is listed from the code.
  - Each requirement is marked released, nightly only, being built or planned against the latest release.
  - The plug-in example installs and passes its contract.
- `test/wiki-guide.test.js` — the wiki's user guide. Every screenshot taken is shown once, and no other is asked for.
  Every setting is listed from the editor's own options, in plain words. A new button of the drawing is reported when
  the guide does not explain it.
- `test/wiki-review.test.js` — the review of the wiki pages people write or edit. Each is checked and never changed.
  There is a suggestion for each broken link or picture, old version and long sentence. A person's edit to a made page
  is reported, and an issue text pings no one.
- `test/plan-actuals.test.js` — the wiki's Plan versus actual page (`scripts/plan-actuals.mjs`).
  - A requirement is proved on the first day main held all its tests as written. Main's history is read merge by merge,
    through the move of the requirements file from `.gql` to `.md`.
  - Each wave shows its plan, its first and last proved days, the first stable release after and its slip.
  - The page lists what was proved each day, the seven-day rate, and a forecast for each wave left.
- `test/wiki-workflow.test.js` — the workflow that makes the wiki. It is woken by a push to main or a stable release.
  The pages are made with read access only, and the one job that writes runs no code of the repository.

### The nightly build, the home page and test files

- `test/nightly-workflow.test.js` — the nightly pre-release, run each night and by hand. It is built only when main
  moved, and published only after the full suite passes. The one job that writes runs no code of the repository. The
  last seven are kept, with the version `scripts/nightly-version.mjs` gives it.
- `test/site.test.js` — the project's home page, made from `site/index.html` and `site/words.json`.
  - Every word is used and none is missing.
  - It has the search and AI basics: title, description, canonical address, structured data, sitemap, robots and
    llms.txt.
  - It meets WCAG 2.2 AA in both schemes, and no side is said by left or right.
- `test/site-workflow.test.js` — the workflow that publishes the home page. It is woken by a push to main, each morning
  or by hand. The page is made with read access only. The one job that writes to GitHub Pages runs no code of the
  repository.
- `test/speed-index.test.js` — the one measure of a machine's speed, which the quality metrics record and scale their
  timings by. It is fixed plain work, the least of seven runs.
- `test/timed-assertions.test.js` — a test asserts the work done, never the time taken. No JavaScript test or its
  support asserts a span of elapsed time. A polling deadline, mock timers and a clock handed to the code tested are
  allowed.
- `test/test-files.test.js` — every file a test or a device-check note names is made by `scripts/make-test-files.mjs`
  (editor spec §12, tests_self_contained, test_files_generated). The images it makes decode and move: the GIF's
  compressed data, the APNG's frames, the WebP's lossless frames, the SVG and the PDF.
- `test/test-vault.test.js` — the test vault: dummy notes tied to requirements, nothing Obsidian writes committed, each session clean.
- `test/test-status-partial.test.js` — the third test status, `partial`: a test whose file is there but does not yet
  prove every rule its record covers. It needs its file like a written one. It leaves its requirement unproved in
  `--done`, and the reason says partial. It may be flipped to only from planned, and to written; every backward move is
  refused. It counts on the slice board as part and in progress, never proved.

### The tests-first replay

- `test/tests-first.test.js` — every test is seen to fail before its code, replayed commit by commit: how a replay judges a new test.
- `test/tests-first-command.test.js` — that replay's command line, run as CI and a person run it: `--check`, `--excuse` and `--migrate`.
- `test/tests-first-complete.test.js` — that command line's `--complete`: a commit that changed a test and has no record fails, until `--update` records it.
- `test/tests-first-failing.test.js` — that replay when a new test fails at its own commit. It is kept in the record as
  not replayed. When it passes run again, that is a failure of the record.
- `test/tests-first-faults.test.js` — `--excuse --fault` keeps the reason a test failed at its own commit. It does so
  only for a test the records hold as a fault. `--tally` and `summary` count it as `faultsExcused`, not as not
  replayed, and `--check` does not warn of it.
- `test/tests-first-checkout.test.js` — that replay's checkout of a commit. Its own workspace packages are linked under the scope its manifests give. So a commit from before a package scope was renamed still runs its own code.
- `test/tests-first-keeping.test.js` — that replay when something at the commit's own code cannot be trusted. That is a
  commit that cannot be replayed, or a record updated over what it holds.
- `test/tests-first-later.test.js` — that replay when the test and its code do not come together. It covers a test
  corrected later, one that comes before its code, and a new file whose code is not there yet. It also covers test
  support changed with it.

### The tests-first replay: more cases

- `test/tests-first-passed.test.js` — that replay when a new test passes against the code before it. It is reported,
  unless a reason is kept, and never excused by a name every object has.
- `test/tests-first-python.test.js` — that replay over a Python test, and a failure inside a subTest read as a failure.
- `test/tests-first-records.test.js` — the records of that replay: a file for each commit, so two branches never conflict in them.
- `test/tests-first-records-history.test.js` — this repository's own records. The old single files' entries are all
  held, and each record is named after a commit in the history. Every test file has its entry.
- `test/tests-first-records-merged.test.js` — those records when branches meet: two branches merged with nothing to resolve, and the old single files moved over whole.
- `test/tests-first-records-reasons.test.js` — the reasons kept for a test that passed before its code: a file for each, named after its test file and its test.
- `test/tests-first-tally.test.js` — that replay's `--tally`: what the records prove as JSON, and writes nothing.
- `test/tests-first-unfinished.test.js` — that replay when a run of a test file does not finish: stopped at the time limit, it proves nothing.
- `test/tests-first-run.test.js` — one run of one test file in that replay: what its report shows, and why it did not finish.

### Accessibility: WCAG and meaning

- `test/wcag.test.js` — every view and page of every host passes axe-core's WCAG 2.2 A and AA rules and the 4.5:1 text
  contrast.
  - It checks the light and the dark theme (editor spec §11, wcag_aa, wcag_new_hosts, wcag_checked).
  - Obsidian's views are its card in each state, its details, edit pane, export form, AI send dialog, proposal and
    quick-info tooltip.
  - They also include its style, step and view blocks, table, Live Preview card, settings and the menus it gives
    Obsidian.
  - The browser editor's page is checked in each state.
  - The check is tried on planted faults first, and a host with no entry fails.
- `test/a11y-semantics.test.js` — every control of every view and page of every host, as axe-core reads the
  accessibility tree (editor spec §41, a11y_semantics_auto).
  - The views are those `test/wcag.test.js` checks, kept in `test/repository/views-obsidian.js` and `views-page.js`.
  - Each control has an accessible name, is read as a control and says its state (checked, selected, expanded).
  - Each drawing's text version counts the things drawn, and says each as its box is labelled.
  - The check is tried on planted faults first.

### Accessibility: the keyboard

- `test/a11y-keyboard.test.js` — a keyboard-only run of every view and page of every host, the views
  `test/wcag.test.js` checks (editor spec §41, a11y_keyboard_auto).
  - Tab and Shift+Tab reach every element of the tab order, with the page's own key handlers live.
  - No element keeps the focus. A field that takes Tab is left with Escape then Tab.
  - An action out of the order is in a widget whose arrow keys reach it. One of each kind of action the page draws
    itself is operated with Enter or Space.
  - A dialog of ours keeps the focus in it, and is left with Escape from every control.
  - The check is tried on planted faults first. The browser editor's page is run in the four files below. Each of its
    states is checked to be in one of them.

### Accessibility: the keyboard on pages and devices

- `test/a11y-keyboard-page-1.test.js` — part 1 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 1. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-2.test.js` — part 2 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 2. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-3.test.js` — part 3 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 3. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-4.test.js` — part 4 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 4. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-devices.test.js` — the keyboard-only run of every view of the Obsidian host again. It runs on a
  phone and on a tablet with a keyboard attached, where the layout differs. There are tabs and a bottom sheet in the
  pane, and a sheet for the details (editor spec §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-1.test.js` — half 1 of the keyboard-only run of the browser editor's page in a
  phone's width, its phone layout. It runs the states `test/repository/keyboard-page.js` gives half 1 (editor spec
  §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-2.test.js` — half 2 of the keyboard-only run of the browser editor's page in a
  phone's width, its phone layout. It runs the states `test/repository/keyboard-page.js` gives half 2 (editor spec
  §11, keyboard_any_device).

### Speed and plain words

- `test/speed-budgets.test.js` — each host held, in CPU instructions, to a budget (editor spec §41, speed_budgets).
  - The budgets are for drawing 50 things and 500, and a cold start of each host. There is one too for a query over a
    10 000-thing mesh: 100 notes of 100 things, until slice 6 builds the mesh.
  - Every budget is set in `scripts/benchmarks/budgets.mjs`, with where its number comes from.
  - Each is a benchmark's claim in the quality ratchet, and each case does its work. A count over its budget breaks
    the claim.
- `test/ux-copy.test.js` — every message the user reads in every view of every host (editor spec §41, ux_copy_auto).
  - The views are those `test/wcag.test.js` checks, with the notices and menu items the host shows. The person's own
    words are left out.
  - Each message reads at grade 9 or lower, keeps its sentences to 25 words and uses none of the listed jargon. It is
    scored by `scripts/plain-english.mjs`.
  - A message that misses for a reason is recorded in `quality/copy.json`. It may never score worse without the record
    raised.
  - The check is tried first.
- `test/ux-journey.test.js` — the first-run journey in every host (editor spec §41, ux_journey_auto).
  - A person opens a note, reads its graph, edits it, fixes a problem and exports it. Each host's journey is in
    `test/repository/journey-obsidian.js` and `journey-page.js`, and each stage checks what it left.
  - Every action goes through `scripts/ux-journey.mjs`, which counts it. An interaction is one action. A step is a run
    of interactions on one control. Each control is found by the name a screen reader says.
  - The counts are metrics of the quality ratchet, held by `quality/baseline.json` with no room. One more step or
    interaction fails unless `quality/accepted.json` records why.
  - The counting and the ratchet's hold are tried first, and a host with no journey fails.
- `test/plain-docs.test.js` — every document and code comment is plain language for a reader with ADHD (editor spec §41, plain_docs_auto). Sentences keep to 25 words and paragraphs to 80. A heading comes at least every 400 words, and no filler words are used. The reader pages read at grade 9 or lower. `quality/plain-docs.json` counts the misses each file had when the check came in, and a count may only fall.

### Pointer targets, reflow and whitespace

- `test/a11y-targets-reflow.test.js` — pointer targets and reflow in a real Chrome (spec §41,
  a11y_targets_reflow_auto; SC 2.5.8, 1.4.10).
  - It runs every view of every host. That is the Obsidian harness in the user guide's states, and the browser page
    served over a vault, with each of its phone tabs.
  - Each view is run as wide as a desktop and at 320 CSS pixels. Every control is 24 by 24 at least. The drawing's
    boxes and a link in a sentence are aside.
  - There is no sideways scroll at 320. Every control seen wide is still there and in reach.
  - The judging is tried first on made-up measures and planted faults.
  - Chrome is `THOUGHTKNOT_CHROME` or the first on the PATH (`scripts/chrome.mjs`). With none it skips in one line,
    except in CI.
- `test/visual-regression.test.js` — every view's drawing against its committed reference, in the light and the dark
  theme (spec §41, visual_regression_auto).
  - The views are each view of each host that draws, the views `test/wcag.test.js` checks.
  - Each drawing is written as a picture by `test/repository/visual.js`. It holds each shape's geometry and words, and
    its paint as the theme's stylesheet works it out. Classes and ids are left out, and numbers are cut to a hundredth.
  - The pictures are held against `test/visual/`. Each reference is recorded in `quality/visual.json` with its hash, a
    reason and the day.
  - A drawing that changes fails until it is accepted. To accept it, run
    `THOUGHTKNOT_VISUAL_ACCEPT="why" npm run -s test:ai -- test/visual-regression.test.js`. CI never accepts.
- `test/whitespace.test.js` — the three copies of the one whitespace set are the same, and the set is openGQL's.

## The requirements in a GitHub Project

### What the mirror makes

- **One way only.** `requirements/editor-requirements.md` stays the only source. `scripts/github-project.mjs` mirrors it
  into a GitHub Project titled "ThoughtKnot requirements", one issue for each requirement of the chosen slices
  (`--slices 3,4` by default). The issues and project items are derivatives: regenerated, never edited by hand, and each
  opens on its rule, then a do-not-edit banner. Its title is the requirement's section, a dot and the id's words.
- **Where each requirement goes.** `requirements/workstreams.json` maps a workstream id to its title and its requirement
  ids. A requirement it does not list falls to `S3`, and an id the current copy does not hold yet is fine.
- **Labels and status.** An issue carries the labels `slice-N`, `workstream:<id>` and `status:open|part|proved`, and is
  closed when proved. Its status is the one the slice board reads.
- **The project's fields.** They are Slice, Workstream, Proof (open, part, proved) and Build status. Build status has
  the options Not started, In PR, Checks failing, Checks passing, Merged and Released. The built-in Status field (Todo,
  In Progress, Done) is the board's own. The mirror never makes it or changes its options.

### Seeding the first values

- **The mirror makes Build status and its options.** It also **seeds** an item that has no value from where its
  requirement stands on GitHub (`scripts/build-status-seed.mjs`), never more:
  - proved on main and by the copy of a _published_ release (a draft does not count): Released and Done;
  - proved on main only: Merged and Done;
  - held by an open pull request of this repository, by its copy's diff or its `Requirements:` line: In PR and In
    Progress;
  - otherwise Not started and Todo.
- **A seed never overwrites.** A Build status already set is never overwritten, nor is a Status of In Progress or Done.
  Only Todo, the board's default and no choice, is replaced by a seed that says more. Nothing moves back from Released
  or Done.
- **What is proved on main is read from main through the API**, not from the checkout the script is run from.
  `--check` prints the tally of what it would seed for each option (`seeded Build status: …`, `seeded Status: …`) to
  confirm before `--apply`.
- **A requirements file the seed could not read is a warning.** That may be main's, a release's or a pull request's.
  `--check` says an apply would stop. `--apply` stops unless `--accept-warnings` is given, since it would fix wrong
  values for good.
- **After the first seed**, the values come from the build status workflow below, from GitHub's events alone.

### Finding and making the project

- **The project is found by GraphQL** (`repositoryOwner(login:) { projectsV2 }`, a user or an organization). It is never
  found by `gh project list`. That asks gh to resolve the owner's type, and fails ("unknown owner type") for a token
  with only the project scope.
- **The project is also made and filled through GraphQL.** It is made by `createProjectV2`, with the owner's node id. It
  is filled by `addProjectV2ItemById`, with the issue's node id. `gh project create` and `gh project item-add` are not
  used. Only `gh project item-edit`, which takes ids, is still used.
- **An owner that cannot be found is an error naming the owner.** So is an answer with no list of projects. Neither is
  ever taken for no projects, which would make the project a second time.

### Derived fields

- **Every other field is derived, never authored** (Roger, 15 Oct 2026). **Wave** and **Order** come from the waves plan
  below.
- **Closed on** is a date field, the day (UTC) of each issue's `closedAt`. It is set for every closed issue, those
  closed before the field existed too. It is cleared on reopen, and put right if anyone changes it.
- **Started on** is a date field. It holds the day a draft or open pull request of this repository first took the
  requirement on, by its copy or its `Requirements:` line.
  - The build status sets it where there is none. It keeps it when the pull request merges, and while another pull
    request holds the item. It clears it when the item is let go.
  - The seed carries the earliest day of the open pull requests that hold an item. So a sync sets it where none is.
  - A sync clears it only for an item Not started. That is one no pull request holds, with no test of it written and
    its Build status not past Not started. One proved, `part` on main, or In PR or later keeps it.

### The waves plan

- **The waves plan is `requirements/waves.json`**, the one place the order of the work lives. It holds the waves in
  order. Each has its workstreams in order and a planned `start` and `end`.
  - `estimate: true` marks the dates as estimates. The wave's title on the board then ends "· est.", and `--check`
    prints a note that they are estimates.
  - Its last wave is a placeholder with no workstreams, for Roger's held changes after all waves. The wave before it
    holds only the Obsidian community release (R2), which Roger put after all the planned work.
- **Wave is an _iteration_ field**, one iteration for each wave with its dates. It is made and kept by
  `createProjectV2Field` and `updateProjectV2Field` with `iterationConfiguration`. An iteration whose title is
  unchanged keeps its id, so the items keep their wave.
- **Order is a number field.** It is the wave's position times 10 000, plus the workstream's times 100, plus the
  requirement's. The requirement's position counts those its workstream lists, in its order, then those it holds by
  default. So 10 203 is the third requirement of the second workstream of the first wave.
- **A requirement whose workstream is in no wave has neither.** `--check` prints a tally for each wave. It warns of
  each requirement in no wave that is not proved.

### Running the mirror

- **See the plan with `npm run project:plan`.** It is a dry run and makes no network call, so it compares with an empty
  GitHub. `--check` reads GitHub and prints the real diff, changing nothing.
- **`--apply` prints the same plan, then does it with `gh`.** It finds each issue by its hidden
  `<!-- requirement:<id> -->` marker, and changes only what differs. It never deletes: an issue whose requirement went
  is labelled `requirement:removed` and closed, with a comment.
- **The full mirror runs on every push to main** (Roger, 15 Oct 2026, option A). It runs in
  `.github/workflows/project-mirror.yml`: `node scripts/github-project.mjs --apply --slices 3,4,5,6,7,8,9,10`. In
  GitHub Actions that hands over to `scripts/github-project-run.mjs`. So issues close and Proof follows main with no
  session doing it.
- **Two tokens.** The issues and labels are written with the workflow's own token, whose one write permission is
  `issues: write`. So the issues it makes are written by `github-actions[bot]`. The project is read and written with
  `PROJECT_TOKEN` (the project scope only). Each call is routed to its token.
- **Project trouble is a warning.** A missing `PROJECT_TOKEN` is a `::warning::`, and so is one GitHub refuses. Only a
  401, a 403 or "Bad credentials" is the token's trouble. Any other failure of a project call is a `::warning::` too.
  That is a mirror error, in gh's own words, such as an input the schema refuses.
  - In each case the issues are mirrored without the project.
  - A seed made despite warnings applies nothing, with a `::warning::`.
  - Neither fails the run. The workflow never passes `--accept-warnings` or `--allow-removals`.
- **The time budget.** An apply may take 45 minutes (`MIRROR_BUDGET_MINUTES` sets another), inside the job's 60. A
  first run makes some 2,000 paced calls. Once the budget is spent it makes no more and warns "board partly updated;
  the next push continues", exit 0. The next push plans again from what GitHub holds.
- **Rate limits.** GitHub's rate limits are a 403 or 429 that says "rate limit" or "submitted too quickly". They warn
  "rate limited; the next push continues", exit 0.

### Never twice, and only its own

- **No issue is ever made twice.** The first issue an apply makes is looked for at once in the list by its creator.
  Before making any, the apply looks among the hundred newest issues for one of its own that list missed.
  - Either way it stops creating and warns "bot-created issues aren't listed by creator=…; creating stopped to avoid
    duplicates", exit 0.
  - So a creator filter that ever failed could not make every push create the issues again.
- **At most 20 new issues in a run.** A run of the workflow makes at most 20 issues on a board that has its issues
  already. A first mirror makes them all. With more, it makes the first 20 and warns how many it left. It still applies
  everything else, so statuses keep moving. Each later push to main makes the next 20. Anything else is an `::error::`.
- **It runs main's own code only.** Woken by a push to main alone, it checks out main, installs nothing and keeps no
  cache.
- **One mirror runs at a time** (`concurrency: project-mirror`, `cancel-in-progress: false`). GitHub keeps one run
  waiting in the group. A newer push replaces the one that waited and never the one running. That is enough, since each
  run mirrors main as it stands.
- **Only what it made is its own.** An issue is adopted only when three things hold:
  - the repository's owner or `github-actions[bot]` wrote it (gh gives the bot as `app/github-actions`, the REST API as
    `github-actions[bot]`);
  - its body has the generated banner;
  - its marker is the last thing in it.
- **Others' issues are left alone.** Only those two logins' issues are read, and a marker anyone else writes is
  ignored. An issue whose banner or closing marker was edited away is no longer ours, so a new one is made.
- **The removal guard.** `--apply` stops, unless `--allow-removals` is given, when the requirements file holds no
  requirements or the plan removes more than 10 issues.

### Where the mirror reaches

- **It goes only where this checkout's origin says.** `gh` runs in the repository folder with `GH_REPO` and `GH_HOST`
  removed. It must point at the origin's repository or the run stops. It names the repository (`--repo`) or the owner
  (`--owner`) on every call.
- **Paced and capped.** Calls that change something are paced about a second apart. They are tried once more after a
  secondary rate limit. A list that comes back as long as its cap is refused. An origin on any host but github.com is
  refused, and an error never repeats a login or token from the remote.
- **Apply as the owner, or let the workflow apply.** Issues are adopted only when the owner or the bot wrote them. So an
  `--apply` signed in as any other login is refused before it changes anything: its issues would be made again by
  every later run.
- **The project is dedicated to the script.** Changing the options of Slice or Workstream replaces them in GitHub. That
  clears the value on every item, and the script sets the values again on the items it manages. A value on an item the
  script does not manage would be lost, so keep nothing else in this project.

## The build status of each requirement

### Where the status comes from

- **Where a requirement's build is up to shows on the project, from GitHub's events alone** (Roger, 15 Oct 2026). No
  person authors the "Build status" field or the built-in "Status" field. The mirror only gives an item its first values
  (see above). `scripts/build-status-run.mjs` sets them from what happens to a pull request, in the workflow
  `.github/workflows/build-status.yml`.
- **No hand-linking.** A pull request's items are the requirements whose tests its
  `requirements/editor-requirements.md` newly marks written, against the base branch's.
  - For a merged pull request, that is its merge commit against that commit's first parent.
  - For a release, it is the tag against the release before it.
  - Both files are read through the API as data. A file of over 3 MB is a warning and not read.
  - At most 200 requirements are handled for one pull request, with a warning above.
- **A helper opens a draft pull request as its first step,** with the line `Requirements: id1, id2` in its description.
  So the items it will build are taken on (In Progress, In PR) before any test of its copy is written.
- **Only that line of the description is read.** It is split at commas. An id is kept only if it is plain (letters,
  digits, underscore, dot and hyphen) and is in main's requirements file. Nothing else is ever echoed.
- **Once the copy marks tests written, the copy's diff decides.** An id the line names that the landed copy does not
  prove is let go, with a warning in the comment (never a failure).

### Which pull requests count

- **Lists are of this repository's own before any cap.** The open pull requests and the pull requests merged in a span
  are paged through, ten pages at most. Only those whose head and base are this repository are kept. So a crowd of fork
  pull requests cannot hide one that holds an item.
- **Issues are asked for by their creator.** The creators are the owner and `github-actions[bot]`. They come from the
  REST list endpoint, `repos/{owner}/{name}/issues?state=all&creator=…`, paged through. This holds in the build status
  and in the mirror, which adopts only those two logins' issues. So issues others file never reach the cap.
- **Not `gh issue list`**, which may use the search. That is capped at 1,000 and behind its index, so a create tried
  again could be made twice. A pull request, which that endpoint lists too, is left out.
- **Which pull requests.** Only those of this repository: one from a fork moves nothing and gets no comment. The pull
  requests an event names must still have, as their head, the commit its checks ran on. Merged counts only when the pull
  request merged into main.

### The stages and the comment

- **The stages.** An item moves through these, and never goes back from Merged or Released:
  - In PR while CI runs or has not started;
  - Checks failing when CI's run fails, and Checks passing when it passes;
  - Merged on the merge (a push to main), and Released when a release is published;
  - Not started again if the pull request is closed unmerged.
- **Only CI's own run counts as the checks.** It is found by its workflow path. The other workflows of a pull request,
  such as code scanning or the dependency review, are not the build's checks.
- **The built-in Status follows:** In Progress while a same-repository pull request, draft or open, holds the item; Done
  when it merges into main or is released. It is Todo again when the pull request closes unmerged. That is unless
  another open same-repository pull request still holds the item, which also keeps its Build status. Never back from
  Done.
- **One comment, updated at each step,** on the pull request. It has links to the items, the board and the run. There is
  none when a pull request moves no requirement.
- **A release comments** with the stage Released. It does so on each pull request merged since the release before that
  proved any of its requirements.
- **A locked pull request.** A comment is tried first. If it fails, the pull request's own `locked` field is read from
  the API (every pull request's is, and a merged one's is closed too). If it is true, the pull request is unlocked,
  commented and locked again in the one step.
  - The lock is taken up again with the repository's retry for a short failure of GitHub. If it still fails, the
    warning says that pull request `#N` was left unlocked.
  - It is made with the workflow's own token, with `pull-requests: write` as the only write permission. That is what
    locking needs, as the lock workflow shows.
  - When two runs would make it at once, it is looked for again just before it is made.

### Tokens and safety

- **`PROJECT_TOKEN` is for the board alone.** It is a classic token with the `project` scope, kept as a secret. It is
  used for listing the project, reading its fields and items and setting their values.
- **The workflow's own token does the rest.** The issues, the pull requests, the files and CI's run are read with it,
  and it also leaves the comments. `public_repo` was asked for to read issues and the signed-in login. It is no longer
  used by this workflow, and whether to keep that scope is the owner's call.
- **A missing token never fails CI.** When `PROJECT_TOKEN` is missing or GitHub refuses it (expired: 401), the run says
  so. It says it in a `::warning::` annotation and a line in the comment, and does not fail: CI never fails over it.
- **Nothing of a pull request is run with the secret.** The workflow follows the checks of a pull request instead of
  being woken by the pull request. Those checks are CI, and the `Build status trigger` workflow, which has no secret
  and does nothing. So its definition is the one on main, and its job checks out main, with no package cache.
- **No `pull_request_target`, no event text in a command line, and the script prints no token.** Runs are grouped by the
  commit of the checks, so one pull request's waiting run never replaces another's. Actions are pinned to commit hashes
  at least 7 days old.

## The wiki

The [GitHub wiki](https://github.com/rogerbucks/thoughtknot/wiki) is made from the repository by
`.github/workflows/wiki.yml`. It is made on every push to main and every release. So it is never edited by hand: an edit
there is overwritten.

`scripts/wiki.mjs` writes the status, roadmap, decisions, open questions, quality and releases pages. It writes them
from the files that hold them. It copies the pages written by a person from `wiki/`, filling each `<!-- wiki:NAME -->`
marker.

`wiki/How-to-use-ThoughtKnot.md` is the user guide, in plain words for people who are not technical. A change people
will see changes it in the same pull request. Its pictures are `<!-- wiki:shot NAME -->` markers, taken from the build
by `scripts/wiki-screens.mjs`. Each shot is a state of `packages/obsidian/harness`, listed in `SHOTS`. Its settings come
from the core's `OPTIONS`. A button of the drawing the guide does not name is a warning on the wiki's run.

People may edit the wiki too: their pages are never changed by the workflow. `scripts/wiki-review.mjs` checks each page
a person changed last. It runs on every run and on every wiki edit. The workflow keeps the suggestions in one open issue
labelled `wiki-review`, closed when none is left. A person's edit to a page the wiki makes is listed there before the
next run replaces it.

The developer pages are filled from the code by `scripts/wiki-developers.mjs`. They are `wiki/For-developers.md`,
`Architecture.md`, `Writing-a-plug-in.md` and `Adding-a-host.md`. The architecture is the graph note
`requirements/architecture.gql`: add a new package or interface there. A new extension point needs its words in
`POINT_ABOUT`, or the wiki's make fails. They describe main, the nightly build, and mark each requirement against the
latest stable release. To look at the wiki before a merge:
`node scripts/wiki-screens.mjs --out out/images && node scripts/wiki.mjs --out out --labels out/images/labels.json`.

## The quality ratchet

### What each release checks

- **Every release is walked through for accessibility** (spec §11). The keyboard and screen reader list is in
  [RELEASING.md](RELEASING.md), for what the automated WCAG check (`test/wcag.test.js`) cannot see. Every interface in
  every host meets WCAG 2.2 Level AA, and a new host does before its first release: add its views to
  `test/wcag.test.js`.
- **Every release measures the code** (spec §12). It runs the suite twice, so it is the release's job.
  `node scripts/quality-metrics.mjs --out quality/metrics.json` writes these:
  - file sizes, an `npm audit` count, a secrets scan and the bundle's size;
  - the work a fixed set of benchmarks takes, counted in CPU instructions and never in elapsed time;
  - the suite's duration, its flaky tests, the size of a passing quiet run and coverage.
- **`quality/baseline.json` is what each is held to,** by `node scripts/quality-check.mjs quality/metrics.json`. A
  metric that got worse fails the release, unless `quality/accepted.json` gives a reason for that change. The reason
  gives the metric, its baseline value (`from`), the value it may reach (`to`), why, and the day.
- **Tolerance.** Counts of files, findings and bytes carry no tolerance. Test duration is reported as a warning only,
  scaled by how fast the machine measured itself, never enforced. The quick ones (file sizes, secrets) also run in CI
  and in `test/quality-metrics.test.js`.

### Speed in instructions

- **Speed is the work the benchmarks take, in instructions** (Roger, 12 Oct 2026). `scripts/benchmarks/` holds a small,
  fixed set. Each is a deterministic piece of work with the claims it proves:
  - 50 things drawn (`draw_fifty`, within half a second's instructions on a phone);
  - the worst reads at the size limits (`reading_limits`, within the budget of reading again);
  - the refusals of `layout_contained` (`layout_refusals`);
  - naming thousands of things linearly (`naming`);
  - a keystroke reaching the note (`keystroke`, read-back costing less than reading).
- **A claim between two sizes or two cases is a ratio of instruction counts**, so it is exact on every run. Each setup
  first runs its cases' code once, small, so a first compile is never inside a ratio.
- **How the counts are taken.** `node scripts/instruction-counts.mjs` runs each case, and its setup alone, in a process
  of its own. It runs under Valgrind's Cachegrind (`--cache-sim=no`), as many at once as there are cores.
  - Node is pinned to one thread, with V8's predictable mode, a fixed collector schedule and one random seed.
  - WebAssembly is compiled once: the drawings' by the optimising compiler, in their warm draw.
  - It keeps each case less its setup. A case that counts nothing beyond its setup fails the run.
- **Where it runs.** It runs on Linux only: in the release, its dry run and the "Quality baseline" workflow. Those run
  on `ubuntu-24.04` with Node pinned exactly, and install Valgrind. A patch can move the counts. None of them may set
  `GITHUB_ACTIONS`.
- **Where it does not.** It does not run on Apple-silicon Macs. Where Valgrind is missing it says so in one line and
  counts nothing. On any machine but Linux that only warns, and the fast check never asks.
- **A count may grow by 5% before it fails** (`INSTRUCTION_TOLERANCE`). It is held only against counts from the same
  machine: operating system, processor, Node major and Valgrind. The full Node version and the CPU are said with them.
  A claim that does not hold always fails, and no reason can waive it.
- **Until the baseline holds the counts**, a run that counts them prints them, with the machine. A follow-up pull
  request commits them. Outside CI it passes on them. In CI (`GITHUB_ACTIONS`) it fails after printing them. It fails
  too when the baseline's were counted on another machine, as its job then is only to print them.

### Counting on your own machine

- **Counting on your own machine:** `npm run bench:local` (Docker running) builds `docker/benchmarks.Dockerfile`. That
  is a Linux image with Node 24 and Valgrind, its base pinned by digest. It runs `scripts/instruction-counts.mjs` in it
  with any of its arguments (`-- --only naming`, `-- --runs 3`).
- **What it is for.** It is for counts before and after a change on one machine, as Valgrind cannot run on
  Apple-silicon macOS. A full count takes about two and a half minutes on a 10-core Mac.
- **How it runs.** The repository is mounted, not copied. `node_modules` is a container volume of each checkout's own.
  So the host's is untouched and worktrees never share one.
- **The base image's age** is its digest's own creation date, recorded in the Dockerfile and held to 7 days before it
  was pinned. On a Mac it counts ARM Linux's instructions: they are never compared with CI's x86-64 baseline.
- **Valgrind is GPL-3.0, allowed as a tool run in CI alone and never shipped** (spec §13, build_tool_licences).
  `licences/bundled.json`'s `ciOnlyTools` names it. `test/licences.test.js` holds that nothing bundled, nothing inside
  what is bundled and nothing in `node_modules` can be on that list. It also holds that only the jobs and the
  developer-only image it names install it, each with `--no-install-recommends`.

### Moving the baseline

- **To move the baseline,** after a change is wanted, run the metrics script with `--out quality/baseline.json` on a
  passing suite, and commit it.
- **The baseline is held against its own earlier copy** (`quality-check.mjs --baseline-since <ref>`, run in CI and in
  the release). A metric that got worse in it needs an entry in `accepted.json` too. A count of secrets can never be
  waived. A baseline with a metric missing or tests left out is refused.
- **Check before tagging.** Run the "Release check (dry run)" workflow by hand on main before a release is tagged. It
  runs the jobs the release waits on: the quality job and public readiness. It runs them step for step and with the
  same workflow-wide settings as `release.yml`. It releases nothing, so a failure there costs no version number.
  `test/quality-baseline.test.js` holds the two the same.
- **A baseline from the CI runner:** run the "Quality baseline" workflow by hand. Download its `quality-metrics`
  artifact; its log prints the same. Commit its `metrics.json` as `quality/baseline.json` in a normal pull request.
- **Fingerprints.** Each benchmark is bundled on its own. Its fingerprint is the hash of its bundle, with the machine,
  Node, Valgrind and the flags. One whose fingerprint is unchanged since the committed baseline keeps that count. So
  only the benchmarks a change reaches are counted again.
- **Counting them all.** Tick "count every benchmark" to count them all; a release always does. Ticked, "spread" also
  writes `instruction-spread.json`, every benchmark counted three times. Its `largest_spread` is how far a count moved
  between runs there, which the tolerance must stay well above.

### Tests and time

- **A test asserts the work done, never the time taken** (Roger, 12 Oct 2026). The suite's second run has coverage on,
  which slows the core's code unevenly. It runs on a runner slower than a desktop, so no number of milliseconds holds
  there.
- **A test counts the work where the requirement is work.** Examples are a text never read, or a block read again only
  within its budget. A control shows the count sees the work when it is done.
- **Speed itself is the benchmarks' instruction counts.** `scripts/timed-assertions.mjs`, run by
  `test/timed-assertions.test.js`, fails any assertion on a span of elapsed time. A polling deadline in a loop that
  awaits, and Node's mock timers, are allowed.
- **A test waits for the state it asserts, never a number of milliseconds** (15 Oct 2026). A sleep holds only while the
  machine is as fast as when it was written. Under a loaded full run the work takes longer. Then the test fails once in
  a while and passes alone.
- **How to wait.** Wait with the test support's `until(() => …)` on the state asserted. Where nothing should change,
  wait for a positive sign that the work is done (a notice counted, the tools drawn again) and then assert.
- **Fixed sleeps are held down.** `scripts/fixed-sleeps.mjs`, run by `test/fixed-sleeps.test.js`, fails a fixed sleep
  beyond each file's allowance in `test/fixed-sleeps.json`. It also fails an allowance higher than the file needs, so a
  sleep taken out stays out.

### The engine's advisories

- **The Graphviz inside the engine is watched** (spec §13). `node scripts/engine-version.mjs` reads its version from
  the engine and checks the notices name it. It checks `quality/advisories.json` offline, and warns when the cache was
  last checked over 14 days ago.
- **Only `--refresh` and `--watch` ask:** OSV and NVD for Graphviz, merged, and OSV for the package that wraps it. The
  release's quality job refreshes and checks.
- **The "Engine advisories" workflow** is run by hand; its weekly schedule is off until the public release. It is
  read-only: it fails when the published advisories differ from the committed cache. Then someone runs `--refresh` and
  opens a pull request. The plugin never asks.
