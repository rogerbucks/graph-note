# The Claude Code host: where things live

A Claude Code mod whose `/graph <note>` draws the note's first graph in a pane (spec §10, Hosts), on the same host-free
core as the Obsidian plugin. A mod's hooks run in an environment of their own, with no DOM, no Node and no WebAssembly:
reading, the layout source and theming run there, bundled; Graphviz, the core's own engine, runs as a process through
`node`, DOT in and SVG out. When `node` is missing, the pane says so and shows the graph as text, never a blank drawing.
A pane draws the SVG as an isolated image, so its colours are the core's system palette (`palette.ts`, the one colour
mapping): the fixed light and dark palettes both carried in the drawing's own style sheet, `prefers-color-scheme`
choosing, with the page painted in. The mod API says nothing of the app's appearance, and Claude Code's theme setting is
the terminal's, so nothing is guessed: the drawing follows the scheme the app hands its pages, which is the system's
unless the app sets its own. Whether the desktop app does, and keeps the drawing's style sheet, is checked by eye.

## The source, `src/`

- `graph-view.ts` — `viewOf`: what the pane shows for a note. The first graph drawn in a palette, and always the same
  graph as lines of text, which stand in, with the reason, when it cannot be drawn: over the layout limits, over what a
  pane takes, or Graphviz not run. A note too large to read, a graph that could not be read (its errors, with their note
  lines) and an empty graph each say so, never "no graph". Also `PANE_PALETTE` (the system palette, and why) and
  `notePath` (/graph's argument).
- `graphviz-process.ts` — `layOut`: the DOT sources handed to the render script through node, within the core's time
  limit (`LAYOUT_TIMEOUT_MS`), and the SVGs back. After a refused run, `node --version` is asked: a node that is not
  there (ENOENT, "not found") or exit code 127 is said as `NODE_MISSING`, in words with what to do; a host that runs no
  process says its own words; a node that starts means the layout did not finish.
- `editor-paths.ts` — also `insideVault`: a path written relative to the vault, as a full path inside it, or null (the
  matrix note is never read from outside the vault). `editor-launch.ts` reads the matrix note for Claude's row
  (`gateSettings`) and hands the server the row, switches, class names and rows (`settingsForServer`), so both gates
  agree; a note that cannot be read gives no rows and the row clears nothing.
- `editor-matrix.ts` — `withMatrix`: the matrix note read for Claude's row, only from inside the vault's real path.
- `editor-realpath.ts` — `realPathVia`: a file's real path, links settled, asked of the shipped process
  `bin/real-path-process.ts` (built to `mod/bin/real-path.mjs`, run by node) through the host's process call, as the
  mod's file calls settle no links; the path is the one argument. The matrix note is read
  only when its real path is inside the vault's real path; a link out, a host with no such call, or a path that cannot
  be settled refuses it with a plain reason (`matrixProblem`), which both gates give.
- `editor-launch.ts` — `EditorLauncher` (workstream C2): the session's one browser-editor server, started for a note
  through the host's `spawn` (handed in, so no Node module is imported), its first line of output read for the address,
  which only `link` gives (a `#` field, so `JSON.stringify` shows none). `edit` reuses the server for the same note,
  replaces it for another (one server for each session, cc_one_server), and says why a start failed in words
  (cc_start_failure); `stop` kills it; a server that ends by itself is forgotten, with why in `ended`. One call at a
  time. `sayEdit`, `sayStopped`, `editArgs` and `confirmArgs` are the words and the command line; none holds the address,
  the token or the note's text (cc_transcript_clean). **The gate (workstream C3):** before any server starts, `edit` reads
  the note through the `read` port, the settings through the `settings` port, and asks the core's `claudeGate`. A note
  above Claude's ceiling starts nothing and is remembered as asked about: `confirm` (`/graph confirm`) is the user's
  yes, for that one note, once, and checks the gate again first (cc_classified_asks). The highest classification, one not
  among those set, an unlabelled note when the level for such notes is the highest (the default), a credential, and a
  note or settings that cannot be read have no yes (cc_credential_never). `held` on the outcome says which, and neither
  is drawn in its place. Only the person typing can say yes: `edit` and `confirm` take the host's `origin`, and
  `fromPerson` accepts exactly `origin.kind === 'composer'`; any other, or none, is refused (`bridge`, Remote Control, is
  an open question for the owner and is not accepted). The yes is the digest of the text it was given about, handed to
  the server (`GRAPH_NOTE_EDITOR_CONFIRMED`, with `_SETTINGS`), which runs the same gate (`server/editor-gate.ts`,
  `storeGate`) before every send in `editor-store.ts`: a read, a draft, the change stream, a stale write's answer. A
  refusal sends `gone` and no text, and a changed note needs a new question. A note already open and now held back is closed. `gate` asks the same for `/graph <note>`'s own
  drawing. The mod reads the settings from `settings.json` in its data folder; none is the defaults, the strictest.
- `data-guard.ts` — `guardDataFolder` (spec §26): the mod's data folder, which holds `settings.json` and the drafts, is the
  user's alone, so a `tool.call` hook in `register.tsx` refuses Claude's own Write, Edit, NotebookEdit and Bash calls that
  reach it (a guard that fails refuses too; `MultiEdit` is not a tool of this Claude Code, and is judged if it appears).
  The refusal (`DATA_FOLDER_REFUSAL`) says the user changes these settings, in `settings.json` in the plugin data folder,
  and echoes nothing of the call. Reads (the Read tool, Grep) are not hooked. **File tools** are judged by the target's
  real path (asked of `bin/real-path.mjs`), a relative path taken from the session's folder, a file not yet made by its
  nearest parent that exists, so a link elsewhere, or a linked parent, is found, and so is a link that leads nowhere yet (a dangling link, or
  one as a parent, asked of the same process with `--link` and followed from the link's own folder, up to 8 in a
  row). Names are compared without regard to case, and the real path is the disk's own (`realpathSync.native`), so
  `GRAPH-NOTE` on a macOS disk is the folder. **Fail closed:** a path that is not there is an answer (exit 2), but node
  missing, a process that fails or one that does not answer in time refuses the call (`CHECK_FAILED_REFUSAL`). An empty
  `CLAUDE_PLUGIN_DATA` is unset. **Scope:** the editor server's own writes of drafts are the mod's and are not
  hooked; the hook judges Claude's tool calls, which a subagent's are among when the host raises `tool.call` for them
  (not tested here). **Bash limits, honestly:** a command
  cannot be parsed, so it is refused when it names the folder at all, even to read it (as written, real, through the
  home folder by tilde or the HOME variable, or by `CLAUDE_PLUGIN_DATA`), or names `plugins/data` as whole path parts (so a renamed or moved
  folder is caught; the check is made on a copy with quotes and backslashes taken out and the home forms put in), or has a word (the first 40 with a `/`, or starting `.` or `~`) that
  resolves into it. It does not stop a path the shell builds (`cd` there, then a bare file name; a variable, a glob,
  command substitution or an encoded string that makes the path), a program that is handed no path and finds the folder
  itself, or a write through another tool such as an MCP server. It is a guard against a session slipping, not against
  one set on getting round it; the settings file's own mode is the other half.
- `mod-entry.ts` — what the hooks module takes from the three above; bundled into `mod/hooks/graph.js`.
- `editor-session.ts` — `EditorSession`, the browser editor page's side of a note (spec §26; for C5): the core's
  `PaneSession` and `TextHistory` over one block, the note and version the page last had from the server, what to send
  (`write`, `undo`, `redo`, each `against` that version, so the server refuses one made over a change it has not seen),
  and `changed` for a change on disk: drawn again, or a conflict that keeps what is typed (cc_redrawn_on_change). Once
  another program changes the block, the writes before it are never undone, and undo says so (`UNDO_OVER_THEIRS`),
  and the typing history starts again from the block as reloaded (cc_undo_safe). Stopped by a copy of its block it
  cannot tell from it, undo says that in the core's words instead (block_followed_not_its_copy).

## The process, `bin/`

- `bin/render-process.ts` — the core's `loadEngine`, run by node: a JSON list of DOT on stdin, a JSON list of SVG on
  stdout. Bundled into `mod/bin/render.mjs`.

## The browser editor's server, `server/`

The local server the browser-pane editor will talk to (spec §26, slice 4; workstream C0). It runs in Node as a process of
its own, so it sits outside `src/` (whose modules may import no Node built-in): Node's own `http`, no framework and no
runtime dependency beyond the core's `READ_LIMITS`. Built into `mod/bin/editor-server.mjs`.

- `server/editor-server.ts` — the shipped process: `runEditorProcess` with its arguments and the options
  `editor-main.ts` makes from the environment; a vault or note it is refused says why on stderr and exits 2.
- `server/editor-main.ts` — `optionsFromEnvironment`: the mod hands the process `GRAPH_NOTE_EDITOR_VAULT`, `_NOTE`
  (the one note opened for the session, by its path) and `_DRAFTS`, never an argument; it makes the note store, opens
  the note, and gives the process the store's `api` and `stop`, the note's id (the address becomes
  `/#token=<token>&note=<id>`, both in the fragment a browser never sends) and, for `_INPUT=ignore`, no watch on its
  input: the host closes a child's input when it starts it, so there the session's end is the child being killed.
  With no vault set it serves no API, as before.
- `server/editor-process.ts` — `runEditorProcess`: refuses (exit 2) any argument, so it can never be told to listen
  elsewhere, and a start with no parent left (`process.ppid` is 1), which nothing would stop; prints one line of JSON,
  `{"url":"http://127.0.0.1:<port>/#token=<token>"}`, the token in the fragment and written nowhere else (no port or
  token file); says on stderr why it stopped, and exits. The code that runs it may hand in an `api`; arguments never.
- `server/start-server.ts` — `startEditorServer`: listens on 127.0.0.1 alone, on a port the system chooses, with a fresh
  256-bit token; every request through `request-guard.ts` first; no query or fragment in an address, so a token there
  is refused; the page's files (`PageAssets`, read once from the built `mod/page/`, served by exact path with no token, as
  they say nothing of any note; with none, a placeholder at `/` alone) and, for the worker's file alone, a policy with
  `'wasm-unsafe-eval'` added to `script-src` (see `page-assets.ts`); every `/api/`
  call needs the token, then goes to the `api` handed in (`ApiHandler`; none, and it is not found); a write needs the
  server's own origin. An answer may be a stream (`ApiAnswer.feed`), written piece by piece until either side closes.
  A stop refuses any call not yet handed to the API (503) and resolves `closed` only once `drain` (the store's own
  stop) has finished the writes under way. `SERVER_LIMITS` holds clients to 10 s for the headers, 30 s for a request, 5 s for an idle
  connection, 64 headers and 32 connections; a request Node cannot read is refused (400, 408 or 431) with the security
  headers too, and one with no Host comes to the checks and is refused there. It stops after `IDLE_MS` (30 minutes)
  with no request open and none of the page's, its clock and timer injectable (`now`, `every`), or at once on `stop`:
  only the page itself (`GET /` from its own address) or a call that passed the token starts the wait again, so a page
  probing ports cannot keep it alive.
