# Graph Note

An Obsidian plugin that draws the graphs written in notes, and lets them be edited beside the note — by typing, or by tapping and dragging the drawing. It works on desktop and mobile, offline.

**Status: in development.** Not yet in the community plugin directory. It is built in three slices; this repository holds the scaffolding for the first.

## What is here

- `packages/obsidian` — the plugin.
- `packages/graph-spec` — the graph format library in plain JavaScript: reader, rules, completeness, joins and views. One file with no dependencies, loadable by a web page or by Node.
- `python/graph_spec` — the same library in Python, plus the Graphviz drawing and the Grafeo-backed checks. Its answers are tested against the JavaScript library on every shared case.
- Each release also carries both libraries as one archive, `graph-spec-libraries-<version>.tar.gz`. Every asset is listed with its SHA-256 in `SHA256SUMS`.
- `manifest.json`, `versions.json`, `styles.css` — the files the plugin store reads. `main.js` is built by CI from a tag and attached to each release; it is never committed.

## Privacy and network use

The plugin makes no network requests. A later version will be able to send content to an AI model, and only to a model the user has set up, only when the user sends it. This section will say exactly what is sent when that arrives.

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
- **Fit to be public, checked every time.** `scripts/public-readiness.mjs` runs in CI and before every release: no secret and nothing confidential or personal in any commit of any branch, every commit from a no-reply address, and a fresh clone set up from the steps above alone. The repository's settings on GitHub are held to the same script (`--settings`): collaborators only may open pull requests (and issues, a setting with no API that is set by hand), every action pinned, a read-only token, a fork's workflows run only once approved, secret scanning with push protection, Dependabot alerts and fixes, and CodeQL.
- **Dependencies reviewed, advisories re-read.** Every pull request's dependency changes are read against the published advisories, and the Graphviz inside the engine is checked against them weekly.
- **No test framework.** Tests use the runner built into Node.

## Licence

MIT — see [LICENSE](LICENSE). The layout engine, `@viz-js/viz`, compiles Graphviz (Eclipse Public License 2.0) into WebAssembly; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which ships with every release.
