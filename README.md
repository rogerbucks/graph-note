# Graph Note

An Obsidian plugin that draws the graphs written in notes, and lets them be edited beside the note — by typing, or by tapping and dragging the drawing. It works on desktop and mobile, offline.

**Status: in development.** Not yet in the community plugin directory. It is built in nine slices: slices 1 to 3 are done, and slice 4 is in progress.

## What is here

- `packages/obsidian` — the plugin.
- `packages/graph-spec` — the graph format library in plain JavaScript: reader, rules, completeness, joins and views. One file with no dependencies, loadable by a web page or by Node.
- `python/graph_spec` — the same library in Python, plus the Graphviz drawing and the Grafeo-backed checks. Its answers are tested against the JavaScript library on every shared case.
- Each release also carries both libraries as one archive, `graph-spec-libraries-<version>.tar.gz`. Every asset is listed with its SHA-256 in `SHA256SUMS`.
- `manifest.json`, `versions.json`, `styles.css` — the files the plugin store reads. `main.js` is built by CI from a tag and attached to each release; it is never committed.

## How the packages fit

Each layer uses only the one beneath it, so a new host (a VS Code extension, a desktop app) reuses everything below the
hosts unchanged.

```
  hosts       packages/obsidian      packages/claude-code
                     \                      /
  core                 packages/core          host-free: reading, drawing, edits, undo
                            |
  format      packages/graph-spec   <=>   python/graph_spec
              (JavaScript)   held to the same answers   (Python)
```

- `packages/graph-spec` — the graph format: reads GQL blocks and runs the spec's rules, with no dependencies. Guide:
  [packages/graph-spec/GUIDE.md](packages/graph-spec/GUIDE.md).
- `python/graph_spec` — the same format in Python, function for function, with the Graphviz drawing and the
  Grafeo-backed checks; parity tests hold the two to the same answers. Guide:
  [python/graph_spec/GUIDE.md](python/graph_spec/GUIDE.md).
- `packages/core` — the host-free editor core on top of graph-spec: what to draw, problems and their fixes, zoom, edits
  and undo. It imports no Obsidian, editor or Node module, so it runs on a phone too. Guide:
  [packages/core/GUIDE.md](packages/core/GUIDE.md).
- `packages/obsidian` — the Obsidian plugin: puts the core's drawings and edits on Obsidian's page. Guide:
  [packages/obsidian/GUIDE.md](packages/obsidian/GUIDE.md).
- `packages/claude-code` — the Claude Code host: a mod whose `/graph <note>` draws a note's graph in a pane, and a
  browser editor served locally, on the same core. Guide: [packages/claude-code/GUIDE.md](packages/claude-code/GUIDE.md).

## Privacy and network use

The plugin makes no network request of its own: no analytics, no update checks, no remote images, no databases. Graphviz, the one runtime dependency, is bundled and runs on your device.