- `server/request-guard.ts` — the checks: the exact Host (`127.0.0.1:<port>` or `localhost:<port>`, no forwarded or
  Tailscale header read), no other Origin and no cross-site `Sec-Fetch-Site` on any request, a write's Origin its own
  and `Sec-Fetch-Site: same-origin`, the token only as `Authorization: Bearer`, compared in constant time
  (`timingSafeEqual` over SHA-256 digests); and `SECURITY_HEADERS`, on every answer: the content security policy
  (`CSP`, with `base-uri`, `form-action` and `object-src` all `'none'`), `nosniff`, `no-store`, `no-referrer`,
  `Cross-Origin-Opener-Policy: same-origin`, and no CORS header ever (OPTIONS is refused).
- `server/request-body.ts` — `readBody`: a body held to the core's read limit for a note (`READ_LIMITS.bytes`), refused
  (413) before it is read when its length says it is larger, or as soon as one sent in parts passes it.
- `server/session-watch.ts` — `watchSession`: stops the process when its input closes (the session ended), when its
  parent changes (the process that started it exited) or on SIGTERM, SIGINT or SIGHUP (`/graph stop`).

The note store (workstream C1), the real `api`:

- `server/editor-store.ts` — `NoteStore`: `create` takes the vault (kept as its real path) and the mod's data folder
  for drafts (refused inside the vault); `open` opens a note by the path the mod names, never the page, and gives the
  id the page uses (128 random bits; the same id for a note already open, however reached; cc_open_notes_only); `api`
  answers `GET notes/<id>` (`{text, version, draft}`, the version also the ETag), `PUT notes/<id>` (If-Match needed,
  428 without; compared under a lock for the note; 409 with the note as it now is when stale, what was typed kept as a
  draft; cc_write_if_unchanged), `PUT notes/<id>/draft` (an empty one clears it) and `GET notes/<id>/events` (a
  stream, a JSON object to a line: the note now, then each change on disk that differs from what the page has, or
  `{gone}`; cc_redrawn_on_change). Anything else, an id never opened among it, is "No such note is open." (404). Each
  read and write checks the note's place again (410 when it moved or now leads out). A draft is kept under the note's
  lock too, so a write under way never clears one saved after it began; a write that is made clears the draft unless
  that draft was typed against the very version it wrote, and differs. `stop` closes the watchers, lets no write start
  (each checks again when its turn under the lock comes) and resolves once those under way are done. **A write refused
  with 503 keeps no draft** (keeping one is a write too): the page must keep its own text when the server stops.
