# Known risks

What the expert panel found, and what was decided. The release waits on this list: see RELEASING.md.
Made by `node scripts/risk-register.mjs --write-report` from `quality/risks.json`. Do not edit by hand.

Dots show likelihood and impact: ●●● high, ●●○ medium, ●○○ low.

## Open (90)

| Id | Risk | Likely | Impact | Decision | Effort |
| --- | --- | --- | --- | --- | --- |
| SEC-2 | SECURITY.md promises rest on settings nothing in CI checks | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| SEC-3 | Claude's data-folder guard admits a bypass by shell paths | ●○○ | ●●● | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| SEC-4 | Session token drawn in a pane Claude may read | ●○○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| SEC-5 | Nightly pre-release is not attested | ●○○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| SEC-6 | Store assets are never rebuilt and compared | ●○○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| SEC-7 | SCXML parsed with lxml's default entity handling | ●○○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| SEC-8 | Two personal tokens live in workflows with unverified scope | ●○○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| SEC-9 | Export accepts any text under an .svg name | ●○○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| SEC-10 | No advisory audit for the Python dependencies in CI | ●○○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-5 | The release waits on live OSV and NVD, with no retry | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-6 | Failures of nightly, wiki, Pages and advisories are silent | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-7 | Timed workflows pause and tokens expire without notice | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-8 | Repository settings are not exported; only required checks are held | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | days |
| OPS-9 | Docker base, uv and Node pins are never bumped; no SBOM | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-10 | A runner change or one flaky test blocks the release | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-11 | Wiki and Pages depend on Chrome being on the runner image | ●○○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| OPS-12 | Docs disagree with the workflows on schedules and write access | ●●● | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| CODE-1 | The graph-spec library is not type-checked at all | ●●○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| CODE-2 | merge3, 306 untyped lines, is proved by one snapshot case | ●●○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| CODE-3 | Coverage is measured for the core only, and only at release | ●●● | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| CODE-4 | The Claude Code mod is outside typecheck, lint and CI | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| CODE-5 | No test runs vault.process with a real interleaving | ●○○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| CODE-6 | 77 fixed sleeps remain in 26 plugin test files | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | days |
| CODE-7 | 139 of 249 core modules have no test named after them | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | weeks |
| CODE-8 | Reader parity rests on a small, snapshot-shaped case set | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| CODE-9 | 28 functions over 100 lines; the 400-line cap is on files | ●●○ | ●○○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| CODE-10 | Live Preview hands a hand-made context to the block renderer | ●○○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | hours |
| CODE-11 | A running layout is never cancelled when the user keeps typing | ●●○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| CODE-12 | The server keeps no copy of the note it overwrites | ●○○ | ●●○ | fix-later (Roger’s held changes, after all waves) | hours |
| ARCH-1 | Host contract covers display only; files and settings copied per host | ●●● | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | weeks |
| ARCH-2 | Storage interface exists only as EditorNote, with no contract suite | ●●● | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | weeks |
| ARCH-3 | Layering is not held across packages; hosts reach into core internals | ●●● | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| ARCH-5 | Two hand-kept parsers, no grammar; drift caught only on listed cases | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| ARCH-6 | Identity is the visible name; no stable id survives a rename | ●●○ | ●●● | fix-later (Wave 9 · Slice 6 the mesh) | weeks |
| ARCH-7 | Whole-note text is the only store; nothing indexes across notes | ●●○ | ●●○ | fix-later (Wave 13 · Slice 9 store, sync and network) | weeks |
| ARCH-8 | Exports read back only by test helpers; no product import | ●●○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| ARCH-9 | The JavaScript library is private TypeScript sources in an archive | ●●● | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| ARCH-10 | Three decisions that cost most if left after their wave | ●●● | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | weeks |
| UX-2 | Half the manual walk-through could run on the existing Chrome harness | ●●● | ●●○ | fix-later (Wave 5 · Automated quality and releases) | days |
| UX-3 | Many user-facing sentences bypass the word catalogue and its checks | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-4 | No busy state while a layout runs, and a silent stop after failures | ●●○ | ●●● | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-5 | A drag on the card writes outside the note's editor undo path | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| UX-7 | Landing page and guide state no system requirements or AI data flow | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| UX-8 | First-run syntax help is only in the wiki, not in the app | ●●○ | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-9 | Focus on a drawing box is a thicker stroke, measured by nobody | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| UX-10 | Design screenshots show the old 'Graph Note' brand and version | ●●● | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| NEURO-1 | No vault-wide list of graphs, cross-note links or one-shot backup | ●●● | ●●● | fix-later (Wave 13 · Slice 9 store, sync and network) | days |
| NEURO-2 | Changes and history view exist only in the browser editor | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-3 | Ten icon-only toolbar buttons, no visible tooltip, nothing can be hidden | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-5 | Colour-never-alone rule has no test, yet ethos says it is checked | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | days |
| NEURO-6 | Every notice vanishes after five seconds and cannot be read again | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-7 | Drawing redraws 250 ms after typing; picture may jump | ●●○ | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-8 | No two-minute first success: no insert-example command | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-9 | No reading options: letter spacing, line height or font | ●●○ | ●○○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-11 | No recently edited or recently visited list | ●●○ | ●○○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| FLOW-4 | A one-line fix pays eleven gates and may touch four records | ●●● | ●●○ | fix-later (Wave 5 · Automated quality and releases) | days |
| FLOW-5 | A requirement's text can be rewritten to fit the code | ●●○ | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| FLOW-6 | Store submission is last, with no CI step for its checklist | ●●○ | ●●● | fix-later (Wave 15 · Obsidian community release) | days |
| FLOW-9 | No per-file MPL notice, and no test holds that choice | ●●○ | ●○○ | fix-later (Wave 15 · Obsidian community release) | hours |
| FLOW-10 | Issue templates and conduct contact point at closed doors | ●●○ | ●○○ | fix-later (Wave 15 · Obsidian community release) | hours |
| FLOW-11 | Decisions live in two places with different forms | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| FLOW-12 | Third-party notices depend on a hand-kept record | ●○○ | ●●○ | fix-later (Roger’s held changes, after all waves) | hours |
| API-1 | Half the shipped graph-spec exports sit outside the break check | ●●○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-2 | Core is guarded as a library but never shipped as one | ●●● | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-4 | Local server has two error formats and no shared schema | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-6 | Python library is loose files, not an installable package | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-7 | Python public surface is everything, private names included | ●●○ | ●○○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-8 | graph-spec is CommonJS-only with a partial d.ts and mixed errors | ●●○ | ●○○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| API-9 | AI transport is hard-wired to the OpenAI chat shape | ●●● | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| API-11 | Schema @1 is a name suffix, not a version negotiation | ●○○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| AI-2 | Classification gate guards the pane only, not Claude's own reads | ●●● | ●●● | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-4 | Answers are free text parsed by brace slicing, not structured output | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-5 | No cost ceiling, token cap, usage record or prompt caching | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-6 | No eval set: a model change cannot be judged safe | ●●● | ●●○ | fix-later (Wave 24 · Held: text to graph with AI) | days |
| AI-7 | Only the chat-completions wire shape; Anthropic Messages API unreachable | ●●● | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-8 | No MCP server or SKILL.md exposes the graph format | ●●● | ●●○ | fix-later (Wave 28 · Held: Claude presents and decides in Claude Code) | weeks |
| AI-9 | Planned AI waves are ordered against value and risk | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| AI-10 | Text to graph has no quality measure in its plan | ●●● | ●●○ | fix-later (Wave 24 · Held: text to graph with AI) | days |
| TRUST-3 | The stable release builds and publishes in one job | ●○○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | hours |
| TRUST-4 | GitHub titles and messages reach Claude's pane unfenced | ●●○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| TRUST-6 | Python fill recipes read outside the folder and inject into the query | ●○○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | hours |
| TRUST-7 | Nothing cleans the drawing before it enters the page | ●○○ | ●●● | fix-later (Wave 6 · Host, storage and plug-in contracts) | days |
| TRUST-8 | A database import has no size or time limit | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| TRUST-9 | The Python class reader is looser than the core gate | ●○○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | hours |
| TRUST-10 | git log still reads the repository's own settings | ●○○ | ●●○ | fix-later (Wave 6 · Host, storage and plug-in contracts) | hours |
| TRUST-11 | /graph checks the note, then reads it again to draw | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| TRUST-12 | The gate settings and the confirmed digest travel in the environment | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| TRUST-13 | Shared schemas sent to an AI skip their own class | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| LEGAL-3 | The iPhone app's encryption has no export answer yet | ●●○ | ●●● | fix-later (Wave 14 · Slice 9 web, corporate and iOS) | days |
| SEC-17 | The desktop app's signing keys sit in the build step on main | ●○○ | ●●● | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |

## Each open risk

### SEC-2 SECURITY.md promises rest on settings nothing in CI checks

**Who found it:** Senior security engineer. **Where:** `.github/workflows/release.yml`, `.github/workflows/release-check.yml`, `scripts/public-readiness.mjs`, `SECURITY.md`.

**Risk:** SECURITY.md says CodeQL runs on each pull request and secret push protection blocks leaks. Both are GitHub settings with no workflow in the repository. The script that checks them (--settings) runs only by hand, so the promises can silently stop being true after the repository went public.

**Fix:** Run `public-readiness.mjs --settings` in release.yml and in a weekly job. Use a token that can read repository security settings. Fail the run when any wanted setting differs.

**Check:** That job itself; release-check.yml runs it too so a drift is seen before the tag.

