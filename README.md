# ThoughtKnot

ThoughtKnot turns what you know into a map you can see, change and share. You write things and the links between them
as plain text, and it draws them. You can edit a graph by typing or by dragging the drawing.

It is one product with several ways in. The Obsidian plugin works now, on desktop and phone, offline. A standalone app,
a VS Code plugin and a JavaScript library come next.

<!-- readme:status -->
**Status: in development.** It is not in the community plugin directory yet. It is built in ten slices. Slices 1 to 4 are done, and slice 5 is in progress.
<!-- /readme:status -->

## At a glance

| You want to | Go to |
|---|---|
| Use it | [How to use ThoughtKnot](https://github.com/rogerbucks/thoughtknot/wiki/How-to-use-ThoughtKnot) |
| Know what it sends, and when | [Privacy and network use](#privacy-and-network-use) |
| Build it or change it | [Developing](#developing) and [CONTRIBUTING.md](CONTRIBUTING.md) |
| See how it fits together | [How the packages fit](#how-the-packages-fit) |

## What is here

- `packages/obsidian`: the plugin.
- `packages/graph-spec`: the graph format library in plain JavaScript. It reads graphs, checks their rules and answers
  questions about them. It is one file with no dependencies, so a web page or Node can load it.
- `python/graph_spec`: the same library in Python. It also draws with Graphviz and runs extra checks with Grafeo. Its
  answers are tested against the JavaScript library on every shared case.
- Each release carries both libraries as one archive, `graph-spec-libraries-<version>.tar.gz`. `SHA256SUMS` lists every
  file in the release with its SHA-256.
- `manifest.json`, `versions.json` and `styles.css`: the files the plugin store reads. CI builds `main.js` from a tag
  and attaches it to each release. It is never committed.

## How the packages fit

Each layer uses only the one below it. So a new host, such as a VS Code extension or a desktop app, reuses everything
below the hosts as it is.

```
  hosts       packages/obsidian      packages/claude-code  <-  packages/app, packages/vscode
                     \                      /
  core                 packages/core          host-free: reading, drawing, edits, undo
                            |
  format      packages/graph-spec   <=>   python/graph_spec
              (JavaScript)   held to the same answers   (Python)
```

- `packages/graph-spec`: the graph format. It reads GQL blocks and runs the spec's rules, with no dependencies. Guide:
  [packages/graph-spec/GUIDE.md](packages/graph-spec/GUIDE.md).
- `python/graph_spec`: the same format in Python, function for function. It adds the Graphviz drawing and the Grafeo
  checks. Shared tests hold the two to the same answers. Guide: [python/graph_spec/GUIDE.md](python/graph_spec/GUIDE.md).
- `packages/core`: the editor core, on top of graph-spec. It works out what to draw, the problems and their fixes, zoom,
  edits and undo. It uses no Obsidian, editor or Node module, so it runs on a phone too. Guide:
  [packages/core/GUIDE.md](packages/core/GUIDE.md).
- `packages/obsidian`: the Obsidian plugin. It puts the core's drawings and edits on Obsidian's page. Guide:
  [packages/obsidian/GUIDE.md](packages/obsidian/GUIDE.md).
- `packages/claude-code`: the Claude Code host. Its `/graph <note>` command draws a note's graph in a pane. It also
  serves a browser editor on your own machine, on the same core. Guide:
  [packages/claude-code/GUIDE.md](packages/claude-code/GUIDE.md).
- `packages/app`: the desktop app, for macOS, Windows and Linux. It runs the browser editor in a Tauri window, over a
  plain folder of notes, offline, with no server inside. Guide: [packages/app/GUIDE.md](packages/app/GUIDE.md).
- `packages/vscode`: the VS Code extension. It runs the browser editor in a VS Code tab beside a Markdown note, over
  the note's workspace folder. Guide: [packages/vscode/GUIDE.md](packages/vscode/GUIDE.md).

## Privacy and network use

The short version for every app is the [privacy page](https://thoughtknot.app/privacy.html). It says what is kept, where, for how long, and how to delete it.

The short version, for the plugin, the app and the browser editor, is the [privacy page](https://thoughtknot.app/privacy.html).

The plugin makes no network request of its own. There are no analytics, no update checks, no remote images and no
databases. Graphviz, the one runtime dependency, is bundled and runs on your device.

**The one exception: AI models you set up.** The plugin can ask an AI model to propose changes to a graph. It sends
content only to AI models you have set up yourself, and only when you send it. AI is off until you turn it on (Use AI
models, in the plugin's settings) and set up a model.

**Where your text ends up.** A model at a remote address receives the text you are shown. It keeps it under its
provider’s own terms and retention, so it leaves your control once sent. A model at localhost runs on your device, so the text stays on your
device.

### What happens on each send


- **You choose what is sent.** It can be the whole graph, one of its views, or the things you tick. It goes as GQL: each
  thing with its kinds and properties, the links between them, your question and the instructions. Nothing else from the
  vault goes: not the note's other text, not another graph, not a comment.
- **You see what will be sent before it goes.** You also see which model and address it goes to. Nothing goes until you
  press Send, and nothing is ever sent in the background.
- **Each model has a ceiling.** This is the highest classification of note it may be sent, and you set it. A note above
  the ceiling is not sent to that model. A note at your highest classification is never sent to any model.
- **A note with no classification counts as the most sensitive level.** So by default it goes to no model. To change
  that, give the note a classification. Or choose a lower level under Unlabelled notes count as, in the settings.
- **Credentials are looked for by common patterns.** These include a password or secret property, an API key, an access
  key and a token. They also include a private key, a card number and the key of any model you set up. What matches is never sent. These are
  patterns, not a promise, so keep secrets out of notes you send.
- **A key stays in Obsidian's own secret store.** It is never in the vault, the plugin's settings, a note or a log. A
  model on another machine is reached over https only. A model's address may hold no user name, password or query.
- **The answer comes back as a proposal.** It is written into the note as a change set beside the graph. You accept or
  reject each change. An AI never writes to the graph.
- **Every send is recorded** in the plugin's own data, without the text sent. The record keeps a SHA-256 digest of the
  text, its size, the kind of choice and how many things and links. It also keeps the model's name and address, the time
  and the result.
  The last 200 sends are kept. The command "Clear the record of sends to AI models" clears them.

### Where requests go

Requests go straight from your device to the address you gave, through Obsidian's own request function. There is no
server of ours in between, and no AI vendor's library inside the plugin.

Obsidian follows redirects; point a model only at an address you trust. Obsidian also adds headers of its own to each
request, beyond those shown before you send.

## Developing

You need Node 24 or later. [CONTRIBUTING.md](CONTRIBUTING.md) says how the code is written and how each rule is
checked.

```sh
npm ci
git config core.hooksPath .githooks
npm test
npm run typecheck
npm run lint
npm run build
```

The second line turns on the pre-commit check. It refuses any staged file that looks confidential or personal:

- a classification other than Public in a note's frontmatter, or a note's uuid line;
- a path into a home folder;
- a personal email address, a phone number or a card number.

CI runs the same check over every file, so a commit that skipped the hook is still caught.

A fresh clone needs only these steps. CI runs them exactly as written here, in a fresh clone:

- on every merge to main;
- before every release;
- on every pull request that changes them or what they install.

So setting up never depends on a maintainer's machine.

Only collaborators can open pull requests and issues for now, and each pull request's conversation is locked when it
opens. Ideas and questions are welcome in [GitHub Discussions](https://github.com/rogerbucks/thoughtknot/discussions).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to ask to join.

### Testing in Obsidian, on desktop and phone

The plugin is tested from installed files, not from the plugin store.

1. `npm run build` writes `main.js` once. `npm run dev` writes it on every save.
2. `node scripts/reset-test-vault.mjs` copies `main.js`, `manifest.json` and `styles.css` into the test vault's
   `.obsidian/plugins/thoughtknot/`, as real files.
3. Reload the plugin in Obsidian.

Obsidian Sync carries the files to a phone when it syncs installed community plugins. A new build reaches the vault only
when you run the reset again. Releases are still built only by CI, from a tag.

To try the drawing in an ordinary browser first, run `node packages/obsidian/harness/build.mjs <folder>`. It builds a
page that draws a sample note with the real plugin and a small stand-in for Obsidian. Serve the folder and open it.

The Python library has its own pinned setup (uv, Python 3.14):

```sh
cd python/graph_spec
uv sync --locked
uv run --locked python -m unittest discover -s tests
```

A host that uses the Python library sets three values after importing it: `graph_spec.CLASSIFICATION_NOTE`,
`graph_spec.OWNER_ENGINE` and `graph_spec.WRITTEN_BY`. The defaults name no machine or person. No classification note is
read until one is set.

### Supply chain

- **Exact pins.** Every dependency is pinned to an exact version. The lockfile is committed, and installs use `npm ci`.
- **No install scripts.** `.npmrc` sets `ignore-scripts=true`.
- **Verified.** CI runs `npm audit signatures` before every build.
- **Slow to adopt, quick to patch.** Dependabot proposes version updates each week, after a seven-day wait. Security
  updates come at once.
- **Pinned actions.** Every GitHub Action is pinned to a full commit hash. CI runs with read-only permissions, and only
  the release job may write.
- **Built by CI.** Releases are built from a version tag, with no `v` in front. Each has `SHA256SUMS` for every file.
  Once the repository is public, each also gets a build provenance attestation. GitHub keeps those only for public
  repositories owned by a person.
- **Fit to be public, checked every time.** `scripts/public-readiness.mjs` runs in CI and before every release. It
  checks every branch and tag for secrets and for anything confidential or personal. It checks that every commit comes
  from a no-reply address. It also sets up a fresh clone from the steps above alone.
- **GitHub settings checked too.** The same script (`--settings`) checks the repository's settings. Collaborators only
  may open pull requests and issues. Every action is pinned and the token is read-only. A fork's workflows run only once
  approved. Secret scanning with push protection, Dependabot alerts and fixes, and CodeQL are on.
- **Dependencies reviewed, advisories re-read.** Each pull request's dependency changes are checked against published
  advisories. The Graphviz inside the engine is checked against them each week.
- **No test framework.** Tests use the runner built into Node.

## Versions

ThoughtKnot uses [semantic versions](https://semver.org), with one catch before 1.0.0. Then a step in the leftmost
part that is not 0 may change or remove what the library exports. So 0.7 to 0.8 may break your code. A patch step, such
as 0.8.0 to 0.8.1, never does. Each release's notes have a "Library changes" section. It lists what was added, changed
or removed.

## Licence

Mozilla Public License 2.0 (MPL-2.0). See [LICENSE](LICENSE).

- Anyone may use, fork and change the code.
- A changed file stays under the same licence, so its changes stay open.
- The code may still sit inside a larger work under other terms.
- Releases before this change stay MIT.

The graph spec's own text is under CC-BY-4.0, so anyone may build on the format if they credit it. See
[LICENSE-SPEC.md](LICENSE-SPEC.md) for the files it covers.

The layout engine, `@viz-js/viz`, compiles Graphviz (Eclipse Public License 2.0) into WebAssembly. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which ships with every release.