- `server/note-place.ts` — `notePlace` (cc_no_escape): a path, as written and as its real path, every link followed,
  must be inside the vault, end in `.md`, have no part starting with a dot (`.obsidian`, `.git`, `.trash`, a hidden
  file) and hold no NUL; a link that leads out of the vault, into a hidden folder or onto another kind of file is
  refused, each saying why, and so is a file with a second hard link (`nlink > 1`), which could lie outside the vault.
- `server/note-file.ts` — `readNoteFile` (the whole note within the core's read limit, `O_NOFOLLOW`, the path's real
  path still itself once it is open, so no folder swapped for a link is read through, and the file opened held to the
  one at the path by device and inode, UTF-8 that must decode exactly; its version the SHA-256 of its
  bytes) and `writeAtomically` (cc_atomic_write): a new, hidden file beside the note, given the note's mode with
  `chmod` (the umask narrows `open`'s), written and flushed, its folder's real path checked to be the note's still, then
  renamed into place, the folder flushed; on any failure the temporary file is removed and the note is as it was. A
  write refused because its folder was swapped can leave its temporary file in the folder swapped away, which the store
  can no longer reach by the note's path.
  `NoteFiles` are its three steps, which the tests hand in to hold or break one. **What the rename does not keep:** a
  note's extended attributes, ACLs, other hard links (refused anyway) and birth time are those of the new file, not
  the old. **Flushing on macOS:** `fsync` there is not `F_FULLFSYNC`, so the drive's own cache may still hold a write
  that has been flushed; Node offers no `F_FULLFSYNC`, and the rename keeps the note whole either way.
- `server/note-drafts.ts` — `DraftShelf` (cc_drafts_outside): a draft for each note in the data folder (set to 0700
  when opened), named by a digest of the vault and the note's path, readable by its owner only (0600), written as a
  note is, and offered when the note is next opened; a draft file may hold up to `6 × BODY_LIMIT + 1024` characters,
  room for a note's worth of control characters as JSON writes them.
- `server/note-watch.ts` — `watchNote`, `watchWith(ms)`: `fs.watch` on the note's folder (a note replaced by a rename
  is still followed), its burst of events read once, `WATCH_DEBOUNCE_MS` (100 ms) after the last; the store is handed
  it, so a test fires a watcher by hand.