### SEC-3 Claude's data-folder guard admits a bypass by shell paths

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/src/data-guard.ts`, `packages/claude-code/src/editor-launch.ts`, `packages/core/src/claude-gate.ts`.

**Risk:** settings.json in the mod's data folder sets Claude's own classification ceiling. The guard says it cannot see a path the shell builds (cd then a bare name, or an unlisted variable). A prompt-injected session could loosen its own gate and then open a note classified above it.

**Fix:** Record the digest of settings.json when the session starts. Have the gate refuse to open any note when the file's digest has changed during the session, until the person confirms.

**Check:** A test in packages/claude-code/test that rewrites settings.json mid-session and asserts the next /graph edit is refused.

### SEC-4 Session token drawn in a pane Claude may read

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/src/editor-launch.ts`, `packages/claude-code/src/graph-view.ts`, `packages/claude-code/src/editor-words.ts`.

**Risk:** The page address with the session token is handed to the Graph editor pane to draw, and the spec says Claude can read that pane. With the token, Claude could PUT the note directly and skip the proposal-only route the person is meant to accept.

**Fix:** Have the mod open the browser itself, or draw a button whose target is held outside pane text. Then the token never appears in any text Claude can read.

**Check:** A test asserts no pane text and no transcript line ever contains `token=`.

### SEC-5 Nightly pre-release is not attested

**Who found it:** Senior security engineer. **Where:** `.github/workflows/nightly.yml`.

**Risk:** The stable release carries a build provenance attestation, but the nightly only ships a SHA256SUMS made by the same job. A BRAT user following nightlies cannot tell a genuine build from a tampered one.

**Fix:** Add the same attest-build-provenance step (with id-token and attestations write) to the nightly build job for main.js, manifest.json and styles.css.

**Check:** A workflow test (as test/build-status-run.test.js does for its script) asserts nightly.yml names the attest action.

### SEC-6 Store assets are never rebuilt and compared

**Who found it:** Senior security engineer. **Where:** `.github/workflows/release.yml`, `.github/workflows/release-check.yml`, `RELEASING.md`.

**Risk:** Nothing builds main.js twice or rebuilds a tag and diffs it against the released file. A reviewer or user cannot confirm the Obsidian store asset matches the source, and a non-deterministic build would go unnoticed.

**Fix:** In release-check.yml build twice in separate clean checkouts and fail when the sha256 of main.js, styles.css or the tarball differs.

**Check:** That release-check step, and a documented `npm run build && sha256sum main.js` line in RELEASING.md for anyone to repeat.

### SEC-7 SCXML parsed with lxml's default entity handling

**Who found it:** Senior security engineer. **Where:** `python/graph_spec/src/graphspec/engine/process/scxml.py`.

**Risk:** The library parses SCXML text with etree.fromstring and no parser settings. A crafted file with an external entity can read a local file into the document. Only someone handed an untrusted SCXML file is exposed.

**Fix:** Parse with `etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)` in both places.

**Check:** A unit test parses a document with an external entity and asserts the entity is not expanded; ruff rule S320 flags a bare lxml parse.

### SEC-8 Two personal tokens live in workflows with unverified scope

**Who found it:** Senior security engineer. **Where:** `.github/workflows/build-status.yml`, `.github/workflows/project-mirror.yml`, `.github/workflows/claude-review.yml`, `RELEASING.md`.

**Risk:** PROJECT_TOKEN and CLAUDE_CODE_OAUTH_TOKEN are the maintainer's own tokens, used by jobs with issues or pull-requests write. Their scopes, expiry and rotation are not recorded anywhere in the repository. A leak through a future action change would not be bounded by design.

**Fix:** Make PROJECT_TOKEN a fine-grained token limited to the project and this repository, with an expiry. Note each secret's scope, owner and renewal date in RELEASING.md.

**Check:** manual

### SEC-9 Export accepts any text under an .svg name

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/server/export-api.ts`.

**Risk:** The export route checks a PNG's bytes but writes any text given as .svg, .md, .csv or .graphml. If the page were ever compromised, it could drop an SVG with a script into the vault, which runs when opened in a browser. The panel proposes accepting this risk; the owner decides.

**Fix:** If wanted: refuse an .svg whose text holds <script, on* attributes, <foreignObject or a javascript: address, as a second line behind the page's CSP.

**Check:** A test PUTs an SVG with a script element and asserts 400.

### SEC-10 No advisory audit for the Python dependencies in CI

**Who found it:** Senior security engineer. **Where:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `python/graph_spec/pyproject.toml`.

**Risk:** npm audit signatures and dependency-review cover JavaScript, but nothing audits pyyaml, lxml and rfc8785 against published advisories except Dependabot's weekly alert. A known hole in lxml would stay in a shipped tarball until the next Dependabot pass.

**Fix:** Add `uvx pip-audit --locked` (or osv-scanner on uv.lock) to the Python job in ci.yml and release.yml.

**Check:** That CI step.

### OPS-5 The release waits on live OSV and NVD, with no retry

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `scripts/engine-version.mjs`, `.github/workflows/release.yml`, `.github/workflows/release-check.yml`.

**Risk:** The release's quality job calls OSV and NVD once each and throws on any non-200 answer. An NVD outage or rate limit, which are common, fails the release after an hour of Cachegrind, and the version number is spent.

**Fix:** Retry each call three times with backoff. When a source still fails, use the committed cache if it was checked within 14 days, and print a warning instead of failing. Move the refresh before the Valgrind install so a failure is cheap.

**Check:** A test in test/engine-version.test.js with a fetch that answers 503 once, then 200.

### OPS-6 Failures of nightly, wiki, Pages and advisories are silent

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `.github/workflows/nightly.yml`, `.github/workflows/wiki.yml`, `.github/workflows/pages.yml`, `.github/workflows/engine-advisories.yml`.

**Risk:** No workflow tells anyone when it fails; only GitHub's default e-mail to the owner does, and only if their settings allow it. The build-status board follows CI and stable releases alone, so a nightly or wiki that has failed for a month shows nowhere.

**Fix:** Add a small `report` job (`if: failure()`, `issues: write`) that opens or updates one issue labelled `workflow-failure`, reusing the pattern in wiki.yml's report job.

**Check:** A case in the workflow tests that every scheduled workflow has a failure-reporting job.

### OPS-7 Timed workflows pause and tokens expire without notice

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `RELEASING.md`, `scripts/build-status.mjs`, `.github/workflows/build-status.yml`.

**Risk:** GitHub turns off scheduled workflows after 60 days with no commit. A quiet spell then stops the nightly, the daily Pages rebuild, the lock job and the advisory watch. PROJECT_TOKEN is a classic token whose expiry is unrecorded, and an expired one only warns, so the board goes stale unseen.

**Fix:** Record each secret's expiry in RELEASING.md and set a calendar reminder two weeks before. Make the build-status warning open an issue after three refused runs in a row.

**Check:** A monthly scheduled job that calls the project API with PROJECT_TOKEN and fails loudly on 401.

### OPS-8 Repository settings are not exported; only required checks are held

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `scripts/public-readiness.mjs`, `test/public-readiness.test.js`, `RELEASING.md`.

**Risk:** The code holds the required checks list, but not the ruleset's other rules. Those are: pull request required, merge commits only, bypass actors, CodeQL as a check, Pages source and domain. A setting changed by hand or by GitHub drifts with nothing to compare against, and `--settings` runs only when an admin remembers.

**Fix:** Add `--settings --export` that writes the full default-branch ruleset and the Pages settings to `.github/settings/`. Have `--settings` compare the whole ruleset, not one rule. Run it before each release as a RELEASING.md step.

**Check:** A release-check step that runs `public-readiness.mjs --settings` with a fine-grained admin token stored for that job alone, or manual.

### OPS-9 Docker base, uv and Node pins are never bumped; no SBOM

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `.github/dependabot.yml`, `.github/workflows/release.yml`, `docker/benchmarks.Dockerfile`.

**Risk:** Dependabot watches npm, uv and Actions, but not the Docker image digest, the setup-uv `version:` input or the exact Node 24.20.0. These age silently until a security fix or a retired image forces a hurried change. A release ships checksums and provenance but no SBOM, so a user cannot list what is inside main.js.

**Fix:** Add a `docker` entry to dependabot.yml. Add a release step that writes `npm sbom --sbom-format cyclonedx` to an asset and attests it. Note in CONTRIBUTING.md that the Node patch and setup-uv version are bumped by hand with a new baseline.

**Check:** A case in test/policy.test.js that dependabot.yml names docker, and that the release's asset list includes the SBOM.

### OPS-10 A runner change or one flaky test blocks the release

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `quality/baseline.json`, `scripts/quality-check.mjs`, `scripts/quality-spec.mjs`, `RELEASING.md`.

**Risk:** Instruction counts are held only to the same OS, processor, Node major and Valgrind, with 5% tolerance. The measured spread is never committed or compared with that tolerance. When GitHub moves ubuntu-24.04 to new hardware, the release fails. It also fails when the baseline's flaky_tests of 0 meets one flaky test in the double run. It then waits for a new baseline pull request.

**Fix:** Commit `largest_spread` with each baseline and have quality-check fail a baseline whose tolerance is under twice it. Write in RELEASING.md the recovery order: run Quality baseline, commit it, re-run the dry run, then tag.

**Check:** A case in test/quality-baseline.test.js that the committed baseline carries a spread and that INSTRUCTION_TOLERANCE is at least twice it.

### OPS-11 Wiki and Pages depend on Chrome being on the runner image

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `.github/workflows/wiki.yml`, `scripts/wiki-screens.mjs`.

**Risk:** Both page builders call `google-chrome` from the ubuntu-latest image, which GitHub may drop or move. Pages only warns and ships without the picture, but the wiki job fails outright on every push to main, and the whole wiki stops updating.

**Fix:** Give the wiki step the same `|| echo ::warning::` fallback as pages.yml, and keep the last published images when a screenshot fails.

**Check:** A case in test/wiki-workflow or test/site-workflow that the screenshot step never fails the job.

### OPS-12 Docs disagree with the workflows on schedules and write access

**Who found it:** IT administrator and release / DevOps engineer. **Where:** `CONTRIBUTING.md`, `README.md`.

**Risk:** CONTRIBUTING says the advisory watch's weekly schedule is off, but the workflow has a cron. The README says only the release job may write, while seven other jobs write releases, the wiki, Pages, issues or pull requests. A successor reading the docs will misjudge what runs and what can change the repository.

**Fix:** Correct the two sentences, and add a one-table 'Who may write what' to CONTRIBUTING.md listing each job's write permission and why.

**Check:** A case in test/policy.test.js that every job with a write permission is named in that table.

### CODE-1 The graph-spec library is not type-checked at all

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/graph-spec/src/**`, `packages/graph-spec/tsconfig.json`.