**The one exception: AI models you set up.** The plugin can ask an AI model to propose changes to a graph, and sends content only to AI models you have set up yourself, by their address, and only when you send it. AI is off until you turn it on (Use AI models, in the plugin's settings) and set up a model. Then, for each send:

- **You choose what is sent:** the whole graph, one of its views, or the things you tick. It is written out as GQL: each thing with its kinds and properties, and the links between them, with your question and the instructions that ask for changes. Nothing else of the vault goes: not the note's other text, not another graph, not a comment.
- **You see exactly what will be sent, and to which model and address, before it goes,** and nothing goes until you press Send. Nothing is ever sent in the background.
- **Each model has a ceiling,** the highest classification of note it may be sent, set by you. A note above it is not sent to that model, and a note at the highest classification you have set is never sent to any model. A note with no classification counts as the most sensitive level, so by default it is sent to no model: give it a classification, or choose a lower level for such notes under Unlabelled notes count as, in the plugin's settings.
- **Credentials are looked for by common patterns,** such as a password or secret property, an API key, an access key, a token, a private key, a card number, or the key of any model you set up. What matches is never sent. These are patterns, not a guarantee: keep secrets out of notes you send.
- **A key stays in Obsidian's own secret store,** never in the vault, the plugin's settings, a note or a log. A model on another machine is reached over https only, and a model's address may hold no user name, password or query string.
- **The answer comes back as a proposal,** written into the note as a change set beside the graph, and each change is accepted or rejected by you. An AI never writes to the graph.
- **Every send is recorded** in the plugin's own data, without the text sent: a SHA-256 digest of it, its size, what kind of choice it was and how many things and links, the model's name and address, the time, and what came of it. The last 200 sends are kept; the command "Clear the record of sends to AI models" clears them.

Requests go straight from your device to the address you gave, with Obsidian's own request function: there is no server of this plugin's in between, and no AI vendor's library inside it. Obsidian follows redirects; point a model only at an address you trust. Obsidian also adds headers of its own to each request, beyond those shown before you send.

## Developing

Requires Node 24 or later. How the code is written — the conventions, and how each is checked — is in [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
npm ci
git config core.hooksPath .githooks
npm test
npm run typecheck
npm run lint
npm run build
```

The second line installs the pre-commit check, which refuses any staged file that looks confidential or personal: a classification other than Public in a note's frontmatter, a note's uuid line, an absolute home-folder path, a personal email address, a phone number or a card number. CI runs the same check over every file, so a commit that skipped the hook is still caught.

These steps are all a fresh clone needs. CI runs them, exactly as written here, in a fresh clone on every pull request and before every release, so setting up never depends on anything from a maintainer's machine.

This is a one-person project and takes no outside contributions: pull requests and issues can be opened by collaborators only, and each pull request's conversation is locked when it opens.

### Testing in Obsidian, on desktop and phone

The plugin is tested from installed files, not from the plugin store: `npm run build` (once) or `npm run dev` (on every save) writes `main.js`, and with `manifest.json` and `styles.css` at the repository root these are the three files a test vault installs into `.obsidian/plugins/graph-note/`: `node scripts/reset-test-vault.mjs` copies them in as real files, and Obsidian Sync carries them to a phone when it syncs installed community plugins. A new build reaches the vault only when that reset is run again. Reload the plugin in Obsidian after each build. Releases are still built only by CI, from a tag.

To look at the drawing and try its controls in an ordinary browser first, `node packages/obsidian/harness/build.mjs <folder>` builds a page that draws a sample note with the real plugin and a small stand-in for Obsidian; serve the folder and open it.

The Python library has its own pinned environment (uv, Python 3.14):

```sh
cd python/graph_spec
uv sync --locked
uv run --locked python -m unittest discover -s tests
```

A host that uses the Python library sets `graph_spec.CLASSIFICATION_NOTE`, `graph_spec.OWNER_ENGINE` and `graph_spec.WRITTEN_BY` after importing it; the defaults name no machine or person, and no classification note is read until one is set.

### Supply chain

- **Exact pins.** Every dependency is pinned to an exact version, the lockfile is committed, and installs use `npm ci`.
- **No install scripts.** `.npmrc` sets `ignore-scripts=true`.
- **Verified.** CI runs `npm audit signatures` before every build.
- **Slow to adopt, quick to patch.** Dependabot proposes version updates weekly, after a seven-day cooldown; security updates are raised at once.
- **Pinned actions.** Every GitHub Action is pinned to a full commit hash, and CI runs with read-only permissions. Only the release job may write.
- **Built by CI.** Releases are built from a version tag (no `v` prefix), with `SHA256SUMS` for every asset, and a build provenance attestation once the repository is public: GitHub keeps attestations only for public repositories owned by a person.
- **Fit to be public, checked every time.** `scripts/public-readiness.mjs` runs in CI and before every release: no secret and nothing confidential or personal in any commit of the checked-out history (every branch and tag, before the repository is made public), every commit from a no-reply address, and a fresh clone set up from the steps above alone. The repository's settings on GitHub are held to the same script (`--settings`): collaborators only may open pull requests (and issues, a setting with no API that is set by hand), every action pinned, a read-only token, a fork's workflows run only once approved, secret scanning with push protection, Dependabot alerts and fixes, and CodeQL.
- **Dependencies reviewed, advisories re-read.** Every pull request's dependency changes are read against the published advisories, and the Graphviz inside the engine is checked against them weekly.
- **No test framework.** Tests use the runner built into Node.

## Licence

MIT — see [LICENSE](LICENSE). The layout engine, `@viz-js/viz`, compiles Graphviz (Eclipse Public License 2.0) into WebAssembly; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which ships with every release.