Nothing of the tests ships: their stand-in, `test/fixtures/editor-server-test.ts` (TEST ONLY: a few notes in memory,
by plain name at `/api/test-note/<name>`, each write made against the version it names, `If-Match`), is still handed in
as the `api` of the threat tests and their own process (`--serve`), whose threats (Host, Origin, token, body, limits)
are the server's and not the store's; `build.test.mjs` holds the built server free of it. The store's own escapes are
tried on the real store in `editor-store.test.js`.

## The mod, `mod/`

The folder Claude Code loads (`--plugin-dir`). It is checked by Claude Code, not by the repository's linter: run
`claude plugin validate packages/claude-code/mod` and `claude plugin test packages/claude-code/mod` before a merge
that touches it. CI has no Claude Code, so it runs neither: what the pane shows is decided in `src/`, which CI tests,
and `register.tsx` stays thin.

- `.claude-plugin/plugin.json` — the manifest, named `graph-note`.
- `hooks/register.tsx` — the hooks module: registers `/graph`, reads the note with `$.fs.read`, runs Graphviz with
  `$.process.run`, keeps the view in `$.state`, and draws the pane: `Svg` on the desktop, VS Code and mobile; the
  reason and the text on the terminal (which draws no `Svg`) or wherever no drawing could be made. Also
  `/graph edit <note>`, which starts the session's server through `$.process.spawn` (the child lives as long as the
  module or until the loop is left) and draws, in the pane `graph-editor`, a `Link` to its address and a button that
  copies it; the address is read in that one place and appears in no command answer, log, toast or state. The session
  ending (`session.end`) and `/graph stop` stop the server; when it cannot start, the answer says why and the `graph`
  pane draws the note as `/graph` does. The mod's drafts folder is the plugin data folder
  (`CLAUDE_PLUGIN_DATA`, else the plugins data folder under the user's Claude config).
- `hooks/hooks.json` — names `register.tsx` as the mod's one hooks module.
- `hooks/graph.d.ts` — the types of the bundle, its source's own.
- `types/index.d.ts` — the mod's state contract, self-contained as Claude Code requires.
- `tests/graph.test.tsx` — the mod in its own environment, with `claude plugin test`: the test vault's sample note drawn
  on each surface, and node missing.
- `tests/fixtures.d.ts` — the types of the built `tests/fixtures.js`: the sample note and the SVG drawn for it.

Built, never edited (gitignored): `mod/hooks/graph.js`, `mod/bin/render.mjs`, `mod/bin/editor-server.mjs`,
`mod/tests/fixtures.js`. Claude Code writes
`mod/.claude-plugin/types/` when it loads the mod; `mod/tsconfig.json` extends it, so `tsc -p packages/claude-code/mod`
type-checks the mod once it has been loaded.

## Installing it for every session

The repository is a marketplace (`.claude-plugin/marketplace.json` at its root) listing the mod by its folder, so an
install reads the working copy itself, never a copy. Once, from a terminal in the checkout, after `npm run build`:
`claude plugin marketplace add <checkout>` and `claude plugin install graph-note@graph-note --scope user`. It then loads
in every new session, the desktop app's included. After a change: `npm run build`, then `/reload-plugins`.

## Build and tests

The page of the browser editor draws with the display layer shared with the Obsidian plugin,
`packages/core/src/display/` (`@graph-note/core/display/<module>`), and imports no Obsidian code. `editor-page.test.js`
holds that (cc_core_only), and, from C5, the page's host shell: cc_one_renderer, cc_text_not_html, cc_worker_same_origin,
cc_theme_follows, cc_icons, cc_offline and cc_settings_shared, with its support, `editor-page-support.js` (the page built
once into a temporary folder and served by the real server, and the worker run as a thread); it is partial until C8 adds
the keyboard, reduced-motion and text-version cases. `editor-parity.test.js` holds that the same edit
writes the same bytes here and in Obsidian (cc_same_bytes).

## The browser editor's page, `page/` (workstream C5)

An ordinary web page in Claude Code's browser pane, not an Obsidian view, so it has its own folder and type check
(`tsc -p packages/claude-code/page`) with the DOM, and its own lint override. Built by `esbuild.page.mjs` into
`mod/page/` (gitignored), which the server reads when it starts and serves from its own origin; the page asks nothing of
any other (cc_offline, cc_no_remote), and the server's policy is not loosened for it.

- `page-main.ts` — `startPage`: installs the DOM helpers and the page's host under the shared layer, takes the token and
  the note's id out of the address's fragment, reads the settings and the note, and shows the note's Markdown and its
  first graph; anything that goes wrong is said in words on the page, never a blank.
- `browser-host.ts` — the page's `DisplayHost`: icons (a span the stylesheet fills from `/icons/<name>.svg`, never the
  name as text), the phone test, notices and menus, all set as text.