**Risk:** The 5,185-line JavaScript library that reads, checks and lays out every graph runs with checkJs off. No file of its 42 has @ts-check. A wrong argument or a renamed field is found only by a test or a user, while CONTRIBUTING says TypeScript is strict in every package.

**Fix:** Turn on checkJs with JSDoc types file by file. Start with reader/store.js, joins/merge3.js and graph-layout.js. Keep the tsconfig at checkJs true once they pass.

**Check:** A conventions test that fails when any package tsconfig under typecheck has checkJs false or allowJs without checkJs.

### CODE-2 merge3, 306 untyped lines, is proved by one snapshot case

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/graph-spec/src/joins/**`, `packages/graph-spec/test/**`.

**Risk:** The three-way join of two documents over a base is the longest function in the repository. Its only tests are one characterisation case replayed against expected.json and a check that the name is exported. A wrong merge that still matches the old recorded answer, or any new branch of the function, passes unseen.

**Fix:** Add a joins test file with behaviour cases written as inputs and expected rows. Write one for each branch merge3 takes (agree, one side changed, both changed, hold on and off). Share them with the Python tests through cases.mjs.

**Check:** Line coverage of packages/graph-spec/src/joins/** added to quality-suite.mjs with a floor in quality/baseline.json.

### CODE-3 Coverage is measured for the core only, and only at release

**Who found it:** Senior coder and QA / test engineer. **Where:** `scripts/quality-suite.mjs`, `quality/baseline.json`, `.github/workflows/ci.yml`.

**Risk:** The 99.2% figure in quality/baseline.json covers packages/core/src alone. The Obsidian plugin, the server and the page have no coverage number at any time. CI runs quality-check with --fast, so a pull request that drops the core's coverage is seen only when a release is cut.

**Fix:** Widen --test-coverage-include to packages/*/src, packages/claude-code/server and page. Record one baseline per package. Run the coverage step in CI on pull requests that touch a package.

**Check:** quality-check.mjs holds each package's coverage_percent against its baseline on every pull request, not only at release.

