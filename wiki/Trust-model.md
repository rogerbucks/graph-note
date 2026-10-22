# Trust model

Who and what each part of ThoughtKnot trusts, and where that trust ends. Reviewed on 20 October 2026 against `main`,
at Roger's request, and again on 21 October for the work that waits on it. This is spec section 54, workstream TM1 in
Wave 6.

- **Why first:** Wave 6 builds the host, storage and plug-in contracts and graph-format security. They build on this.
- **What it found:** 12 boundaries. 16 new gaps went into the [risk register](https://github.com/rogerbucks/thoughtknot/blob/main/RISKS.md)
  as `TRUST-1` to `TRUST-16`. The gaps the expert panel found on 19 October are named too.
- **What it unblocks:** the [rules for the waiting work](#rules-for-the-waiting-work): trust on joined graphs, AI
  providers as plug-ins, and plug-in diagram types, graph sources and steps.
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
| plug-ins | Code that adds exporters and other extension points | Plug-ins that ship with ThoughtKnot, and in Obsidian, ones the person turns on. Each gets only what its manifest names. |
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
  - Claude could edit the matrix note or a note's class line, and so loosen its own gate. Fixed in #836 (TRUST-1).
  - MultiEdit and file tools from other servers were not hooked. Fixed in #836 (TRUST-2).
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
- **Trusted:** plug-ins that ship with ThoughtKnot. In Obsidian, a plug-in from outside runs once the person turns it
  on, apart in a worker.
- **Controls:** A version check, and only the extension points and host abilities the manifest names. Settings and
  secrets are the plug-in's own, kept apart from the others'. Objects are frozen. Errors are caught and named. A call
  over the time limit stops its plug-in.
- **Code:** `packages/core/src/plugins.ts`, with `plugin-points.ts`, `plugin-calls.ts`, `plugin-files.ts` and
  `plugin-sources.ts` and `plugin-ai.ts` beside it.
- **Gaps:**
  - A plug-in ran in the host's process, so it could reach the network whatever its manifest said. A call that never
    returned was not stopped. Fixed: a plug-in a host did not ship runs in a worker, and the host's clock stops it
    (TRUST-14).
  - The secrets ability gave the whole secret store, AI keys too. Fixed in this review: a plug-in now reads only
    secrets under its own id (TRUST-15).
  - The files ability reached every note, whatever its class. Fixed: it now goes through the note gate. A plug-in sees
    only notes at or below the ceiling the person set, and its changes wait for the person (TRUST-16).
  - One version string covered every extension point. Fixed: the interface and each point are major.minor, and a
    point that moves on refuses only the plug-ins that use it (API-10, ARCH-12).

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
  - Any commenter could wake the working-group agent, which could write the script that checks it. Fixed in #836
    (TRUST-5).
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

## Rules for the waiting work

Three pieces of work waited on this review. Each now has rules, written as requirements in spec section 54. A pull
request that builds one of them proves its rule and updates this page.

### Trust on joined graphs

For `spec_join_trust`. Built 22 Oct 2026 in the join of both graph-spec libraries (`trust.js`, `trust.py`). So the
mesh join (Wave 9) only has to name each peer's level. A join names each document's level as `trust`, and each prefix's
owner as `prefix_owners`. What only an untrusted document states comes back as a row marked flagged.

| Level | What it is | Counted? |
|---|---|---|
| own | A graph in the person's own notes | Yes |
| trusted | A source the person has marked trusted, by name | Yes |
| untrusted | Any other source, the default | No. It is shown, flagged, until a person accepts it. |

- **Kept on each claim.** A join already records the documents behind each value (`stated_in`). Each document now
  carries its source and level too. A value counts when at least one own or trusted document states it.
- **A clash is not a paradox yet.** An untrusted value that clashes with a trusted one is shown beside it, flagged. It
  becomes a paradox only once a person accepts the source.
- **Only a person accepts.** Accepting is one step, rolls back in one step and is recorded in provenance. An AI, a
  plug-in or a joined graph can never raise a level, not even its own.
- **Trust never rises on the way.** A graph made from others keeps the lowest level of what went into it, and the
  strictest class.
- **Id prefixes have owners.** An id prefix belongs to the source the person first accepted with it. A write under
  another source's prefix is refused, with the owner named.

### AI providers as plug-ins

For the AI provider extension point (`trust_ai_provider_bounded`). B7 stays the one way out.

- **What a provider does:** it turns the core's request into its service's shape, and reads the reply. Nothing else.
- **What the core keeps:** the gate, the ceiling, the fence and the credential check. The person sees the exact text
  the provider shaped, and their yes is bound to it.
- **What the host keeps:** the key and the send. The provider names where its key goes, such as a header, and the
  host puts it there. The provider never sees the key, the notes or the network.
- **The answer is still outside data.** The core checks what the provider read, as it checks any answer (AI-4).
- **Built.** `packages/core/src/plugin-ai.ts` holds the provider point, and `ai.ts` calls it. The test is
  `packages/core/test/plugins-ai.test.js`. A provider may not put the key in a header the host sets itself, such as
  `Host` or `Cookie`. The body it shapes is checked for credentials too.

### Plug-in diagram types

For the diagram type extension point (`trust_diagram_type_data`). A graph-spec rule comes first, so the Python library
keeps up.

- **What it gets:** the graph and the space to draw in. No host ability: no notes, secrets or settings.
- **What it gives back:** shapes as data, such as boxes, lines, text and where each goes. Never markup.
- **Who draws:** the core draws the shapes and escapes every label, as in B6. A label holding markup shows as text.
- **The graph-format rule.** Done: a style graph names a plug-in's type under its id, such as `acme.charts.sankey`.
  Where no plug-in draws it, the core and the Python library both draw a network, naming the plug-in
  (`plugin_diagram_type_named`).
- **Built.** `packages/core/src/plugin-diagrams.ts` holds the diagram type point. The test is
  `packages/core/test/plugins-diagrams.test.js`. The core checks every mark: its kind, its place in the space, and its
  label's length. It keeps only a mark's own fields and draws the SVG itself. A host that has the plug-in draws the
  type a style graph chooses; one that does not draws a network.

### Graph sources and graph steps

For the graph source and step extension points (`trust_source_joined`).

- **A source's graph is a joined graph.** It carries its source, starts untrusted and stops at the read limits
  (`spec_read_limits`). An unlabelled one counts as the strictest class, as an unlabelled note does.
- **A step changes a graph, nothing more.** What it gives back keeps the strictest class and the lowest trust of what
  went in.
- **Built.** `packages/core/src/plugin-sources.ts` holds each graph as a `JoinedGraph`. The test is
  `packages/core/test/plugins-sources.test.js`. A step is given only each graph's text and class, never where it came
  from. A source whose answer never comes is stopped when its plug-in runs apart, in a worker (TRUST-14).

### Before any outside plug-in loads

Before a host loads a plug-in it did not ship, these must be fixed:

- Plug-ins run apart from the host, in a worker, and one that runs too long is stopped (TRUST-14). Done in the core:
  `packages/core/src/plugin-isolated.ts` is the host's side and `packages/core/src/plugin-serve.ts` the worker's. The
  test is `packages/core/test/plugins-isolated.test.js`.
  - The worker loses the network before the plug-in's code runs. A host loads a plug-in it did not ship only this way.
  - `import()` cannot be taken away by name, so the host starts the worker under a content security policy that
    allows no network.
  - Each call is timed by the host's clock, so one that loops or never answers stops its plug-in.
  - Panels, data exports and AI providers cannot run apart yet: a panel needs the page, and the other two answer at
    once.
- The files ability goes through the note gate (TRUST-16). Done.
- Each extension point has its own version (API-10). Done in the core: `packages/core/src/plugin-versions.ts`. A
  sample plug-in outside the packages runs in a worker in CI and passes each contract.
- A host loads an outside plug-in from one file that imports nothing (API-10). Done in the core:
  `packages/core/src/plugin-outside.ts`. A file that holds the word `import` never starts a worker. The worker's own
  start takes away the network and every way to make code from text, and only then does the file run.
- Obsidian loads one this way (`packages/obsidian/src/outside/outside-plugins.ts`). It comes from the vault folder
  `ThoughtKnot plug-ins`, or from a link fetched once, when the person presses Add
  (`packages/obsidian/src/outside/outside-link.ts`). Each stays off until the person turns it on, and turns off
  again if its file changes. Its commands join Obsidian's, and a block written `· FROM sample:trip` draws a graph
  from its source. That graph is outside data, held as a joined graph (trust_source_joined).
- A step block can name a plug-in's step. What it gives back is held the same way. Then it is offered as a proposal
  for a person to accept.
- The browser page runs only the plug-ins turned on in Obsidian (`packages/claude-code/server/page-plugins.ts`). It
  turns none on. Its server reads which are on from Obsidian's settings in the vault, and serves a file only while its
  SHA-256 is the one turned on. Each is served sealed, under a policy that allows no connection, so the browser keeps
  it off the network too. A diagram type one adds draws the note's graph there as an image that runs nothing.

## Boundaries still to come

Each of these adds a boundary. The pull request that builds it updates this page.

- **The mesh join** (Wave 9): joined graphs from peers. `spec_join_trust` keeps a trust level on each claim.
- **Permissions** (Wave 11): who may read and write each graph.
- **Sync and the peer network** (Wave 13): peers and their devices.
- **The web layer and corporate boundary** (Wave 14): servers and filtered snapshots.
- **New hosts:** the standalone app (Wave 7) and VS Code (Wave 8).
- **Outside data tables** (Wave 28): fetched data sets, under `data_set_access`.
