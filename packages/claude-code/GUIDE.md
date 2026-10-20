# The Claude Code host: where things live

A Claude Code mod whose `/graph <note>` draws the note's first graph in a pane (spec §10, Hosts). It runs on the same
host-free core as the Obsidian plugin.

A mod's hooks run in an environment of their own, with no DOM, no Node and no WebAssembly. Reading, the layout source
and theming run there, bundled. Graphviz, the core's own engine, runs as a process through `node`, DOT in and SVG out.
When `node` is missing, the pane says so and shows the graph as text, never a blank drawing.

A pane draws the SVG as an isolated image, so its colours are the core's system palette (`palette.ts`, the one colour
mapping). The fixed light and dark palettes are both carried in the drawing's own style sheet, with
`prefers-color-scheme` choosing and the page painted in.

The mod API says nothing of the app's appearance, and Claude Code's theme setting is the terminal's. So nothing is
guessed: the drawing follows the scheme the app hands its pages. That is the system's unless the app sets its own.
Whether the desktop app does, and keeps the drawing's style sheet, is checked by eye.

## The source, `src/`

### The pane

- `graph-view.ts` — `viewOf`: what the pane shows for a note.
  - It draws the first graph in a palette. It always gives the same graph as lines of text too.
  - The text stands in, with the reason, when the graph cannot be drawn. The reasons: over the layout limits, over
    what a pane takes, or Graphviz not run.
  - A note too large to read says so, never "no graph". So does an empty graph, and a graph that could not be read (its
    errors, with their note lines).
  - Also `PANE_PALETTE` (the system palette, and why) and `notePath` (/graph's argument).
- `graphviz-process.ts` — `layOut`: the DOT sources handed to the render script through node, within the core's time
  limit (`LAYOUT_TIMEOUT_MS`), and the SVGs back. After a refused run, `node --version` is asked. Its answer is read
  three ways:
  - a node that is not there (ENOENT, "not found") or exit code 127 is said as `NODE_MISSING`, in words with what to
    do;
  - a host that runs no process says its own words;
  - a node that starts means the layout did not finish.

### Opening the editor, and the gate

- `editor-paths.ts` — also `insideVault`: a path written relative to the vault, as a full path inside it, or null. The
  matrix note is never read from outside the vault. `editor-launch.ts` reads the matrix note for Claude's row
  (`gateSettings`). It hands the server the row, switches, class names and rows (`settingsForServer`), so both gates
  agree. A note that cannot be read gives no rows, and the row clears nothing.
- `editor-matrix.ts` — `withMatrix`: the matrix note read for Claude's row, only from inside the vault's real path.
- `editor-realpath.ts` — `realPathVia`: a file's real path, links settled. It is asked of the shipped process
  `bin/real-path-process.ts` (built to `mod/bin/real-path.mjs`, run by node) through the host's process call. That is
  because the mod's file calls settle no links. The path is the one argument.
  - The matrix note is read only when its real path is inside the vault's real path. A link out, a host with no such
    call, or a path that cannot be settled refuses it. Each gives a plain reason (`matrixProblem`), which both gates
    give.
- `editor-launch.ts` — `EditorLauncher` (workstream C2): the session's one browser-editor server.
  - It is started for a note through the host's `spawn`, handed in, so no Node module is imported. Its first line of
    output is read for the address. Only `link` gives the address (a `#` field, so `JSON.stringify` shows none).
  - `edit` reuses the server for the same note, and replaces it for another (one server for each session,
    cc_one_server). It says why a start failed in words (cc_start_failure).
  - `stop` kills it. A server that ends by itself is forgotten, with why in `ended`. One call at a time.
  - `sayEdit`, `sayStopped`, `editArgs` and `confirmArgs` are the words and the command line. None holds the address,
    the token or the note's text (cc_transcript_clean).

#### The gate in `editor-launch.ts` (workstream C3)

- Before any server starts, `edit` reads the note through the `read` port and the settings through the `settings` port.
  Then it asks the core's `claudeGate`.
- A note above Claude's ceiling starts nothing and is remembered as asked about. `confirm` (`/graph confirm`) is the
  user's yes, for that one note, once. It checks the gate again first (cc_classified_asks).
- These have no yes (cc_credential_never):
  - the highest classification, and one not among those set;
  - an unlabelled note when the level for such notes is the highest (the default);
  - a credential;
  - a note or settings that cannot be read.
- `held` on the outcome says which, and neither is drawn in its place.
- Only the person typing can say yes. `edit` and `confirm` take the host's `origin`, and `fromPerson` accepts exactly
  `origin.kind === 'composer'`. Any other, or none, is refused. (`bridge`, Remote Control, is an open question for
  the owner and is not accepted.)
- The yes is the digest of the text it was given about. It is handed to the server (`THOUGHTKNOT_EDITOR_CONFIRMED`,
  with `_SETTINGS`). The server runs the same gate (`server/editor-gate.ts`, `storeGate`) before every send in
  `editor-store.ts`: a read, a draft, the change stream, a stale write's answer.
- A refusal sends `gone` and no text, and a changed note needs a new question. A note already open and now held back
  is closed. `gate` asks the same for `/graph <note>`'s own drawing.
- The mod reads the settings from `settings.json` in its data folder. No file means the defaults, the strictest.

### The data folder's guard

- `data-guard.ts` — `guardDataFolder` (spec §26). The mod's data folder holds `settings.json` and the drafts, and is
  the user's alone. So a `tool.call` hook in `register.tsx` refuses Claude's own calls that reach it.
  - The hook takes every tool, not a list (risk TRUST-2). `pathOf` finds the path a tool writes: its known field, or
    else `file_path`, `notebook_path` or `path`. So MultiEdit and a file tool from an MCP server are judged too.
  - A guard that fails refuses too.
  - The refusal (`DATA_FOLDER_REFUSAL`) says the user changes these settings, in `settings.json` in the plugin data
    folder. It echoes nothing of the call.
  - Reads (the Read tool, Grep) are not hooked.
  - **File tools** are judged by the target's real path, asked of `bin/real-path.mjs`. A relative path is taken from
    the session's folder. A file not yet made is judged by its nearest parent that exists.
  - So a link elsewhere, or a linked parent, is found. So is a link that leads nowhere yet: a dangling link, or one as
    a parent. It is asked of the same process with `--link` and followed from the link's own folder, up to 8 in a row.
  - Names are compared without regard to case, and the real path is the disk's own (`realpathSync.native`). So
    `THOUGHTKNOT` on a macOS disk is the folder.
  - **Fail closed:** a path that is not there is an answer (exit 2). But node missing, a process that fails, or one
    that does not answer in time refuses the call (`CHECK_FAILED_REFUSAL`).
  - An empty `CLAUDE_PLUGIN_DATA` is unset.
  - **Scope:** the editor server's own writes of drafts are the mod's and are not hooked. The hook judges Claude's tool
    calls. A subagent's are among them when the host raises `tool.call` for them (not tested here).

#### Bash limits, honestly

A command cannot be parsed, so `data-guard.ts` refuses it when:

- it names the folder at all, even to read it. That covers the folder as written, real, through the home folder by
  tilde or the HOME variable, or by `CLAUDE_PLUGIN_DATA`;
- it names `plugins/data` as whole path parts, so a renamed or moved folder is caught. The check is made on a copy with
  quotes and backslashes taken out and the home forms put in;
- it has a word that resolves into it (the first 40 with a `/`, or starting `.` or `~`).

A command with `mv`, `rm`, `cp`, `rsync` or `ln` in it is also refused in one case. That is when one of those words
resolves to a folder above the data folder and below home (the Claude config folder, its plugins folder). `ls` and
other reads of those stay allowed. A relative link is settled from the real path of its own folder.

It does not stop:

- a glob that expands to such a folder (a star in place of part of the folder's name);
- a name the shell builds;
- other tools that move folders (`find -delete`, `git`, `install`, `tar -x`);
- a path the shell builds. That is `cd` there, then a bare file name; or a variable, a glob, command substitution or an
  encoded string that makes the path;
- a program that is handed no path and finds the folder itself;
- a write through another tool such as an MCP server.

It is a guard against a session slipping, not against one set on getting round it. The settings file's own mode is the
other half. The `propose` tool and its sender (`bin/propose.mjs`) are the mod's own processes, not Claude's Write, Edit
or Bash calls. So the guard does not meet them.

### The open note's guard

- `data-guard.ts` — `guardOpenNote` (cc_claude_proposes, risk AI-1). While a note is open in the editor, Claude changes
  it only by the `propose` tool. So the same `tool.call` hook refuses Claude's own file tool and Bash calls that reach
  that note.
  - The note is the launcher's `note`: the full path of the note open now, or none. With none open, nothing is refused.
  - File tools are judged by the real path, as for the data folder: a relative path, a link or a change of case is
    found.
  - Bash is refused when it names the note's path, a word resolves to it, or a folder above it is moved or removed. Its
    file name alone, as a whole word, counts too, so `cd` to its folder then a bare name is caught.
  - The refusal (`OPEN_NOTE_REFUSAL`) names the propose tool and echoes nothing of the call. A guard that fails refuses
    (`NOTE_CHECK_FAILED_REFUSAL`).
  - What it does not stop is the list under Bash limits above, for this note: a path the shell builds, other tools, an
    MCP server. Other notes in the vault are not guarded.

So a change to the open note is never applied by Claude's own tools while `guardOpenNote` holds: it waits on the card.

### What sets the gate: its guard

- `gate-guard.ts` — `guardGateFiles` (spec §26, risk TRUST-1). Two vault files set Claude's gate: the matrix note named
  in the settings (`aiMatrixNote`), and each note's classification line. The same `tool.call` hook refuses Claude's own
  calls that would change either.
  - **The matrix note:** a file tool whose real path ends with the note's path in the vault is refused
    (`MATRIX_NOTE_REFUSAL`). A link to it is found. Bash is refused when it names the note's file name.
  - **A classification:** the note is read, the call's change is made to a copy, and the classification before and
    after is compared. A change or removal is refused (`CLASSIFICATION_REFUSAL`). So is an edit that breaks the front
    matter around it. A note not yet made may be written.
  - When the note cannot be read, a call is refused if any text it carries holds a classification line.
  - Bash is refused when it names `classification`, unless it only searches or prints (`grep`, `rg`, `cat`, `head`,
    `tail`, `less`) with nothing to write its output.
  - The refusals name no level, path or text of the call.
  - **What it does not stop:** a command that changes the front matter without naming it, such as by line numbers. And
    the list under Bash limits above. The user changes a classification in the note themselves.

### Proposals, the hooks entry and the page's session

- `editor-propose.ts` — Claude's proposals (workstream C7, cc_claude_only, cc_claude_proposes).
  - The launcher's `propose` sends Claude's input as JSON, with a key made for each start. The key comes from the `key`
    port and is passed to the server as `THOUGHTKNOT_EDITOR_PROPOSER`.
  - It sends through the shipped sender `bin/propose-process.ts`. That is built to `mod/bin/propose.mjs`, and run by
    node with the request on standard input.
  - The key opens `PUT /api/notes/<id>/proposal` and nothing else. The session's token opens everything but that:
    Claude has no write.
  - The server (`server/editor-proposals.ts`) reads the body as changes alone (`changesIn`: no Person, Model or Step).
  - It declares the proposer (the Model named Claude in the settings) as the first addition. It holds the note and the
    text to be written to the gate.
  - The store writes the change set beside the graph under the note's lock, by the atomic write. The graph is never
    touched.
  - The mod registers one tool, `propose` (`mcp__thoughtknot__propose`), which Claude calls. `sayProposed` is all it is
    told. The page shows no other AI.
- `mod-entry.ts` — what the hooks module takes from the three above; bundled into `mod/hooks/graph.js`.
- `editor-session.ts` — `EditorSession`, the browser editor page's side of a note (spec §26; for C5). It holds:
  - the core's `PaneSession` and `TextHistory` over one block;
  - the note and version the page last had from the server;
  - what to send: `write`, `undo`, `redo`, each `against` that version, so the server refuses one made over a change
    it has not seen;
  - `changed` for a change on disk: drawn again, or a conflict that keeps what is typed (cc_redrawn_on_change).
  - Once another program changes the block, the writes before it are never undone, and undo says so
    (`UNDO_OVER_THEIRS`). The typing history starts again from the block as reloaded (cc_undo_safe).
  - Stopped by a copy of its block it cannot tell from it, undo says that in the core's words instead
    (block_followed_not_its_copy).

## The process, `bin/`

- `bin/render-process.ts` — the core's `loadEngine`, run by node: a JSON list of DOT on stdin, a JSON list of SVG on
  stdout. Bundled into `mod/bin/render.mjs`.

## The browser editor's server, `server/`

The local server the browser-pane editor will talk to (spec §26, slice 4; workstream C0). It runs in Node as a process of
its own, so it sits outside `src/` (whose modules may import no Node built-in): Node's own `http`, no framework and no
runtime dependency beyond the core's `READ_LIMITS`. Built into `mod/bin/editor-server.mjs`.

### Starting and stopping the server

- `server/editor-server.ts` — the shipped process: `runEditorProcess` with its arguments and the options
  `editor-main.ts` makes from the environment. A vault or note it is refused says why on stderr and exits 2.
- `server/editor-main.ts` — `optionsFromEnvironment`. The mod hands the process `THOUGHTKNOT_EDITOR_VAULT`, `_NOTE`
  (the one note opened for the session, by its path) and `_DRAFTS`, never an argument.
  - It makes the note store, opens the note, and gives the process the store's `api` and `stop`.
  - It also gives the note's id. The address becomes `/#token=<token>&note=<id>`, both in the fragment a browser never
    sends.
  - For `_INPUT=ignore`, it gives no watch on its input. The host closes a child's input when it starts it, so there
    the session's end is the child being killed.
  - With no vault set it serves no API, as before.
- `server/editor-process.ts` — `runEditorProcess`. It refuses (exit 2) any argument, so it can never be told to listen
  elsewhere. It also refuses a start with no parent left (`process.ppid` is 1), which nothing would stop. It prints one
  line of JSON, `{"url":"http://127.0.0.1:<port>/#token=<token>"}`. The token is in the fragment and written nowhere
  else (no port or token file). It says on stderr why it stopped, and exits. The code that runs it may hand in an
  `api`; arguments never.
#### The listener, `start-server.ts`

- `server/start-server.ts` — `startEditorServer`. It listens on 127.0.0.1 alone, on a port the system chooses, with a
  fresh 256-bit token.
  - Every request goes through `request-guard.ts` first. No query or fragment is allowed in an address, so a token
    there is refused.
  - The page's files (`PageAssets`) are read once from the built `mod/page/`. They are served by exact path with no
    token, as they say nothing of any note. With none, a placeholder is served at `/` alone.
  - For the worker's file alone, the policy has `'wasm-unsafe-eval'` added to `script-src` (see `page-assets.ts`).
  - Every `/api/` call needs the token, then goes to the `api` handed in (`ApiHandler`; none, and it is not found). A
    write needs the server's own origin.
  - An answer may be a stream (`ApiAnswer.feed`), written piece by piece until either side closes.
  - A stop refuses any call not yet handed to the API (503). It resolves `closed` only once `drain` (the store's own
    stop) has finished the writes under way.
  - `SERVER_LIMITS` holds clients to 10 s for the headers, 30 s for a request and 5 s for an idle connection. It allows
    64 headers and 32 connections.
  - A request Node cannot read is refused (400, 408 or 431) with the security headers too. One with no Host comes to
    the checks and is refused there.
  - It stops after `IDLE_MS` (30 minutes) with no request open and none of the page's, or at once on `stop`. Its clock
    and timer are injectable (`now`, `every`).
  - Only the page itself (`GET /` from its own address) or a call that passed the token starts the wait again. So a
    page probing ports cannot keep it alive.

### The checks on each request

- `server/request-guard.ts` — the checks:
  - the exact Host (`127.0.0.1:<port>` or `localhost:<port>`), with no forwarded or Tailscale header read;
  - no other Origin and no cross-site `Sec-Fetch-Site` on any request;
  - a write's Origin its own, and `Sec-Fetch-Site: same-origin`;
  - the token only as `Authorization: Bearer`, compared in constant time (`timingSafeEqual` over SHA-256 digests);
  - and `SECURITY_HEADERS`, on every answer. They are the content security policy (`CSP`, with `base-uri`,
    `form-action` and `object-src` all `'none'`), `nosniff`, `no-store` and `no-referrer`. They also include
    `Cross-Origin-Opener-Policy: same-origin`, and no CORS header ever (OPTIONS is refused).
- `server/request-body.ts` — `readBody`: a body held to the core's read limit for a note (`READ_LIMITS.bytes`). It is
  refused (413) before it is read when its length says it is larger, or as soon as one sent in parts passes it.
- `server/session-watch.ts` — `watchSession`: stops the process when its input closes (the session ended), or when its
  parent changes (the process that started it exited). It also stops on SIGTERM, SIGINT or SIGHUP (`/graph stop`).

### The note store

The note store (workstream C1), the real `api`:

- `server/editor-store.ts` — `NoteStore`.
  - `create` takes the vault (kept as its real path) and the mod's data folder for drafts (refused inside the vault).
  - `open` opens a note by the path the mod names, never the page. It gives the id the page uses: 128 random bits, the
    same id for a note already open, however reached (cc_open_notes_only).
  - `api` answers these:
    - `GET notes/<id>` gives `{text, version, draft}`, the version also the ETag.
    - `PUT notes/<id>` needs If-Match (428 without), compared under a lock for the note (cc_write_if_unchanged). When
      stale it gives 409 with the note as it now is, and what was typed is kept as a draft.
    - `PUT notes/<id>/draft` (an empty one clears it).
    - `GET notes/<id>/events` is a stream, a JSON object to a line (cc_redrawn_on_change). It gives the note now, then
      each change on disk that differs from what the page has, or `{gone}`.
  - Anything else, an id never opened among it, is "No such note is open." (404).
  - Each read and write checks the note's place again (410 when it moved or now leads out).
  - A draft is kept under the note's lock too, so a write under way never clears one saved after it began.
  - A write that is made clears the draft. It does not when that draft was typed against the very version it wrote,
    and differs.
  - `stop` closes the watchers and lets no write start (each checks again when its turn under the lock comes). It
    resolves once those under way are done.
  - **A write refused with 503 keeps no draft** (keeping one is a write too). The page must keep its own text when the
    server stops.
  - `GET notes/<id>/versions` and `GET notes/<id>/at/<commit>` serve the changes view (changes_view). They give the
    note's earlier versions, read only when the page asks. They also give its text at a commit just listed for it
    (never another, nor a name). The current note and the earlier text are both held to the gate.
  - `GET notes/<id>/reviews` and `…/reviews/<kind>/<id>` serve the review items (github_review_items). They give the
    repository's pull requests, merges and commits, and one just listed with its changed files. Each file is held to
    the gate's `file` word (a credential or a classification it gives; none counts as the lowest).
  - These routes live in `server/editor-changes.ts`.

### History and GitHub

- `server/note-history.ts` — `GIT_HISTORY` (changes_view): the open note's earlier versions in the git repository it
  lives in.
  - It lists the last `COMMITS_LISTED` commits that changed it, and the local branches. It gives its text at one of
    them by `cat-file` (the stored bytes, no filter).
  - It is the server's one child process: git by `execFile`, fixed arguments, no shell and a bare environment. Hooks,
    the file-system monitor and the pager are off. Every transport is refused (`protocol.allow=never`,
    `GIT_NO_LAZY_FETCH`). It runs within `GIT_TIMEOUT_MS` and the note's size limit.
  - `editor-threats.test.js` holds the bundle to that call and one other, gh's.
- `server/github-reader.ts` — `GH_READER` (github_review_items; Roger, 17 Oct 2026). It reads the note's repository,
  named by its remote `origin` on github.com (`repositoryOf`).
  - It reads with the user's own gh: `gh api --method GET --hostname github.com`, fixed arguments, no shell. The
    environment has no token (gh finds its own sign-in). Every path, number and commit is checked before it goes in an
    address.
  - A pull request is compared from its merge base, and a commit or merge from its first parent. At most `FILES_READ`
    files' texts are read, and `requirements/workstreams.json` at the newer side.
  - It is the one outgoing request the server may cause (cc_no_remote), and only when the user asks.

### Note files on disk

- `server/note-place.ts` — `notePlace` (cc_no_escape): what a path must be, as written and as its real path, every link
  followed.
  - It must be inside the vault, end in `.md`, and hold no NUL.
  - It must have no part starting with a dot (`.obsidian`, `.git`, `.trash`, a hidden file).
  - A link that leads out of the vault, into a hidden folder or onto another kind of file is refused, each saying why.
  - So is a file with a second hard link (`nlink > 1`), which could lie outside the vault.
- `server/note-file.ts` — `readNoteFile` and `writeAtomically`.
  - `readNoteFile` reads the whole note within the core's read limit, with `O_NOFOLLOW`. The path's real path must
    still be itself once it is open, so no folder swapped for a link is read through.
  - The file opened is held to the one at the path by device and inode. It must be UTF-8 that decodes exactly. Its
    version is the SHA-256 of its bytes.
  - `writeAtomically` (cc_atomic_write) makes a new, hidden file beside the note. It is given the note's mode with
    `chmod` (the umask narrows `open`'s), then written and flushed.
  - Its folder's real path is checked to be the note's still. Then it is renamed into place and the folder flushed.
  - On any failure the temporary file is removed and the note is as it was.
  - A write refused because its folder was swapped can leave its temporary file in the folder swapped away. The store
    can no longer reach that by the note's path.
  - `NoteFiles` are its three steps, which the tests hand in to hold or break one.
  - **What the rename does not keep:** a note's extended attributes, ACLs, other hard links (refused anyway) and birth
    time. Those are the new file's, not the old.
  - **Flushing on macOS:** `fsync` there is not `F_FULLFSYNC`, so the drive's own cache may still hold a write that has
    been flushed. Node offers no `F_FULLFSYNC`, and the rename keeps the note whole either way.

### Export, drafts and watching

- `server/export-api.ts`, `server/export-files.ts` — the export (workstream C6, cc_exports_new_only).
  - `GET export/<id>` tells the page the note's path and the folder the files go to. That is the settings' export
    folder, else the note's own, as the plugin's plan has it.
  - `PUT export/<id>` takes `{files: [{name, text} | {name, base64}]}` (a PNG as base64, checked to be one). It gives
    `{written: [names]}`.
  - The page names no path, only file names. Each is only a name: no separator, `..`, control or reserved character,
    or leading or trailing dot. It must have an ending of an export's: svg, png, gql, csv, graphml, md.
  - Files are only ever created. The folder is made a part at a time, and every part must be a real folder, never a
    link. Its real path is checked before each try.
  - Each file is opened `O_CREAT|O_EXCL|O_NOFOLLOW` and nothing else, so a file or link already there is never written
    to.
  - A taken name gives `-2`, `-3`… for every file of the export together. One that cannot be written takes away those
    made before it.
  - The export has a body limit of its own (`EXPORT_BODY_LIMIT`, 24 MiB: an image is larger than a note). Every other
    path keeps the note's.
  - Same token, Host, Origin and same-origin checks as any change. `Exporter.stop` waits for writes under way.
- `server/note-drafts.ts` — `DraftShelf` (cc_drafts_outside): a draft for each note in the data folder (set to 0700 when
  opened).
  - Each is named by a digest of the vault and the note's path, and readable by its owner only (0600). It is written as
    a note is, and offered when the note is next opened.
  - A draft file may hold up to `6 × BODY_LIMIT + 1024` characters. That is room for a note's worth of control
    characters as JSON writes them.
- `server/note-watch.ts` — `watchNote`, `watchWith(ms)`: `fs.watch` on the note's folder, so a note replaced by a
  rename is still followed. Its burst of events is read once, `WATCH_DEBOUNCE_MS` (100 ms) after the last. The store is
  handed it, so a test fires a watcher by hand.

### What the tests stand in

Nothing of the tests ships. Their stand-in is `test/fixtures/editor-server-test.ts` (TEST ONLY: a few notes in memory,
by plain name at `/api/test-note/<name>`, each write made against the version it names, `If-Match`). It is still handed
in as the `api` of the threat tests and their own process (`--serve`). Their threats (Host, Origin, token, body,
limits) are the server's and not the store's.

`build.test.mjs` holds the built server free of it. The store's own escapes are tried on the real store in
`editor-store.test.js`.

## The mod, `mod/`

The folder Claude Code loads (`--plugin-dir`). It is checked by Claude Code, not by the repository's linter: run
`claude plugin validate packages/claude-code/mod` and `claude plugin test packages/claude-code/mod` before a merge
that touches it. CI has no Claude Code, so it runs neither: what the pane shows is decided in `src/`, which CI tests,
and `register.tsx` stays thin.

- `.claude-plugin/plugin.json` — the manifest, named `thoughtknot`.
- `hooks/register.tsx` — the hooks module.
  - It registers `/graph`, reads the note with `$.fs.read`, runs Graphviz with `$.process.run`, and keeps the view in
    `$.state`.
  - It draws the pane: `Svg` on the desktop, VS Code and mobile. It draws the reason and the text on the terminal
    (which draws no `Svg`), or wherever no drawing could be made.
  - Also `/graph edit <note>`, which starts the session's server through `$.process.spawn`. The child lives as long as
    the module or until the loop is left.
  - In the pane `graph-editor` it draws a `Link` to the server's address and a button that copies it. The address is
    read in that one place, and appears in no command answer, log, toast or state.
  - The session ending (`session.end`) and `/graph stop` stop the server. When it cannot start, the answer says why
    and the `graph` pane draws the note as `/graph` does.
  - The mod's drafts folder is the plugin data folder (`CLAUDE_PLUGIN_DATA`, else the plugins data folder under the
    user's Claude config).
- `hooks/hooks.json` — names `register.tsx` as the mod's one hooks module.
- `hooks/graph.d.ts` — the types of the bundle, its source's own.
- `types/index.d.ts` — the mod's state contract, self-contained as Claude Code requires.
- `tests/graph.test.tsx` — the mod in its own environment, with `claude plugin test`: the test vault's sample note drawn
  on each surface, and node missing.
- `tests/fixtures.d.ts` — the types of the built `tests/fixtures.js`: the sample note and the SVG drawn for it.

Built, never edited (gitignored): `mod/hooks/graph.js`, `mod/bin/render.mjs`, `mod/bin/editor-server.mjs`,
`mod/tests/fixtures.js`. Claude Code writes `mod/.claude-plugin/types/` when it loads the mod; `mod/tsconfig.json`
extends it, so `tsc -p packages/claude-code/mod` type-checks the mod once it has been loaded.

## Installing it for every session

The repository is a marketplace (`.claude-plugin/marketplace.json` at its root) listing the mod by its folder. So an
install reads the working copy itself, never a copy. Once, from a terminal in the checkout, after `npm run build`:
`claude plugin marketplace add <checkout>` and `claude plugin install thoughtknot@thoughtknot --scope user`. It then loads
in every new session, the desktop app's included. After a change: `npm run build`, then `/reload-plugins`.

## Build and tests

The page of the browser editor draws with the display layer shared with the Obsidian plugin,
`packages/core/src/display/` (`@thoughtknot/core/display/<module>`). It imports no Obsidian code.

`editor-page.test.js` holds that (cc_core_only). It also holds these:

- from C5, the page's host shell. Its cases are cc_one_renderer, cc_text_not_html, cc_worker_same_origin,
  cc_theme_follows, cc_icons, cc_offline and cc_settings_shared. Its support is `editor-page-support.js`: the page built
  once into a temporary folder and served by the real server, and the worker run as a thread;
- from C8, the keyboard, reduced-motion and text-version cases (`editor-page-access.js`);
- from C9, the editing cases (`editor-page-editing.js`). The page opens the note with the drawing, the details and the
  edit pane of the Obsidian host. Its colours are set under the unchanged policy. The cases cover stale writes, undo
  and the gate.

Each is run on the page as built over the real server and a vault on disk (`editor-page-live.js`). There its script
runs in a DOM, and its `fetch` is the server's own HTTP.

`editor-parity.test.js` holds that the same edit writes the same bytes here and in Obsidian (cc_same_bytes), a decision
through the page's card included. From C9 it holds every kind of edit the pane makes (`editor-parity-page.js`):

- typing, a fix, a suggestion, Undo and Redo, Lock the graph;
- an estimated link's quick fix from the drawing, another block chosen;
- the note changed elsewhere first, and a stale write.

Each is made on the page and in the plugin's pane and compared byte for byte.

## The browser editor's page, `page/` (workstream C5)

An ordinary web page in Claude Code's browser pane, not an Obsidian view. So it has its own folder and type check
(`tsc -p packages/claude-code/page`) with the DOM, and its own lint override. It is built by `esbuild.page.mjs` into
`mod/page/` (gitignored). The server reads that when it starts and serves it from its own origin. The page asks nothing
of any other (cc_offline, cc_no_remote), and the server's policy is not loosened for it.

- `page-main.ts` — `startPage`. It installs the DOM helpers and the page's host under the shared layer. It takes the
  token and the note's id out of the address's fragment, and reads the settings and the note. It shows the note's
  Markdown and, beside it, the edit pane of the Obsidian host (C9). Anything that goes wrong is said in words on the
  page, never a blank.

### The editor, the drawing and the host

- `editor-pane.ts`, `page-note.ts` (workstream C9, cc_editor_opens, cc_core_only, cc_same_bytes) — the layer's block
  editor opened on the page's note. It is `display/editor/block-editor.ts`, the one the Obsidian pane runs.
  - It has the drawing with its details, the text field, problems, fixes, suggestions, Undo, Redo and Lock the graph.
    It also has the picker of the note's graph blocks and the draft banner.
  - `PageNote` is its note, the layer's `EditorNote` over the editor server's store.
  - The core's `PaneSession` makes every write, through `EditorSession`, from the note as the page last had it. Each is
    sent whole against that version and one at a time. So the server refuses one made over a change the page has not
    seen.
  - A stale write, a note gone or any other failure keeps what was typed as the server's draft. It shows the block as
    the note now has it. Undo never goes over another program's change.
  - Its `feed` takes the change stream. `writeWhole` takes the page's own whole-note writes (a decision on a proposal,
    Lock the graph).
  - The drawing is the layer's, inline in the page, not an image. The policy is the server's, unchanged
    (`style-src 'self'`, no inline style). So the page's host sets `noInlineStyle`.
  - The layer sets the colours the core writes as style attributes through the CSSOM, which the policy allows. That is
    proved on a real browser, and in `editor-page-editing.js` by what the parser is given.
  - Not on the page: the shared schemas other notes hold (a graph naming one reads as it would with none). Nor the
    in-place card's inspector, views, played paths and pictures.
- `browser-host.ts` — the page's `DisplayHost`. Its icons are a span the stylesheet fills from `/icons/<name>.svg`,
  never the name as text. It also has the phone test, notices and menus, all set as text.
- `markdown.ts` — the one Markdown renderer (`marked`, the browser host's one runtime dependency, spec §13). Raw HTML is
  shown as text, and a link is made only to a web or mail address. An image is never loaded (cc_text_not_html).

### Colours, layout and calls

- `theme-css.ts` — the page's colours from the core's own theme colours, as CSS variables under the scheme the system
  is in. The shared styles (the plugin's `styles.css`, added to the page's sheet at build) and the drawing name them.
- `layout-runner.ts`, `layout-worker-entry.ts` — layout in a worker served at `/layout-worker.js` from the server's own
  origin. It runs under the core's `LayoutRunner` and its limits. The page carries no Graphviz engine; the worker does.
- `graph-section.ts` — the first graph laid out and drawn as an isolated image (a blob, which the policy allows). It is
  in the palette of the system's scheme, drawn again when the scheme changes, with its words beside it. Since C9 the
  page draws a note's graph with the edit pane instead. This stands for a note with no graph block to edit, which it
  says so for.
- `server-calls.ts` — the page's reads from the server (`/api/settings`, `/api/notes/<id>`), the token held in memory.
- `note-calls.ts` — the page's two other calls on its note. They are the change stream, and the user's decision written
  (the whole note, `If-Match` its version, the page's token alone). Kept apart so `server-calls.ts` stays read only.

### Proposals, changes and reviews

- `proposal-review.ts`, `proposal-card.ts` (workstream C7) — the proposals a note holds, and the user's accept or
  reject.
  - `proposalsIn` shows each over the note through the core's `ProposalReview` (nothing written).
  - `decide` accepts or rejects by the settings' decider, else "you". It gives the note's new text for `page-main.ts`
    to write.
  - The card draws the rows in words, with real buttons named for what they act on and a visible focus. The stale
    notice is a checkbox, and a decision is said in the status region (WCAG 2.2 AA, spec §11).
- `changes-section.ts` (changes_view) — "Compare with…": the note's earlier versions, asked of the server only when
  pressed. One is picked from a labelled list. The one picked is drawn with the note as it now is by the core's
  `changesView`. It is marked in the scheme's fixed colours by `markedChanges`, with the changes listed in words as the
  image's description. A note in no repository says why. Commit subjects are shown as text.
- `review-section.ts` (github_review_items) — "Review a change from GitHub…": the repository's changes, asked of the
  server only when pressed. One is picked from a labelled list, then read once and shown in levels by the core's
  `reviewLevels`:
  - a summary by section, workstream and requirement (and the files withheld, with why);
  - each graph in a `changesFigure` (shared with `changes-section.ts`);
  - and every line, marked `+`, `−` or blank as well as by colour.

### The keyboard and the shell

- `keyboard.ts`, `text-version.ts` (workstream C8, cc_keyboard, cc_reduced_motion, cc_text_version; WCAG 2.2 AA) — the
  keyboard and the text version.
  - `skipLink` is the first thing tabbed to, and moves focus to the note.
  - `keepFocus`: a redraw gives the focus back to the control that had it, by kind, name and place.
  - The graph's plain-language sentences are a labelled, never hidden section: the core's `textVersion`. It is drawn
    again with every drawing, and stands alone when it cannot be drawn.
  - Menus (in `browser-host.ts`) are walked by the arrow keys, Home and End. Escape or Tab return the focus.
  - `page.css` has the focus ring on every control. It has a reduced-motion rule that stills every animation,
    transition and smooth scroll.
  - The words stand under the editor's drawing, which has its own for screen readers too.
- `index.html`, `page.css`, `icons/` — the shell, its styles, and the icon files. The icons are hand-drawn after
  Lucide's and credited in `licences/bundled.json`. They are image files, never a code library (cc_one_renderer).

### Export from the page

- `export-run.ts`, `export-calls.ts`, `png.ts` (workstream C6, cc_export_same) — the Export form is the shared layer's.
  It is `toggleExportForm`, on an Export button in a toolbar under the graph.
  - `runExport` carries out what it asks with the core exactly as the plugin does. It takes the scope, then
    `exportPlan`: nothing to export, the classification question first, or go.
  - It draws the image by `exportWithLayout` through the worker, or the data as GQL, CSV or GraphML. A PNG is
    rasterised by the page (`png.ts`) at the core's size, on pages when too large.
  - All are drawn before any is saved. A companion note, when set, follows under the name the image was saved as.
  - The files go to the server in one call (`export-calls.ts`, apart from `server-calls.ts`, which only reads).
  - Not offered on the page: views, played paths and the pictures on boxes (a frame).
  - The page bundle stands an empty module in for the core's Graphviz engine (`esbuild.page.mjs`). The layer takes
    values from the core's entry, which names the engine; only the worker carries it.

The server's side: `server/page-assets.ts` (the files, kept in memory, served by exact path) and
`server/page-settings.ts`. `server/page-settings.ts` serves `GET /api/settings`: the mod's settings read back by the
core as the plugin reads them, with no model's address or key, never written. The mod hands the settings the page shows
with in the same environment variable as the gate's (`src/editor-settings-env.ts`).

### Building and testing the mod

- `npm run build --workspace packages/claude-code` (`esbuild.config.mjs`) builds the mod, and its test fixtures from
  `test-vault/Sample graph note.md`. The root `npm run build` runs it.
- `test/` runs in the repository's suite:
  - `graph-view.test.js` and `graphviz-process.test.js`.
  - `build.test.mjs`: the build writes a hooks bundle with no WebAssembly engine, under 1 MiB, and a render script that
    draws.
  - `editor-threats.test.js` and `editor-threats-process.test.js`: the server's threat model, each threat tried against
    a running server or process started in the test. Their support is `editor-threats-support.js`.
  - `editor-store.test.js`: the note store on a real vault in a temporary folder, served by a running server, with
    `EditorSession` as the page. A watcher is fired by hand and file steps held, never a clock.
  - `editor-store-hardening.test.js`: what the security review of #450 found. It covers a draft saved during a write, a
    note's mode, hard links and a folder swapped under a write. It also covers the drafts folder's mode and longest
    draft, and the real fs.watch.
  - Those two store tests share their support, `editor-store-support.js`.
  - `editor-export.test.js`: the export on a real vault and a running server (test_cc_export). It tries new files only,
    escapes, links, races, names and limits.
  - `editor-page-export.js` (cc_export_same, run from `editor-page.test.js`).
  - `editor-mod.test.js`: `/graph edit` from the mod. It runs the launcher over real server processes started the way
    the host starts one, with standard input closed at once. Its support is `editor-mod-support.js`.
  - The other workstreams' cases for `test_cc_mod`: C3's, the gate, are in `editor-mod.test.js`. C7's, Claude's
    proposals, are in `editor-mod-claude.test.js`.
- The mod's wiring (`register.tsx`) is checked by `claude plugin validate` and a type check. `claude plugin test` needs
  a Claude Code signed in and online, so no test of it is in the repository yet.
