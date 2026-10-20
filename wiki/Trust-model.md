# Trust model

Who and what each part of ThoughtKnot trusts, and where that trust ends. Reviewed on 20 October 2026 against `main`,
at Roger's request. This is spec section 54, workstream TM1 in Wave 6.

- **Why first:** Wave 6 builds the host, storage and plug-in contracts and graph-format security. They build on this.
- **What it found:** 12 boundaries. 14 new gaps went into the [risk register](https://github.com/rogerbucks/thoughtknot/blob/main/RISKS.md)
  as `TRUST-1` to `TRUST-14`. The gaps the expert panel found on 19 October are named too.
- **Who decides:** Roger. Each gap has a proposed fix now or fix later. He can move any of them.
- **Keep it current:** a pull request that adds a boundary updates this page. `test/trust-model.test.js` fails when a
  file that reaches the network, starts a process or serves a port is not named here.

## The actors

| Actor | What it is | Trusted to |
|---|---|---|
| the person | The user at the keyboard | Decide. Only the person says yes to a send, a proposal or a class. |
| Obsidian | The host app and its vault | Hold the notes and the secret store. Its plug-in has no content policy. |
| the Claude Code mod | Hooks, commands and the pane inside Claude Code | Guard writes and start the editor server. |
| the editor server | A local web server the mod starts | Serve one vault to one browser tab, behind a token. |
| Claude | The AI in Claude Code | Read and propose. Never to raise its own limits. |
| AI models | Model endpoints the person picks in Obsidian | Nothing. They get only what the person saw and sent. |
| plug-ins | Code that adds exporters and other extension points | Today, only plug-ins that ship with ThoughtKnot. |
| joined graphs | Notes and graphs read from other notes, files or databases | Nothing. They are data, checked before use. |
| GitHub | The API, pull requests and the CI that builds releases | Read only, through the person's own sign-in. |
| peers | Other devices and people on the mesh | Not built yet. See the boundaries still to come. |
| servers | Sync, web and corporate servers | Not built yet. See the boundaries still to come. |

## The boundaries

### B1. The browser and the editor server

- **Sides:** the browser tab, and any other local process or website, against the editor server.
- **Crosses:** note reads and writes, exports, settings, an event stream and the page's own files.
- **Trusted:** the server trusts only a request with its session token. The tab trusts only its own origin.
- **Controls:** It listens on 127.0.0.1 only, on a port the system picks. The Host header must match, which stops DNS
  rebinding. A foreign Origin is refused. The 256-bit token lives in memory and in the URL fragment only. A strict
  content policy blocks inline script and framing. Bodies, headers and idle time are limited.
- **Code:** `packages/claude-code/server/start-server.ts`, `packages/claude-code/server/request-guard.ts`,
  `packages/claude-code/server/request-body.ts`.
- **Gaps:**
  - The token is the only real control, and it is drawn in a pane Claude can read. With it, a local process can write
    notes past the proposal card (SEC-4).

### B2. The mod and the editor server process

- **Sides:** the Claude Code mod against the server process it starts.
- **Crosses:** fixed arguments, the environment, the proposer key on stdin, and the URL on stdout.
- **Trusted:** the mod trusts only a URL that starts with `http://127.0.0.1:`. The server trusts the key on stdin.
- **Controls:** No shell. The key goes on stdin, never in arguments or the environment. Model endpoints and keys are
  left out of the settings. A slow start is stopped.
- **Code:** `packages/claude-code/src/editor-launch.ts`, `packages/claude-code/src/editor-realpath.ts`,
  `packages/claude-code/bin/propose-process.ts`.
- **Gaps:**
  - The gate settings and a confirmed note's digest travel in the environment (TRUST-12).

### B3. Claude and the vault

- **Sides:** Claude's tools and commands against the vault, the mod's data folder and the open note.
- **Crosses:** Read, Grep, Write, Edit, MultiEdit and Bash calls, the `/graph` commands, and the propose tool.
- **Trusted:** Claude may read and propose. Only the person may confirm a note above Claude's ceiling.
- **Controls:** The note gate refuses credentials, an unknown class and the highest class. A yes is bound to the hash
  of that exact text. The server asks the gate again before each send. Writes into the data folder or the open note are
  refused by real path.
- **Code:** `packages/claude-code/mod/hooks/register.tsx`, with `packages/claude-code/src/data-guard.ts` and
  `packages/core/src/claude-gate.ts`.
- **Gaps:**
  - Claude's own Read and Grep reach every note, whatever its class (AI-2).
  - Claude can edit the matrix note or a note's class line, and so loosen its own gate (TRUST-1).
  - MultiEdit and file tools from other servers are not hooked (TRUST-2).
  - The Bash guard cannot see paths the shell builds (SEC-3).
  - `/graph` checks the note, then reads it again to draw (TRUST-11).

### B4. The editor server and the file system

- **Sides:** the editor server against the vault, the export folder, drafts and git.
- **Crosses:** note text, export files and the note's history.
- **Trusted:** a path inside the vault both as written and by real path. Nothing else.
- **Controls:** Hidden folders, other file types and hard-linked files are refused. Exports never follow a link and
  are written all or nothing. Git runs with hooks and fsmonitor off, no protocols and a short timeout.
- **Code:** `packages/claude-code/server/note-history.ts`, with `note-place.ts` and `export-files.ts` beside it.
- **Gaps:**
  - Any text is written under an `.svg` name (SEC-9).
  - git still reads the repository's own settings, so a signing program could run (TRUST-10).

### B5. The editor server and GitHub

- **Sides:** the editor server against the GitHub API, through the person's own `gh`.
- **Crosses:** pull request, commit and merge lists, their titles and messages, and file contents.
- **Trusted:** the person's sign-in. GitHub's text is outside data.
- **Controls:** Only `GET` calls, with fixed arguments, no shell and no token in the environment. Names, numbers and
  paths are checked. Items open only if they were listed. Each file is held to the note gate.
- **Code:** `packages/claude-code/server/github-reader.ts`.
- **Gaps:**
  - Titles, authors and messages reach Claude's pane with no credential scan or data fence (TRUST-4).

### B6. Note text and the drawing

- **Sides:** the text of a note against the page, Obsidian and the pane that draw it.
- **Crosses:** labels, links, images and the SVG drawing.
- **Trusted:** nothing in the note. It is all data.
- **Controls:** Labels are escaped and no links are drawn. Markdown escapes raw HTML and allows only web and mail links.
  Images load only from inside the vault. The pane's SVG is limited in size.
- **Code:** `python/graph_spec/src/graph_svg.py`, with `packages/graph-spec/src/graph-layout.js` and
  `packages/core/src/display/graph-view/drawing-svg.ts`.
- **Gaps:**
  - Nothing cleans the SVG before it enters the live page, so one escaping bug would run script (TRUST-7).

### B7. Obsidian and AI models

- **Sides:** the Obsidian plugin against a model endpoint the person picked, local or remote.
- **Crosses:** the graph in scope, the question, and the key from Obsidian's secret store.
- **Trusted:** the person's yes, for one exact body, once. The model's answer is untrusted.
- **Controls:** AI is off until chosen. The endpoint must be https, or http on the device. The ceiling is checked, the
  highest class is never sent, and an unlabelled note counts as strictest. Credentials are refused. Data goes inside a
  fence the note cannot close (AI-3).
- **Code:** `packages/obsidian/src/ai/send.ts`, the one module that reaches the network.
- **Gaps:**
  - Shared schemas in the scope skip their own class (TRUST-13).
  - Answers are parsed loosely, and size and cost are not bounded (AI-4, AI-5).

### B8. Obsidian and outside data

- **Sides:** the Obsidian plugin against database files, graph sources and images.
- **Crosses:** rows from a database, and graphs drawn from other notes.
- **Trusted:** nothing. It is read only when the person asks.
- **Controls:** An import runs only on Import. The database is read only, in memory, and returns at most 10,000 rows.
  Sources go through the vault's own links and the read limits.
- **Code:** `packages/obsidian/src/databases/`, read on the person's command.
- **Gaps:**
  - The import has no size or time limit, and its values skip the note's class (TRUST-8).

### B9. Plug-ins and the host

- **Sides:** a plug-in against the core and its host.
- **Crosses:** the extension points the manifest names.
- **Trusted:** today, only plug-ins that ship with ThoughtKnot.
- **Controls:** A version check, named extension points only, frozen objects, and errors caught and named.
- **Code:** `packages/core/src/plugins.ts`.
- **Gaps:**
  - A plug-in runs with the host's full powers, and its time limit is not enforced (TRUST-14).
  - One version string covers every extension point (API-10, ARCH-12).

### B10. Joined graphs and the Python library

- **Sides:** notes, recipes and process files against the Python library.
- **Crosses:** front matter, fill recipes, SCXML files, and graphs drawn by Graphviz.
- **Trusted:** nothing. It is all data.
- **Controls:** YAML is read safely and guard expressions are no longer evaluated. Graphviz runs with no shell and a
  timeout. Labels are escaped.
- **Code:** `python/graph_spec/src/graph_svg.py`, with `fill.py`, `classification.py` and `scxml.py`.
- **Gaps:**
  - Fill recipes can read outside the folder and add query syntax (TRUST-6).
  - The Python class reader is looser than the core gate (TRUST-9).
  - SCXML is parsed with entity handling on (SEC-7).

### B11. GitHub and the CI and release pipeline

- **Sides:** pull requests, comments and other GitHub events against the workflows that hold tokens.
- **Crosses:** code to build, comments that wake an agent, and the files that are released.
- **Trusted:** code on `main`, and a tag on `main` that matches the manifest.
- **Controls:** No `pull_request_target`. Every action is pinned to a full SHA. Permissions are read only unless a job
  needs more. Credentials are not kept after checkout. Release tags must be on `main`. Releases are attested.
- **Code:** the workflows that hold a secret other than their own token: `.github/workflows/build-status.yml`,
  `.github/workflows/claude-review.yml`, `.github/workflows/nightly.yml`, `.github/workflows/project-mirror.yml`,
  `.github/workflows/release-check.yml`, `.github/workflows/release.yml`, `.github/workflows/risk-panel.yml`,
  `.github/workflows/security.yml` and `.github/workflows/working-group.yml`.
- **Gaps:**
  - The stable release builds and publishes in one job that holds the signing permissions (TRUST-3).
  - Any commenter can wake the working-group agent, which can write the script that checks it (TRUST-5).
  - Two personal tokens have unverified scope (SEC-8).
  - The nightly is not attested, and releases are not rebuilt and compared (SEC-5, SEC-6).
  - Security settings and Python dependencies are not checked in CI (SEC-2, SEC-10).

### B12. Scripts and the network

- **Sides:** the repository's scripts against OSV, NVD, GitHub and a local Chrome.
- **Crosses:** advisory lookups, project board writes and test pages.
- **Trusted:** fixed https addresses, and the person's or the workflow's GitHub sign-in.
- **Controls:** `gh` runs with no shell, checks the repository against origin, and never prints a token. Chrome is
  reached on 127.0.0.1 only.
- **Code:** `scripts/engine-version.mjs`, `scripts/github-project-gh.mjs` and `scripts/chrome.mjs`.
- **Gaps:**
  - None found that cross a trust line. Retries are a reliability matter.

## Boundaries still to come

Each of these adds a boundary. The pull request that builds it updates this page.

- **The mesh join** (Wave 9): joined graphs from peers. `spec_join_trust` keeps a trust level on each claim.
- **Permissions** (Wave 11): who may read and write each graph.
- **Sync and the peer network** (Wave 13): peers and their devices.
- **The web layer and corporate boundary** (Wave 14): servers and filtered snapshots.
- **New hosts:** the standalone app (Wave 7) and VS Code (Wave 8).
- **Outside data tables** (Wave 28): fetched data sets, under `data_set_access`.
