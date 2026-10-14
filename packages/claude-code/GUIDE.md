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
- `mod-entry.ts` — what the hooks module takes from the two above; bundled into `mod/hooks/graph.js`.
- `editor-session.ts` — `EditorSession`, the browser editor page's side of a note (spec §26; for C5): the core's
  `PaneSession` and `TextHistory` over one block, the note and version the page last had from the server, what to send
  (`write`, `undo`, `redo`, each `against` that version, so the server refuses one made over a change it has not seen),
  and `changed` for a change on disk: drawn again, or a conflict that keeps what is typed (cc_redrawn_on_change). Once
  another program changes the block, the writes before it are never undone, and undo says so (`UNDO_OVER_THEIRS`),
  and the typing history starts again from the block as reloaded (cc_undo_safe).

## The process, `bin/`

- `bin/render-process.ts` — the core's `loadEngine`, run by node: a JSON list of DOT on stdin, a JSON list of SVG on
  stdout. Bundled into `mod/bin/render.mjs`.

## The browser editor's server, `server/`

The local server the browser-pane editor will talk to (spec §26, slice 4; workstream C0). It runs in Node as a process of
its own, so it sits outside `src/` (whose modules may import no Node built-in): Node's own `http`, no framework and no
runtime dependency beyond the core's `READ_LIMITS`. Built into `mod/bin/editor-server.mjs`.

- `server/editor-server.ts` — the shipped process: `runEditorProcess` with its arguments, and no API of its own yet:
  the process has no way to learn its vault until the mod hands it one (C2), and then runs the note store below.
- `server/editor-process.ts` — `runEditorProcess`: refuses (exit 2) any argument, so it can never be told to listen
  elsewhere, and a start with no parent left (`process.ppid` is 1), which nothing would stop; prints one line of JSON,
  `{"url":"http://127.0.0.1:<port>/#token=<token>"}`, the token in the fragment and written nowhere else (no port or
  token file); says on stderr why it stopped, and exits. The code that runs it may hand in an `api`; arguments never.
- `server/start-server.ts` — `startEditorServer`: listens on 127.0.0.1 alone, on a port the system chooses, with a fresh
  256-bit token; every request through `request-guard.ts` first; no query or fragment in an address, so a token there
  is refused; the page (a placeholder until C5) served with no token, as it says nothing of any note; every `/api/`
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
  read and write checks the note's place again (410 when it moved or now leads out). `stop` closes the watchers, lets
  no write start (each checks again when its turn under the lock comes) and resolves once those under way are done.
- `server/note-place.ts` — `notePlace` (cc_no_escape): a path, as written and as its real path, every link followed,
  must be inside the vault, end in `.md`, have no part starting with a dot (`.obsidian`, `.git`, `.trash`, a hidden
  file) and hold no NUL; a link that leads out of the vault, into a hidden folder or onto another kind of file is
  refused, each saying why.
- `server/note-file.ts` — `readNoteFile` (the whole note within the core's read limit, `O_NOFOLLOW`, UTF-8 that must
  decode exactly; its version the SHA-256 of its bytes) and `writeAtomically` (cc_atomic_write): a new, hidden file
  beside the note, written and flushed, then renamed into place, the folder flushed; on any failure the temporary file
  is removed and the note is as it was. `NoteFiles` are its three steps, which the tests hand in to hold or break one.
- `server/note-drafts.ts` — `DraftShelf` (cc_drafts_outside): a draft for each note in the data folder, named by a
  digest of the vault and the note's path, readable by its owner only, written as a note is, and offered when the note
  is next opened; a write that is made clears it.
- `server/note-watch.ts` — `watchNote`: `fs.watch` on the note's folder (a note replaced by a rename is still
  followed), its burst of events read once, `WATCH_DEBOUNCE_MS` (100 ms) after the last; the store is handed it, so a
  test fires a watcher by hand.

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
  reason and the text on the terminal (which draws no `Svg`) or wherever no drawing could be made.
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

- `npm run build --workspace packages/claude-code` (`esbuild.config.mjs`) builds the mod, and its test fixtures from
  `test-vault/Sample graph note.md`. The root `npm run build` runs it.
- `test/` runs in the repository's suite: `graph-view.test.js`, `graphviz-process.test.js`, `build.test.mjs` (the
  build writes a hooks bundle with no WebAssembly engine, under 1 MiB, and a render script that draws), and
  `editor-threats.test.js` and `editor-threats-process.test.js` (the server's threat model, each threat tried against a
  running server or process started in the test), with their support, `editor-threats-support.js`; and
  `editor-store.test.js` (the note store on a real vault in a temporary folder, served by a running server, with
  `EditorSession` as the page; a watcher fired by hand and file steps held, never a clock), with its support,
  `editor-store-support.js`.