### CODE-4 The Claude Code mod is outside typecheck, lint and CI

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/claude-code/mod/**`, `package.json`, `.github/workflows/release-check.yml`.

**Risk:** register.tsx (265 lines) starts the server, runs Graphviz and refuses Claude's own writes into the data folder. Yet CI never type-checks, lints or runs its test. The guide asks for a manual `claude plugin test` before a merge, so a broken hook ships when someone forgets.

**Fix:** Add `tsc -p packages/claude-code/mod --noEmit` to the typecheck script. Add a release-check step that runs `claude plugin validate` and `claude plugin test` where the CLI is installed. Make it fail when the CLI is not installed.

**Check:** A CI job with the Claude Code CLI that runs the mod's test. Until then, a conventions test that register.tsx imports nothing but src/ modules already under test.

### CODE-5 No test runs vault.process with a real interleaving

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/obsidian/harness/obsidian-shim.js`, `packages/obsidian/test/**`, `packages/obsidian/src/block-editor/**`.

**Risk:** The code defends against a stale write well. Every write passes through vault.process and is refused when the block text differs from the one last read. But the test shim applies the process callback synchronously. So no test can place a keystroke or a vault change between the read and the write, where Obsidian's asynchronous process really runs.

**Fix:** Give the shim's process an awaited read and an awaited write with a hook between them. Add one test for each writer that changes the note in that gap. It expects a refusal and a kept draft.

**Check:** A test in pane-writing.test.js and block tests that uses the gap hook. The conventions test lists the shim as a file the plugin's tests load.

### CODE-6 77 fixed sleeps remain in 26 plugin test files

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/obsidian/test/**`, `packages/core/test/layout-worker.test.js`, `test/fixed-sleeps.json`.

**Risk:** The ratchet stops new sleeps but keeps the old ones, 10 in settings.test.js and 8 in graph-view-parked.test.js. On a slow CI runner one of these fails now and then. The full suite runs on main after every merge and before a release, so a release waits on a rerun.

**Fix:** Replace each sleep with the test support's `until` on the state asserted, one file per pull request, and run --tighten after each.

**Check:** The existing fixed-sleeps ratchet, plus a quality metric that fails when the total allowance stops falling across two releases.

### CODE-7 139 of 249 core modules have no test named after them

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/core/src/**`, `packages/core/test/**`, `test/conventions.test.js`.

**Risk:** Files up to 389 lines, such as proposals-review.ts, style-graph.ts, link-scan.ts and style-checks.ts, are reached only through other modules' tests. Line coverage says those lines ran, not that their answers were asserted, so a wrong branch in one can pass while the suite stays green.

**Fix:** Add a ratchet file of core modules with no named test. Require a new module over 100 lines to have one. Work the list down, starting with the four named.

**Check:** A conventions test that fails when the list of unnamed modules grows, in the style of test/fixed-sleeps.json.

### CODE-8 Reader parity rests on a small, snapshot-shaped case set

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/graph-spec/test/**`, `python/graph_spec/tests/**`.

**Risk:** The JavaScript and Python readers are held to each other through cases.mjs and 25 recorded answers in expected.json. The test says these were recorded before the code moved here. The shared behaviour files are thin, two reading cases and two problem-code cases. So both readers can agree and still be wrong on a shape neither case holds.

**Fix:** Grow reading-cases.json and problem-code-cases.json with one case per reader rule. Write each with its intended answer rather than a recorded one. Have both readers run them.

**Check:** A test that every problem code in reader/problem-codes.json has at least one case in problem-code-cases.json.

### CODE-9 28 functions over 100 lines; the 400-line cap is on files

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/core/src/display/**`, `packages/obsidian/src/*.ts`, `test/conventions.test.js`.

**Risk:** No module passes 400 lines. But renderProperties (272 lines), renderBlock (221), renderViewBlock (217) and bindViewportEvents (203) are single functions that nobody can hold in their head. A change in one is hard to review, and its branches are hard to test one by one.

**Fix:** Add a function-length rule to the conventions test with a ratchet of the functions now over 100 lines. Split the four named when they are next touched.

**Check:** A conventions test over the TypeScript AST that fails when a function over 100 lines is added or one on the list grows.

### CODE-10 Live Preview hands a hand-made context to the block renderer

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/obsidian/src/live-preview.ts`, `packages/obsidian/src/block.ts`.

**Risk:** The editing view builds a five-field object and casts it to MarkdownPostProcessorContext, the plugin's one unchecked cast of an Obsidian type. When Obsidian adds a field the renderer or a child reads, the card in Live Preview fails. The reading view keeps working, and the compiler cannot say so.

**Fix:** Give renderShown a narrow interface of the fields it uses (sourcePath, getSectionInfo, addChild). Pass Obsidian's context or the hand-made one to that type, without a cast.

**Check:** The typecheck, once the cast is gone; a conventions test that counts `as unknown as` in packages/obsidian/src and holds it at zero.

### CODE-11 A running layout is never cancelled when the user keeps typing

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/core/src/layout-worker.ts`, `packages/core/src/display/editor/pane-drawing.ts`.

**Risk:** A new edit replaces only layouts still queued for the same owner. The one already in the worker runs to its end, and its result is then dropped as stale. On a large graph each keystroke waits behind a layout nobody wants, so the drawing lags further the more the person types. The panel proposes accepting this risk; the owner decides.

**Fix:** When a newer job for the same owner arrives while its earlier one is busy, terminate and restart the worker. The timeout path already does this. Do not wait for the old job.

**Check:** manual

### CODE-12 The server keeps no copy of the note it overwrites

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/claude-code/server/note-file.ts`, `packages/claude-code/server/note-drafts.ts`.

**Risk:** The write is atomic and fsynced, so a crash leaves the old or the new note whole. But the earlier text is kept only when the note's folder is a git repository. Take a note outside git where a good write carried a bad edit. It has no earlier version the changes view or the person can go back to. The panel proposes accepting this risk; the owner decides.

**Fix:** Before the rename, copy the note's current bytes into the drafts folder under its digest name as a one-deep 'before' record. Offer it in the changes view when git has no history.

**Check:** manual

### ARCH-1 Host contract covers display only; files and settings copied per host

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/display/host*.ts`, `packages/obsidian/src/**`, `packages/claude-code/page/**`, `packages/claude-code/server/**`, `wiki/Adding-a-host.md`.

**Risk:** The Tauri app (Wave 7) and VS Code (Wave 8) will each hand-copy about 600 lines of glue. This covers notes, drafts, settings and the layout worker. No shared test holds it. Every later change to how a note is read or written then has to be made three or four times, and drifts.

**Fix:** Before H1 (Wave 7), widen the published host interface to what the requirement names: note store, drafts, settings, secrets and the layout runner. Give each one a contract check in host-contract.ts. Make the Obsidian and page adapters pass it in test/host-adapters.test.js.

**Check:** test/host-adapters.test.js runs every adapter against every contract check. A conventions rule fails a host package that defines its own note read or write outside the adapter.

### ARCH-2 Storage interface exists only as EditorNote, with no contract suite

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/display/editor/editor-note.ts`, `packages/core/src/store.ts`, `test/storage-contract.test.js`, `packages/claude-code/server/**`, `packages/obsidian/src/block-editor/**`.

**Risk:** Sync (Wave 13), the encrypted store (W30) and the GitHub backend (Wave 27) are all planned as 'one more backend of the storage interface'. But that interface has no file and no contract test. It has two hand-written implementations. Whoever adds the third backend inherits the differences between the first two.

**Fix:** In Wave 6 (L1) lift EditorNote plus a small NoteStore (read, write-if-unchanged, watch, list, draft) into core as the named storage interface. Write test/storage-contract.test.js. Run the vault, the page store and a plain-folder backend against it before the Tauri app starts.

**Check:** storage-contract.test.js in the suite, listed in CONTRIBUTING.md, with every backend registered; the requirement flips to written only with all three.

### ARCH-3 Layering is not held across packages; hosts reach into core internals

**Who found it:** Enterprise, solution and data architect. **Where:** `test/layers.test.js`, `packages/claude-code/page/**`, `packages/obsidian/src/layout-worker/**`, `packages/core/src/index.ts`.

**Risk:** The page imports 55 core modules by relative path in 15 files, bypassing the package's exports map and the public-api check. A core refactor that keeps the public surface still breaks the Claude Code host, and the planned layers test does not exist.

**Fix:** Add test/layers.test.js now: every import outside packages/core that names core must go through @thoughtknot/core, its display/* or hosts/* paths. Export what the page needs from the entry. Replace the relative imports.

**Check:** test/layers.test.js in the suite, built on scripts/import-graph.mjs, failing any ../core/src or ../graph-spec/src import from a host package.

### ARCH-5 Two hand-kept parsers, no grammar; drift caught only on listed cases

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/graph-spec/src/reader/**`, `python/graph_spec/src/graphspec/reader/**`, `python/graph_spec/tests/test_parity.py`, `.github/workflows/nightly.yml`.

**Risk:** The JavaScript and Python readers are written separately (parser.js 235 lines, grammar.py 268 lines). They agree only on the case tables and the parity runs. A syntax added to one and not the other ships unnoticed. So does an edge the tables miss. It shows only when a Python tool and the editor read one note differently.

**Fix:** Add a nightly differential test that generates random statements from one small grammar description. It compares both readers' canonical output. So a divergence is found without a hand-written case.

**Check:** nightly.yml runs the differential test; a failure writes its failing block to the case table.

### ARCH-6 Identity is the visible name; no stable id survives a rename

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/graph-spec/src/reader/store.js`, `packages/graph-spec/src/joins/**`, `packages/core/src/link-renames.ts`, `requirements/editor-requirements.gql`.

**Risk:** The id is the variable name, cannot be SET, and is what change sets, views across notes and the mesh join will key on. Renaming a thing in one note makes a new thing everywhere else. Two notes using the same name for different things merge as one until the planned 'contested claims' exist.

**Fix:** Decide before W16 and W19 (Wave 9) whether identity stays the name per note, with an explicit 'same as' link across notes. The other choice is a hidden stable key. Write it as a requirement with the rename and the two-notes case as tests.

**Check:** A written requirement proved by a cross-note rename test and a same-name-two-things join test in the shared case tables.

### ARCH-7 Whole-note text is the only store; nothing indexes across notes

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/sources.ts`, `packages/core/src/hosts/vault-folder.ts`, `scripts/instruction-counts.mjs`.

**Risk:** Limits inside one note are stated and tested (2,000 things drawn, 1 MB and 20,000 lines read). Beyond one note there is no index. Views across notes and the mesh will reread every file, and no test holds a vault of thousands of notes.

**Fix:** Before W10 (sources across notes) widens, add a derived-store seam. This is an index rebuilt from text, as five_layer_stack already asks. Add one benchmark over a 5,000-note vault in scripts/instruction-counts.mjs.

**Check:** A multi-note benchmark in the quality ratchet with a stated ceiling.

### ARCH-8 Exports read back only by test helpers; no product import

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/export-data*.ts`, `packages/core/src/sources.ts`, `packages/core/test/export-data-readers.js`.

**Risk:** GraphML, CSV and GQL exports round-trip in tests. But the readers used are test-only code. So a user cannot bring a GraphML or CSV file back in. A format tested only one way can drift from what real tools write.

**Fix:** In W27 (Wave 11), add CSV and GraphML as sources through the plug-in interface. Or state in the user guide that export is one way.

**Check:** The exporter contract gains a read-back check once an importer exists; until then, manual.

### ARCH-9 The JavaScript library is private TypeScript sources in an archive

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/package.json`, `packages/core/esbuild.layout.mjs`, `.github/workflows/release.yml`, `packages/*/LICENSE`.

**Risk:** Every package is private, core exports raw .ts files, graph-spec is CommonJS beside ESM packages, and no package folder carries a LICENSE. A VS Code or Tauri project outside this repository cannot install the library; it must vendor sources and compile them.

**Fix:** Before Wave 8, build core to ESM plus .d.ts in the release archive alongside graph-spec's dist. Add a LICENSE copy to each package. Keep the one lockstep version (0.x minor as major, as public-api.mjs already reads it).

**Check:** release.yml installs the archive into an empty project and imports @thoughtknot/core and @thoughtknot/graph-spec with plain Node.

### ARCH-10 Three decisions that cost most if left after their wave

**Who found it:** Enterprise, solution and data architect. **Where:** `requirements/waves.json`, `requirements/editor-requirements.gql`, `scripts/public-api.mjs`.

**Risk:** Twenty-five two-week waves for one maintainer with AI sessions, with 193 planned tests against 142 written, leave no slack. Three choices get many times dearer once the next wave builds on them.

**Fix:** Decide before: (1) the storage and full host contract before Wave 7 H1. Give L1 its own wave rather than sharing Wave 6 with T1 and P1. (2) Format version and identity (ARCH-4, ARCH-6) before Wave 9, and certainly before Wave 13 CRDT. (3) A published, versioned surface for the display layer (today excluded from public-api.json) before Wave 8 VS Code consumes it from a webview.

**Check:** Each decision is a written requirement with a test flipped to written before the named wave starts; scripts/check-requirements.mjs --done lists them.

### UX-2 Half the manual walk-through could run on the existing Chrome harness

**Who found it:** User experience lead and accessibility specialist. **Where:** `test/a11y-targets-reflow.test.js`, `scripts/targets-reflow.mjs`, `scripts/chrome.mjs`, `RELEASING.md`.

**Risk:** The person-run list is 21 checks times 3 hosts times 2 themes. The device checklist has 3 of 163 ticked and was last marked at 0.3.0. With 429 commits in four days, a list that long is skipped, so regressions in focus, reflow, 44-point targets and pseudo-locale overflow reach users.

**Fix:** On the Chrome harness add: 44-point sheet buttons, focus ring visible after Tab (screenshot diff), Escape returns focus, reduced-motion emulation, 200% text and spacing overlap, and en-XA/ar-XB overflow. That moves AX-01, 02, 05, 14, 15, 16, 17, 20, 21 and most of 13 out of the manual list. It leaves the screen-reader items and Obsidian-on-phone.

**Check:** Extend test/a11y-targets-reflow.test.js (or a sibling) with those measures; keep RELEASING.md listing only what still needs a person.

### UX-3 Many user-facing sentences bypass the word catalogue and its checks

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/**`, `packages/obsidian/src/**`, `packages/graph-spec/src/reader/parser.js`, `test/pseudo-locales.test.js`.

**Risk:** The catalogue has one language (en-GB) and no translation is loaded, yet dozens of sentences are typed straight in code: Obsidian notices, pane and card fallbacks, problem messages and parser errors. Hand-built plurals like `send${n === 1 ? '' : 's'}` will break in any future language, and the pseudo-locale test cannot see any of it.

**Fix:** Move these strings into the catalogues with plural forms. Widen the pseudo-locale scan to p, h4, li, [role=status], [role=alert] text and to Obsidian notices.

**Check:** test/pseudo-locales.test.js fails on any plain English in those elements. A lint rule flags `new Notice('` and `text: '` with a sentence outside *-words.ts files.