- `markdown.ts` — the one Markdown renderer (`marked`, the browser host's one runtime dependency, spec §13): raw HTML is
  shown as text, a link is made only to a web or mail address, an image is never loaded (cc_text_not_html).
- `theme-css.ts` — the page's colours from the core's own theme colours, as CSS variables under the scheme the system is
  in, which the shared styles (the plugin's `styles.css`, added to the page's sheet at build) and the drawing name.
- `layout-runner.ts`, `layout-worker-entry.ts` — layout in a worker served at `/layout-worker.js` from the server's own
  origin, under the core's `LayoutRunner` and its limits; the page carries no Graphviz engine, the worker does.
- `graph-section.ts` — the first graph laid out and drawn as an isolated image (a blob, which the policy allows) in the
  palette of the system's scheme, drawn again when the scheme changes, its words beside it.
- `server-calls.ts` — the page's reads from the server (`/api/settings`, `/api/notes/<id>`), the token held in memory.
- `index.html`, `page.css`, `icons/` — the shell, its styles, and the icon files (hand-drawn after Lucide's, credited in
  `licences/bundled.json`; image files, never a code library, cc_one_renderer).

The server's side: `server/page-assets.ts` (the files, kept in memory, served by exact path) and `server/page-settings.ts`
(`GET /api/settings`: the mod's settings read back by the core as the plugin reads them, no model's address or key, never
written). The mod hands the settings the page shows with in the same environment variable as the gate's
(`src/editor-settings-env.ts`).

- `npm run build --workspace packages/claude-code` (`esbuild.config.mjs`) builds the mod, and its test fixtures from
  `test-vault/Sample graph note.md`. The root `npm run build` runs it.
- `test/` runs in the repository's suite: `graph-view.test.js`, `graphviz-process.test.js`, `build.test.mjs` (the
  build writes a hooks bundle with no WebAssembly engine, under 1 MiB, and a render script that draws), and
  `editor-threats.test.js` and `editor-threats-process.test.js` (the server's threat model, each threat tried against a
  running server or process started in the test), with their support, `editor-threats-support.js`; and
  `editor-store.test.js` (the note store on a real vault in a temporary folder, served by a running server, with
  `EditorSession` as the page; a watcher fired by hand and file steps held, never a clock) and
  `editor-store-hardening.test.js` (what the security review of #450 found: a draft saved during a write, a note's
  mode, hard links, a folder swapped under a write, the drafts folder's mode and longest draft, and the real fs.watch),
  with their support, `editor-store-support.js`; and `editor-mod.test.js` (`/graph edit` from the mod: the launcher
  over real server processes started the way the host starts one, standard input closed at once; the other
  workstreams' cases for `test_cc_mod`: C3's, the gate, are in it, C7's are still to be added, and it is `partial` until then), with its support, `editor-mod-support.js`. The mod's wiring
  (`register.tsx`) is checked by `claude plugin validate` and a type check; `claude plugin test` needs a Claude Code
  signed in and online, so no test of it is in the repository yet.