### UX-4 No busy state while a layout runs, and a silent stop after failures

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/display/editor/pane-drawing.ts`, `packages/core/src/layout-worker.ts`, `packages/obsidian/src/layout-worker/**`, `packages/claude-code/page/layout-runner.ts`.

**Risk:** A layout may take 5 seconds, and the engine 30 seconds to start. Meanwhile the pane shows nothing or the old drawing with no sign of work. After three slow layouts drawing stops until the plugin reloads, and the user is told only in the developer console.

**Fix:** Show a `role=status` line such as 'Laying out…' with a Cancel after about 300 ms. Mark the drawing `aria-busy`. Show the 'stopped' and 'on-the-page' messages as a banner or Notice with a 'Try again' button.

**Check:** A test with a fake clock holds a layout for 400 ms and asserts the status text. Another test asserts a visible banner after TIMEOUTS_BEFORE_STOPPING failures.

### UX-5 A drag on the card writes outside the note's editor undo path

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/obsidian/src/view-block.ts`, `packages/obsidian/src/block.ts`, `packages/obsidian/src/block-editor/note-writing.ts`.

**Risk:** Typed edits go through CodeMirror so Cmd+Z works, but a drag on the card writes the nudge with vault.process. Whether the host's undo takes a drag back is untested, and a wrong drop may be hard to reverse.

**Fix:** Route writeStyle through the same editor-first writer as note-writing.ts, so a nudge is one editor change. Add a checklist item 'Cmd+Z takes back a drag'.

**Check:** A host test drags a box with the note open in the editing view and asserts one undoable transaction. Add a device checklist line under P.

### UX-7 Landing page and guide state no system requirements or AI data flow

**Who found it:** User experience lead and accessibility specialist. **Where:** `site/words.json`, `scripts/site.mjs`, `wiki/Home.md`.

**Risk:** The plugin needs Obsidian 1.13.0. Neither the site, the wiki nor the README says so. So a user on an older app installs and sees nothing. The site says 'everything runs on your device' without saying what leaves it once an AI model is set up.

**Fix:** Add 'Needs Obsidian {minAppVersion} or newer, desktop or mobile', filled from manifest.json by scripts/site.mjs. Add one sentence on what is sent to an AI model and when.

**Check:** test/site.test.js asserts the rendered page contains manifest.json's minAppVersion.

### UX-8 First-run syntax help is only in the wiki, not in the app

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/display/editor/pane-drawing.ts`, `packages/obsidian/src/main.ts`, `packages/graph-spec/src/reader/parser.js`, `wiki/How-to-use-ThoughtKnot.md`.

**Risk:** An empty pane says 'Nothing to draw yet. Start with a thing.' with no example, no link to the guide and no command to insert one. Inline completion exists but the user guide never mentions it, so a new user types blind and meets a token-level parser error.

**Fix:** Give the empty states a one-line example and a 'Read the guide' link. Add an 'Insert the example graph' command. Map parser errors to catalogue words with a hint ('Close the bracket after …').

**Check:** test/ux-journey.test.js gains a stage that opens an empty block and asserts an example and guide link. test/ux-copy.test.js covers parser messages.

### UX-9 Focus on a drawing box is a thicker stroke, measured by nobody

**Who found it:** User experience lead and accessibility specialist. **Where:** `styles.css`, `packages/claude-code/page/page.css`, `test/a11y-targets-reflow.test.js`.

**Risk:** `g.node:focus` removes the outline and relies on stroke-width 3 under :focus-visible. The keyboard tests run without layout. So whether that change meets the 3:1 and 2-pixel rule (AX-02, SC 2.4.11) in both themes is judged only by hand. UX-1 shows this does not happen.

**Fix:** Draw a separate focus ring (accent stroke, 2px, offset) on the focused box. Have the Chrome harness compare a focused and unfocused box screenshot for a visible change in both themes.

**Check:** A case in test/a11y-targets-reflow.test.js (real Chrome) that tabs to a box and asserts pixel change above a threshold in light and dark.

### UX-10 Design screenshots show the old 'Graph Note' brand and version

**Who found it:** User experience lead and accessibility specialist. **Where:** `scripts/wiki-screens.mjs`.

**Risk:** The review screenshots in project files carry the Graph Note name and 'Latest release: 0.6.0' while the code is ThoughtKnot 0.7.1. Anyone judging the UI from them judges a stale product; wiki images are regenerated, but design-review files are not. The panel proposes accepting this risk; the owner decides.

**Fix:** Take review screenshots with scripts/wiki-screens.mjs so they follow the build, or date-stamp them.

**Check:** manual

### NEURO-1 No vault-wide list of graphs, cross-note links or one-shot backup

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/main.ts`, `packages/obsidian/src/export/**`, `packages/core/src/export*.ts`, `packages/claude-code/server/**`.

**Risk:** After a year of notes a person cannot see which notes hold graphs, which graph spans which notes, or export them all for a backup. They must remember where everything is, which is the one thing an ADHD reader cannot rely on.

**Fix:** Add one command, Graphs in this vault, that lists each graph with its notes. Add one export choice, Every graph, that writes all graphs as GQL into one folder.

**Check:** A test opens the test vault, runs the command and asserts every graph note is listed. Another test checks that the Every graph export writes one file per graph.

### NEURO-2 Changes and history view exist only in the browser editor

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/**`, `packages/core/src/changes-view.ts`, `requirements/editor-requirements.gql`.

**Risk:** An Obsidian user who accepts a drag edit or a proposal cannot look back later. They cannot see what the tool changed in the note. If something looks wrong a week on, they must read raw text and remember.

**Fix:** In Obsidian, offer Compare with on the card. Use the host's file recovery snapshots or the last written text kept in plugin data. Draw it with the same changes-view.ts.

**Check:** A requirement that names Obsidian in changes_view, proved by a test in packages/obsidian/test that opens Compare with on the sample note.

### NEURO-3 Ten icon-only toolbar buttons, no visible tooltip, nothing can be hidden

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/graph-view/view-bar.ts`, `packages/core/src/settings.ts`, `packages/core/src/settings-source-words.ts`.

**Risk:** Every card shows ten icons with no visible name, so a reader must recall what each glyph means each time. Nobody can hide the buttons they never use, so the load is the same on every graph.

**Fix:** Give each bar button a tooltip in the host's style (the aria-label as title or setTooltip). Add a setting that folds the less used buttons (filter, view, export, source) behind one More button.

**Check:** Extend the host contract or wcag test: every button in the bar has a visible tooltip text equal to its aria-label.

### NEURO-5 Colour-never-alone rule has no test, yet ethos says it is checked

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `test/colour-alone.test.js`, `requirements/ethos.gql`, `scripts/ethos.mjs`.

**Risk:** The code marks estimates, changes and kinds by line and word as well as colour today. But nothing stops a new feature carrying meaning by colour alone. A colour-blind or dyslexic reader who scans by shape would then miss it, and the ethos page would still claim the rule is held.

**Fix:** Write test/colour-alone.test.js: for every mark, kind and state the drawing colours, assert a line style, icon or word is also present. Until then mark r_sight in ethos.gql as 'not yet' for this part.

**Check:** The test itself, in the full suite; scripts/ethos.mjs refusing a rule whose named test is still planned.

### NEURO-6 Every notice vanishes after five seconds and cannot be read again

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/host.ts`, `packages/core/src/display/host-contract.ts`, `packages/obsidian/src/display-host.ts`, `packages/claude-code/page/browser-host.ts`.

**Risk:** Long messages disappear before a slow reader finishes. Examples are 'The kept drafts could not be written into … They stay kept' and 'This drawing is not on the page yet …'. There is no setting to keep them and no list of past messages.

**Fix:** Give notice() a duration that grows with the message length. Past about 80 characters, it stays until dismissed. Keep the last ten messages behind the problems badge.

**Check:** A host contract case: a notice longer than 80 characters is still shown after 10 seconds in a fake clock.

### NEURO-7 Drawing redraws 250 ms after typing; picture may jump

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/editor/typing-rests.ts`, `packages/core/src/display/graph-view/**`, `packages/core/src/zoom-across.ts`.

**Risk:** Each pause in typing re-runs the Graphviz layout and can move every box, so the picture shifts while the reader is still thinking. The spec keeps the typed box still but says nothing about keeping the drawing's boxes and viewport where they were.

**Fix:** Keep the viewport across a redraw. While a block is being edited, only re-lay out when a thing or link is added or removed, not on each property keystroke. add a setting 'Redraw while typing: after each pause / when I press Done'.

**Check:** A test in packages/core/test types a property value. It asserts the zoom and every unchanged box's place are the same after the redraw.

### NEURO-8 No two-minute first success: no insert-example command

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/main.ts`, `packages/core/src/edit-source-words.ts`, `wiki/How-to-use-ThoughtKnot.md`.

**Risk:** A new reader must type a seven-line block by hand from the guide, with a graph line, kinds, quotes and arrows, before anything is drawn. The empty-block prompt also asks them to type a pattern, so the first minute is all syntax and no reward.

**Fix:** Add a command 'Insert an example graph'. Add a button on the empty-block prompt that writes the guide's example. The first drawing then appears in one press.

**Check:** A test in packages/obsidian/test runs the command in an empty note and asserts a drawing with three things appears. test/wiki-guide.test.js asserts step 1 names the command.

### NEURO-9 No reading options: letter spacing, line height or font

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `styles.css`, `packages/core/src/theme-tokens.ts`, `packages/claude-code/page/page.css`, `packages/core/src/settings.ts`.

**Risk:** Line height and caption letter spacing are fixed in the style sheet and the settings page offers no reading choices. A dyslexic reader of the browser editor, which has no Obsidian theme, cannot loosen the text.

**Fix:** Add tokens for line height and letter spacing to theme-tokens.ts. Add one setting 'Easier reading' that raises both and widens word spacing in both hosts.

**Check:** test/theme-tokens or wcag test asserts the two tokens exist and the setting changes the computed style.

### NEURO-11 No recently edited or recently visited list

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/graph-view/details-summary.ts`, `packages/obsidian/src/main.ts`.

**Risk:** The details trail gives back and forward inside one graph. Kept drafts can be recovered. But nothing shows the graphs or things a person worked on yesterday. Someone who stops mid-task has no way back to where they were.

**Fix:** Keep the last ten graphs and things opened in plugin data and show them in the details summary while nothing is chosen.

**Check:** A test in packages/obsidian/test that opens two graphs and asserts the summary lists both, newest first.

### FLOW-4 A one-line fix pays eleven gates and may touch four records

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `package.json`, `AGENTS.md`, `.github/workflows/ci.yml`, `.github/workflows/claude-review.yml`, `scripts/**`.

**Risk:** One pull request runs 6 test shards, lint, python, python-no-engine, tests-first and public-readiness. It also runs a Claude review of up to 30 minutes, the project mirror and the build status. A test or doc change must also carry a tests-first record, a plain-docs record, public-api.json or a quality baseline. Each is written by a script the author must know to run.

**Fix:** Add one script, `npm run prepare-pr`, that runs tests-first --update, plain-docs --update, public-api --update and notices.mjs in order, and name it in AGENTS.md. Skip the Claude review and public-readiness setup check for docs-only changes by path filter.

**Check:** A CI step that runs prepare-pr and fails on a dirty tree, so a forgotten record is one message, not four.

### FLOW-5 A requirement's text can be rewritten to fit the code

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `scripts/check-requirements-flips.mjs`, `scripts/build-status.mjs`, `requirements/editor-requirements.gql`.

**Risk:** The flip check guards only a test's status, by design: records, links and comments may change freely. So a proved requirement's rule can be softened after the fact and the test stays 'written'. No one is told the proof no longer matches the words.

**Fix:** Make the flip check list every proved requirement whose `rule` text changed, and require the pull request body to name each one. The build status then shows the requirement as 'reworded' until its test's commit is newer than the wording.

**Check:** check-requirements-flips.mjs --merge-base-of prints 'reworded' lines and exits 1 unless the commit message names the id.

### FLOW-6 Store submission is last, with no CI step for its checklist

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `manifest.json`, `versions.json`, `.github/workflows/release.yml`, `requirements/waves.json`, `packages/obsidian/**`.

**Risk:** The community listing is one requirement in Wave 15, March 2027, and the Obsidian review queue takes months. No workflow runs the store's checklist, so problems the reviewers raise are found a year from now instead of today.

**Fix:** Submit to obsidian-releases at the next stable release, in Wave 5, as a beta listing is allowed while slices continue. Add a CI step that checks manifest.json fields, the release assets and the plugin guidelines list the store publishes.

**Check:** A test that reads manifest.json, versions.json and the release workflow against the store's documented rules; release.yml fails when they drift.

### FLOW-9 No per-file MPL notice, and no test holds that choice

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `packages/graph-spec/**`, `python/graph_spec/**`, `.github/workflows/release.yml`, `test/licences.test.js`.

**Risk:** MPL-2.0 Exhibit A asks each source file to carry the notice, or a LICENSE file where a reader would look. 705 source files carry none. This is allowed only if LICENSE sits at every published root. The single-file graph-spec build and the Python wheel ship as separate artefacts.

**Fix:** Add the short SPDX line `// SPDX-License-Identifier: MPL-2.0` to the banner of the built graph-spec file and the Python package's __init__. Include LICENSE in the libraries archive and the wheel.

**Check:** test/licences.test.js asserts the built single file and the archive carry the notice or LICENSE.

### FLOW-10 Issue templates and conduct contact point at closed doors

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `.github/ISSUE_TEMPLATE/**`, `.github/SUPPORT.md`, `CODE_OF_CONDUCT.md`, `test/community-files.test.js`.

**Risk:** Issues are collaborators-only, yet two issue templates and a 'bug' label exist, and SUPPORT.md routes bugs to Discussions Q&A instead. The code of conduct's contact is an email on a GitHub profile that may be hidden, so a report may have nowhere to go.

**Fix:** Put a project address (a mailbox Roger owns) in CODE_OF_CONDUCT.md. Either open issue creation to everyone with the two templates, or delete the templates until then. Say in config.yml that bugs go to Discussions.

**Check:** test/community-files.test.js asserts the conduct file names an address, and that issue templates exist only when public-readiness wants issues open to all.

### FLOW-11 Decisions live in two places with different forms

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `requirements/editor-requirements.gql`, `scripts/wiki.mjs`, `CONTRIBUTING.md`.

**Risk:** The wiki's Decisions page is made only from answered Question nodes in the requirements. Decisions written as '(Roger, 16 Oct 2026)' remarks sit in comments and CONTRIBUTING.md. One example is dropping the vault as the requirements source. They never reach that page, so a reader cannot find why things are as they are.

**Fix:** Record each '(Roger, date)' decision as a Question node with its answer and date, starting with the vault decision. Then the Decisions page lists them all. Say in CONTRIBUTING.md that a dated remark must have its Question.

**Check:** A test that finds every '(Roger, <date>)' remark in requirements and docs and requires a Question node answered on that date.

### FLOW-12 Third-party notices depend on a hand-kept record

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `licences/bundled.json`, `scripts/notices.mjs`, `test/licences.test.js`, `TRADEMARKS.md`.

**Risk:** THIRD_PARTY_NOTICES.md covers Graphviz (EPL-2.0), Expat, Emscripten, marked and the redrawn Lucide icons. No fonts are bundled. The record is written by hand per version. So a new bundled dependency that the test's allow-list accepts could ship before its entry and licence text are added. The panel proposes accepting this risk; the owner decides.

**Fix:** Keep as is; TRADEMARKS.md matches MPL-2.0 section 2.3 and does not restrict forks beyond the name. Add to RELEASING.md one line: run notices.mjs and diff before tagging.

**Check:** Already held by test/licences.test.js if its bundle walk is complete; otherwise manual.

### API-1 Half the shipped graph-spec exports sit outside the break check

**Who found it:** API design expert. **Where:** `packages/graph-spec/src/graph-spec.d.ts`, `packages/graph-spec/src/graph-spec-check.js`, `public-api.json`.

**Risk:** The JS entry point exports 60 names, but the d.ts declares only what the core calls. So about 27 shipped exports (read, parseDoc, merge, union, project, review, legend, mermaidGraph, jcs, sha, views and more) are not in public-api.json. A vault or page that vendors the archive can lose or see a changed signature with no major version and no CI failure. Only the bare names are held.

**Fix:** Declare every exported name in graph-spec.d.ts, or generate the d.ts from JSDoc with tsc allowJs+declaration. Then public-api.json covers the whole module.exports object.

**Check:** A test that Object.keys(require('graph-spec-check.js')) equals the names in public-api.json's graph-spec '.' entry.

### API-2 Core is guarded as a library but never shipped as one

**Who found it:** API design expert. **Where:** `packages/core/package.json`, `scripts/public-api.mjs`, `.github/workflows/release.yml`.

**Risk:** The release archive carries graph-spec and the Python library, not @thoughtknot/core. Yet core's 639 exports are held to semver, and its package exports raw .ts with no built types. Library users cannot install what the guard protects. The surfaces a VS Code or Tauri host would really depend on (display/*, hosts/*) are left out of the guard on purpose.

**Fix:** In the wave that adds the second host, decide core's publish story. Either build and ship core (d.ts + ESM) and add display/host entries to LIBRARY, or narrow the guard to what is shipped.

**Check:** test/lib-public-api.test.js asserts every package in LIBRARY is also a file in the release archive's `git archive` list.

### API-4 Local server has two error formats and no shared schema

**Who found it:** API design expert. **Where:** `packages/claude-code/server/**`, `packages/claude-code/page/*-calls.ts`.

**Risk:** start-server answers 401, 404, 405 and 413 as text/plain, while every route answers JSON {why}. The page's write() throws away the server's why for all statuses but 409. So a 410 'note gone' or a 403 refusal reaches the person as 'The editor server said 410'. Reply shapes (NoteReply, PageVersion, PageItemFiles) are typed once in the page and once, untyped, in the server. The page tests use a fake fetcher, so a drift is caught by nobody.

**Fix:** Put the route reply and error types in one module (packages/claude-code/src/api-types.ts) imported by both page and server. Send every refusal as JSON {why}. Read why on every non-ok status in note-calls.ts.

**Check:** A test that starts the real server and runs serverCalls/noteCalls/exportCalls against it. It asserts each reply satisfies the shared types and each refusal is JSON with why.

### API-6 Python library is loose files, not an installable package

**Who found it:** API design expert. **Where:** `python/graph_spec/pyproject.toml`, `.github/workflows/release.yml`.

**Risk:** pyproject sets package = false. Hosts put src/ on sys.path and import four flat modules. There is no build-system, no py.typed and nothing goes to PyPI. Anyone outside the vault who wants the Python side gets no pip install. They also get no type checking of the library and no version pin a resolver can read.

**Fix:** In the library-release wave, give the Python side a build-system table, a py.typed marker and `uv build` in release.yml. Attach the wheel to the release beside the tar.gz.

**Check:** CI job installs the built wheel into a clean venv and imports the four entry points.

### API-7 Python public surface is everything, private names included

**Who found it:** API design expert. **Where:** `python/graph_spec/src/*.py`, `python/graph_spec/tests/entry_points.json`.

**Risk:** The entry-point contract freezes every top-level name the four modules ever had, because the vault's scripts use private names. The Python API therefore has no boundary: nothing may ever be renamed. The JS and Python surfaces drift in naming, with no check that a JS export has a Python twin.

**Fix:** Declare __all__ in each entry point as the public set. Move the vault's private uses onto public names. Add a parity table (JS export to Python name) that test_parity.py reads.

**Check:** A test that every name in public-api.json's graph-spec entry has a row in the parity table, and every row's Python name is in __all__.

### API-8 graph-spec is CommonJS-only with a partial d.ts and mixed errors

**Who found it:** API design expert. **Where:** `packages/graph-spec/package.json`, `packages/graph-spec/esbuild.check.mjs`, `packages/graph-spec/src/graph-layout.js`.

**Risk:** The package is type commonjs, and the built file is an IIFE global with a CJS footer. So an ESM or bundling consumer gets no tree shaking, and TypeScript users of the undeclared exports get compile errors. Error style is mixed. The reader throws ProfileError with a code, check() returns tuples, and the layout throws plain Error whose text imitates Python's KeyError.

**Fix:** Add an ESM build target beside the IIFE (esbuild format esm) under an exports 'import' condition. Give the layout's refusals a named error class with a code like the reader's.

**Check:** graph-spec-check-built.test.mjs also imports the ESM build and asserts the same names. A test holds that every thrown error from the package has a `code`.

### API-9 AI transport is hard-wired to the OpenAI chat shape

**Who found it:** API design expert. **Where:** `packages/core/src/ai-request.ts`, `packages/core/src/ai-choice.ts`, `packages/core/src/plugins.ts`.

**Risk:** No model id is hard-coded and the endpoint is the user's. But the body is always {model, messages[system,user]} and the reply is read from choices[0].message.content. An Anthropic Messages, Gemini or Ollama native endpoint answers 'its reply holds no message'. Nothing in the settings or docs says the address must be OpenAI-compatible.

**Fix:** Name the shape in the settings help and the wiki now. In the plug-in wave, add an AI provider extension point whose contract is requestBody and readReply, with the OpenAI shape as the built-in one.

**Check:** plugins-contract.ts suite for providers: a provider round-trips a fixed question and a fixed reply fixture.

### API-11 Schema @1 is a name suffix, not a version negotiation

**Who found it:** API design expert. **Where:** `packages/core/src/standard-schemas.ts`, `packages/core/src/schema-names.ts`.

**Risk:** decision@1 is matched as one string. An unknown name or version gives a warning that lists the versions present, and the graph's types go unchecked. A vault block named decision@1 replaces the standard one wholesale. So two vaults can mean different things by the same versioned name with no notice. The panel proposes accepting this risk; the owner decides.

**Fix:** Document in the schema section that @N is part of the name and that a vault's block shadows a standard one. Also document that a shadowing block differing from the standard text gets an info-level note.

**Check:** manual

### AI-2 Classification gate guards the pane only, not Claude's own reads

**Who found it:** AI product and engineering expert. **Where:** `packages/claude-code/mod/hooks/register.tsx`, `packages/claude-code/src/**`, `README.md`.

**Risk:** The gate stops a classified note or a credential reaching the browser pane. Claude's Read and Grep tools read the same vault files with no gate, so the highest classification still reaches the model whenever Claude looks.

**Fix:** State plainly in README and GUIDE that the gate covers only what the mod shows, and that Claude Code's file tools are outside it. Then hook Read and Grep on vault paths through claudeGate (credential and top-level refusals at least), with the same fail-closed rule as the data guard.

**Check:** A mod test raising tool.call Read on a note with a private key, asserting deny. Extend test/ai-disclosed.test.js to require the sentence about Claude Code's own tools.

### AI-4 Answers are free text parsed by brace slicing, not structured output

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai-request.ts`.

**Risk:** The request sets only model and messages: no response schema, no max_tokens, no finish_reason check. A cut-off or chatty reply is reported as 'JSON cannot be read' with no hint why, and quality depends on the model obeying prose.

**Fix:** In Wave 11 send a JSON schema for {changes[]}. Use response_format json_schema on chat-completions endpoints and output_config.format on the Anthropic Messages API. Set max_tokens, and read finish_reason so a truncated answer says 'cut short'. Keep changesIn as the second check.

**Check:** ai-request.test.js asserts the body carries the schema and max_tokens, and a reply with finish_reason length is said as truncated.

### AI-5 No cost ceiling, token cap, usage record or prompt caching

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai.ts`, `packages/core/src/ai-request.ts`, `packages/core/src/settings.ts`.

**Risk:** ai-ceiling.ts is a classification ceiling. Nothing bounds spend. Today each send is one click, so cost is bounded by the user. Text to graph on whole notes and agent loops in Waves 19 and 23 remove that bound.

**Fix:** Record the reply's usage object in SendRecord. Show the byte size already computed as an estimate before send. Add max_tokens, and a per-day send count setting that refuses beyond it. Prompt caching matters only once the same graph is sent repeatedly (Wave 28). Then put the graph first and stable.

**Check:** ai.test.js asserts a record carries usage when the reply gives it, and a send past the daily count is refused in words.

### AI-6 No eval set: a model change cannot be judged safe

**Who found it:** AI product and engineering expert. **Where:** `test/fixtures/**`, `scripts/**`, `quality/**`.

**Risk:** Every AI test drives a fake transport with hand-written replies, so the suite proves plumbing, never answer quality. Changing the prompt, the default model or the wire shape passes CI whether or not real answers get worse.

**Fix:** Add test/fixtures/ai/<case>/{note.md, question.txt, expected.json} with ten recorded cases. Add an opt-in script scripts/eval-ai.mjs that calls a configured endpoint. It scores precision and recall of things and links against expected, and writes quality/ai.json held by the ratchet. CI runs only the offline replay.

**Check:** scripts/quality-check.mjs holds quality/ai.json figures; the replay test runs in npm test with no network.

### AI-7 Only the chat-completions wire shape; Anthropic Messages API unreachable

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai-request.ts`, `packages/core/src/ai.ts`.

**Risk:** The request is OpenAI chat-completions with a Bearer header, and the reply is read from choices[0].message.content. The Anthropic API wants POST /v1/messages with x-api-key and anthropic-version. It answers with content blocks. So a model named Claude must sit behind a compatibility proxy.

**Fix:** In Wave 11 add a second request shape in the core, chosen by the endpoint path (/v1/messages). Its headers are x-api-key and anthropic-version. Its body holds model, max_tokens, system, messages and output_config.format for the schema. Read content[].text. Model ids are the user's; show the current ids from the Anthropic models endpoint rather than hard-coding one.

**Check:** ai-request.test.js shape cases for both endpoints; the shown headers name the key by name for both.

### AI-8 No MCP server or SKILL.md exposes the graph format

**Who found it:** AI product and engineering expert. **Where:** `packages/graph-spec/**`, `packages/core/src/claude-gate.ts`, `packages/mcp/**`.

**Risk:** The only agent surface is a mod tool named mcp__thoughtknot__propose inside Claude Code. No other agent, editor or chat can read, check or propose a graph. Waves 18 and 24 each plan their own surface, so the same gate logic will be written three times.

**Fix:** Build the minimum local stdio MCP server from graph-spec and the core now, before Wave 28. Its tools are read_graph(path) through claudeGate, check_changeset(path, block) and propose(path, changes), which writes the change set beside the graph. Notes only under one named folder, and no network. A ten-line SKILL.md then points any host at it, which is most of Wave 23.

**Check:** test/mcp-app.test.js lists the three tools, proves a top-classification note is refused and that propose never touches the graph block.

### AI-9 Planned AI waves are ordered against value and risk

**Who found it:** AI product and engineering expert. **Where:** `requirements/waves.json`, `requirements/workstreams.json`, `requirements/editor-requirements.gql`.

**Risk:** Wave 23 (a Copilot Cowork skill) and Wave 29's remote connector come with the most host-specific code and the least reuse. The local MCP server, structured output and source citation each unlock several waves and are not on the plan as steps of their own.

**Fix:** Reorder the work. First, a local MCP server with the gate. Second, the one text-to-graph contract with schema output and a source span per change. Third, the Claude Code write hook of AI-1. Hold Wave 23 to a SKILL.md over the MCP server. Keep mcp_app_remote as should and after a security review, as written.

**Check:** manual

### AI-10 Text to graph has no quality measure in its plan

**Who found it:** AI product and engineering expert. **Where:** `requirements/editor-requirements.gql`, `test/fixtures/**`, `quality/**`.

**Risk:** The planned tests prove the action is gated, shown and recorded, not that the graph it proposes is right. Without a measure the feature ships on anecdote and a model change can halve its accuracy unnoticed.

**Fix:** Add a requirement text_to_graph_measured. It needs fixtures of prose with an expected graph under test/fixtures/text-to-graph/. It also needs a deterministic scorer (things and links matched by name or alias, source span overlap). Add an optional cheap judge model for property texts. Hold a floor in quality/ai.json.

**Check:** scripts/quality-check.mjs refuses a release when text-to-graph recall or precision drops below the baseline without a reason in quality/accepted.json.

### TRUST-3 The stable release builds and publishes in one job

**Who found it:** Trust model review. **Where:** `.github/workflows/release.yml`.

**Risk:** The release job runs npm ci and npm test while it holds contents, id-token and attestations write. An install script or test could ask for a signing token or change main.js before it is attested. The nightly already builds apart from publishing.

**Fix:** Split the release in two. A job with read access builds and uploads the files. A second job with the write permissions attests and publishes them, running no npm.

**Check:** test/workflows.test.js: no job that runs npm ci or npm test holds id-token, attestations or contents write.

### TRUST-4 GitHub titles and messages reach Claude's pane unfenced

**Who found it:** Trust model review. **Where:** `packages/claude-code/server/editor-changes.ts`, `packages/claude-code/server/github-reader.ts`, `packages/claude-code/server/editor-gate.ts`.

**Risk:** Pull request titles, authors and commit messages are third-party text. They go to the changes view, which Claude reads, with no credential scan and no data fence. Files with no class count as the lowest, so outside files reach Claude too.

**Fix:** Scan item text for credentials and mark it as outside data in the pane, inside the fence of spec_secrets_and_fences. Let the settings give repository files with no class a stricter default.

**Check:** packages/claude-code/test/editor-changes.test.js: a title holding a credential is refused and item text is drawn inside the data fence.

### TRUST-6 Python fill recipes read outside the folder and inject into the query

**Who found it:** Trust model review. **Where:** `python/graph_spec/src/graphspec/engine/documents/fill.py`.

**Risk:** A recipe in a note names files joined onto the vault or the standards folder with no containment check. Its basis id is pasted into the query text. So a note can read or hash any file, and add query syntax.

**Fix:** Resolve each recipe path by real path and refuse one outside its folder. Check the basis id against the id rule, or pass it as a query parameter.

**Check:** python/graph_spec/tests/test_fill.py: a recipe naming ../ or an id with a quote is refused with the reason.

### TRUST-7 Nothing cleans the drawing before it enters the page

**Who found it:** Trust model review. **Where:** `packages/core/src/display/graph-view/drawing-svg.ts`, `packages/claude-code/mod/hooks/register.tsx`.

**Risk:** The engine escapes labels, and that is the only guard. The SVG is put into the live page in Obsidian, which has no content policy, and handed raw to the pane. One escaping bug would run script with full access.

**Fix:** Pass the SVG through an allowlist before it is shown: SVG elements and attributes only, no script, foreignObject, event attributes or links other than in-page.

**Check:** packages/core/test/drawing-svg.test.js: an SVG holding script, an on attribute or a javascript: link is drawn without them.

### TRUST-8 A database import has no size or time limit

**Who found it:** Trust model review. **Where:** `packages/obsidian/src/databases/**`.

**Risk:** The import reads the whole file and runs the query on the main thread with no time limit. It caps rows only once all are in memory. A large file or a looping query hangs Obsidian. Imported values are not held to the note's class.

**Fix:** Refuse a file above the read limit and stop a query after a time limit. Stop reading at the row limit, and scan the values for credentials.

**Check:** packages/obsidian/test/databases.test.js refuses a file over the limit, a looping query and a credential in a value.

### TRUST-9 The Python class reader is looser than the core gate

**Who found it:** Trust model review. **Where:** `python/graph_spec/src/graphspec/engine/documents/classification.py`.

**Risk:** The Python reader takes the first classification line anywhere in the file, not only in front matter, and has no unknown case. So the two readers can give one note different classes.

**Fix:** Read the class only from front matter and refuse an unknown or doubled one, as the core does. Share the fixtures.

**Check:** python/graph_spec/tests/test_classification.py runs the core gate's classification fixtures and agrees on each.

### TRUST-10 git log still reads the repository's own settings

**Who found it:** Trust model review. **Where:** `packages/claude-code/server/note-history.ts`.

**Risk:** The server turns off hooks and fsmonitor, but still reads the vault repository's config. A setting such as log.showSignature with gpg.program could start a program when the history is listed. Untested.

**Fix:** Add -c log.showSignature=false and -c gpg.program= to each git call, or set GIT_CONFIG_GLOBAL and pass only the settings needed.

**Check:** packages/claude-code/test/note-history.test.js: a repository whose gpg.program writes a file lists its history. The file is never written.

### TRUST-11 /graph checks the note, then reads it again to draw

**Who found it:** Trust model review. **Where:** `packages/claude-code/mod/hooks/register.tsx`.

**Risk:** The gate reads the note, then the drawing reads it a second time. Text that changes in between is drawn without being checked.

**Fix:** Read the note once and pass the same text to the gate and to the drawing.

**Check:** packages/claude-code/test/register.test.js: the text drawn is the text the gate saw.

### TRUST-12 The gate settings and the confirmed digest travel in the environment

**Who found it:** Trust model review. **Where:** `packages/claude-code/src/editor-launch.ts`, `packages/claude-code/src/editor-settings-env.ts`.

**Risk:** The server gets its gate settings and the digest of a note the person confirmed through its environment. Another process of the same user can read them, or start the server with its own.

**Fix:** Send the settings and the digest on stdin with the proposer key, and read nothing gate-related from the environment.

**Check:** packages/claude-code/test/editor-launch.test.js: the server's environment holds no gate setting or digest.

### TRUST-13 Shared schemas sent to an AI skip their own class

**Who found it:** Trust model review. **Where:** `packages/core/src/ai-scope.ts`, `packages/obsidian/src/ai/ai.ts`.

**Risk:** The AI scope takes in the vault's shared schemas, but only the class of the note being asked about is checked. A schema kept in a note of a higher class can be sent.

**Fix:** Hold each schema to the class of the note it came from. Leave out one above the ceiling, and show the reason.

**Check:** packages/core/test/ai-scope.test.js: a schema from a note above the ceiling is left out and named.

### LEGAL-3 The iPhone app's encryption has no export answer yet

**Who found it:** Senior security engineer. **Where:** `requirements/editor-requirements.md`, `packages/app/**`.

**Risk:** ios_app keeps notes encrypted with keys in the Keychain, and sync may add more. TestFlight, the App Store and notarising each ask about encryption, and some answers need a report in the US or France. A wrong answer can pull the app.

**Fix:** Before the first TestFlight build, a lawyer confirms the export answer and any report due. Use Apple's own encryption where possible. Set ITSAppUsesNonExemptEncryption to match.

**Check:** A person checks, with a lawyer, before the first TestFlight build. Then a test holds the Info.plist value.

### SEC-17 The desktop app's signing keys sit in the build step on main

**Who found it:** Senior security engineer. **Where:** `.github/workflows/desktop-app.yml`, `scripts/desktop-build.mjs`.

**Risk:** On a push to main the desktop build step holds the Apple certificate and the Linux GPG key, because Tauri signs while it builds. A crate's build script runs in that step and could read them. A pull request build never gets them.

**Fix:** Sign the Linux .deb in a job of its own, which downloads the built file and runs no repository build. Give the macOS keys to the bundling step alone, after the Rust build ends in a step without them.

**Check:** test/desktop-build.test.js: keys reach the build only off pull requests. Each is under its own name, and nowhere else in the job.

## Done or accepted (39)

| Id | Risk | Decision | Closed by |
| --- | --- | --- | --- |
| SEC-1 | Python library runs note guards through eval | done | #614 |
| OPS-1 | One person holds every key, with no written recovery | done | #614, #620 |
| OPS-2 | A tag on any commit becomes a stable release | done | #614 |
| OPS-3 | No written release steps, draft publishing or rollback | done | #614 |
| OPS-4 | Every job without a time limit can hold a runner six hours | done | #614, #620 |
| ARCH-4 | The note format carries no version and has no migration story | done | #1073, #1076 |
| ARCH-11 | The graph spec the code cites is not in the repo | done | #619 |
| ARCH-12 | Plug-in API is one version string for all future extension points | done | #885; kept out by `packages/core/test/plugin-versions.test.js` |
| UX-1 | The 21-item accessibility walk-through has never been recorded or gated | done | #619 |
| UX-6 | The site points to issues that outside users cannot open | done | #615 |
| NEURO-4 | Error text cites spec sections and is shown twice at once | done | #619 |
| NEURO-10 | Renaming a thing does not follow to other notes | done | #1073 |
| FLOW-1 | Docs invite outside pull requests; the settings forbid them | done | #615 |
| FLOW-2 | DCO sign-off is asked for, never checked, and signed by an AI | done | #621 |
| FLOW-3 | Waves 1 to 3 are past, mostly unproved, and never replanned | done | #616 |
| FLOW-7 | README status line is hand-written and already wrong | done | #615 |
| FLOW-8 | AI sessions lack the merge and record rules they need | done | #615 |
| API-3 | Host contract version is a hand-typed number | done | #614 |
| API-5 | Version promise and API changes are never told to users | done | #615 |
| API-10 | Plug-in API version is one string, no host loads third parties | done | #908 |
| API-12 | No runnable examples for either library, none in CI | done | #1083 |
| AI-1 | In Claude Code the proposal route is optional, not mandatory | done | #618 |
| AI-3 | Note text enters prompts with no data boundary or injection test | done | #618 |
| AI-11 | Consent is per send, but residency and retention are unsaid | done | #618 |
| TRUST-1 | Claude can loosen its own gate by editing vault files | done | #836; kept out by `packages/claude-code/test/gate-guard.test.js` |
| TRUST-2 | MultiEdit and other write tools are not hooked | done | #836; kept out by `packages/claude-code/test/data-guard.test.js` |
| TRUST-5 | Any commenter can wake the working-group agent, which writes its own checker | done | #836; kept out by `test/working-group-workflow.test.js`, `test/claude-workflows.test.js` |
| TRUST-14 | Plug-ins run with the host's full powers | done | #882; kept out by `packages/core/test/plugins-isolated.test.js` |
| TRUST-15 | A plug-in given secrets could read every secret, AI keys too | done | #856; kept out by `packages/core/test/plugins-limits.test.js` |
| TRUST-16 | The files ability reaches every note, whatever its class | done | #867; kept out by `packages/core/test/plugins-limits.test.js` |
| SEC-11 | Patterns that run slow on text made for them | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-12 | Comments and tags taken out in one pass | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-13 | A test checked a web address by part of its text | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-14 | A name in a graph could reach an object's prototype | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-15 | Page code built from text without escaping | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-16 | The desktop app's Linux build carries glib 0.18, with a known unsoundness | accepted | Roger, 22 Oct 2026 (decision card on PR #905): No code in the app's dependencies calls VariantStrIter. It is the Linux build only. No fixed glib works with Tauri yet. Undo when Tauri supports GTK 4. |
| LEGAL-1 | The iPhone app names install ways Apple keeps for testers, not the public | done | #1057 |
| LEGAL-2 | No privacy page the apps and the App Store can link to | done | #1062 |
| LEGAL-4 | Notarising signs in with Roger's Apple Account, not a key of its own | done | #1054; kept out by `test/desktop-build.test.js` |
