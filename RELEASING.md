# Releasing

What is done by a person for each release, beyond what CI proves. The automated checks (the suite, the quality ratchet,
the licence and notice checks) are in [CONTRIBUTING.md](CONTRIBUTING.md); the device checklist for Obsidian is
`packages/obsidian/test/device-checklist.md`. This page holds the walk-through that finds what an automated check cannot.

## Nightly builds and stable releases

There are two channels.

**Nightly**: `.github/workflows/nightly.yml` builds main each night at 16:00 UTC (2 am in Brisbane). It also builds when
run by hand, if main moved since the last one. It runs the full suite and publishes only if every test passes. It
publishes a GitHub pre-release named for the next patch and the day (`0.6.1-nightly.20261018`, from
`scripts/nightly-version.mjs`), keeping the last seven.

The nightly skips the quality ratchet and the walk-through below. So it is for those who want the newest work: in
Obsidian, BRAT with pre-releases on follows it. A pre-release never counts as a release: the build status and the wiki
leave it out.

**Stable**: a bare version tag on main, through `release.yml`, with every check on this page.

Both channels attach the JavaScript library as two packages: `thoughtknot-graph-spec-<version>.tgz` (the reader,
checker and layout) and `thoughtknot-core-<version>.tgz`. They are installed from the release's URL, never from npm.
A stable release's notes open with its changelog, written by `scripts/changelog.mjs`.

## Cutting a release

Roger pushes the tag and publishes the release. Claude can prepare every step before the tag, but cannot push a tag.

1. **Bump the version.** On a new branch from main, run `npm run release:prepare -- X.Y.Z`. It writes the version into
   `manifest.json`, `versions.json`, every `package.json`, the mod's `plugin.json`, `pyproject.toml` and both lockfiles.
   Open a pull request with the change.
2. **Run the dry run.** Run the "Release check (dry run)" workflow on main by hand. It runs every check the release
   waits on. A failure here costs no version number.
3. **Merge the bump.** Merge the latest main into the bump's pull request first, then merge it once CI is green.
4. **Walk the accessibility checks** below, on the build to be released.
5. **Push the tag** on the merge commit, from an up-to-date main:
   `cd ~/Dev/thoughtknot && git checkout main && git pull && git tag X.Y.Z && git push origin X.Y.Z`.
   The release's first job stops in seconds if the commit is not on main, or the tag is not the manifest version.
6. **Publish the draft.** `release.yml` makes a draft release with the assets and the notes. Read the notes, then
   publish it. The nightly fails while a draft has waited more than a day, so a forgotten draft is seen.

## Going back

A release is never taken back by rewriting history. A bad release is followed by a patch release with the fix, cut as
above.

- **Still a draft:** delete the draft and keep the tag. The fix takes the next version number.
- **Already published:** mark it as a pre-release on GitHub, so Obsidian and BRAT stop offering it. Say why in its
  notes.
- **Never move or reuse a tag.** People rely on a version naming one commit.

## Keys and recovery

Everything a successor would need if Roger could not act. None of the values are written here, only where they live.

| Key or account | What it does | Where it is made | Expires | If it is lost |
| --- | --- | --- | --- | --- |
| `PROJECT_TOKEN` (repository secret) | Lets the project mirror and the build status write the "ThoughtKnot requirements" board. A classic token with the `project` and `public_repo` scopes. | Roger's GitHub account, Settings, Developer settings, Personal access tokens (classic). | 15 Oct 2027. | Make a new token with the same scopes, and set it as the secret. The mirror and the build status warn, and do not fail, while it is missing. |
| `CLAUDE_CODE_OAUTH_TOKEN` (repository secret) | Lets the Claude review comment on pull requests. | `claude setup-token`, by Roger, on his machine. | Not known. Rotate it if the review starts failing to authenticate. | Run `claude setup-token` again and set the secret. The review passes with a notice while it is missing. |
| `SECURITY_ALERTS_TOKEN` (repository secret, optional) | Lets the release and the daily Security workflow read Dependabot and secret scanning alerts, which the workflow's own token may not. A fine-grained token for this repository alone, read only: "Dependabot alerts", "Secret scanning alerts" and "Code scanning alerts". | Roger's GitHub account, Settings, Developer settings, Fine-grained tokens. | The date set when it is made; a year at most. | Make a new one with the same access, and set it as the secret. While it is missing, both name the lists as not read, and npm audit and OSV still check the lock files. |
| The `rogerbucks` GitHub account | Owns the repository, its ruleset, its Pages site and its releases. It is the only admin. | GitHub. | Never. | Recovery codes and a second factor, kept by Roger. |
| The domains `thoughtknot.app` and `thoughtknot.dev` | The home page on GitHub Pages, and the redirect to it. | Cloudflare, in Roger's account. | Every year on 18 October. | Renew at Cloudflare. Pages reads the domain from the repository's Pages settings. |

**The repository's settings are kept in code.** `node scripts/public-readiness.mjs --settings` compares GitHub's
settings with the wanted ones. `--settings --apply` sets each one that differs. An admin runs it with the GitHub CLI.

**There is one admin, by choice** (Roger, 19 Oct 2026). Until a second is named, nobody else can publish a release,
change the ruleset or rotate a key. Roger will add a second admin, or move the repository to an organisation with two
owners, once the project has traction.

## Known risks, every release

An expert panel reviewed the project on 19 Oct 2026. Its roles: security, operations, code and tests, architecture and
data, user experience, neurodiversity and data management, workflow and community, the APIs, and AI. What it found is in
`quality/risks.json`, drawn as [RISKS.md](RISKS.md). Each risk carries the owner's decision: fix now, fix later in a
named wave, or accept with a reason.

The release and its dry run run `node scripts/risk-register.mjs --release`. It stops the release while:

- a risk marked **fix now** is still open;
- a **fix later** risk is open past the end of its wave in `requirements/waves.json`;
- an open risk's files changed (it is **stale**) and no one has looked at it for 30 days;
- the version starts a new line (0.7 to 0.8) and the full panel has not looked since the last one.

A stale risk younger than 30 days is a warning in the log, with the day it starts to block. It is cleared by looking
again. Then run `node scripts/risk-register.mjs --reviewed ID`, which stamps today and the commit. A fixed risk gets
`status: done` and its pull request in `done_in`. A new decision is a pull request that edits the register and runs
`--write-report`; `test/risk-register.test.js` holds the page to the register.

### When the panel runs

- **Before every stable release**, after the dry run: the **Risk panel** workflow (`risk-panel.yml`), by hand. It reads
  only what moved since the last stable tag, spends a Claude session only when something did, and writes one issue
  labelled `risk-panel`. The owner turns the issue into register entries. The nightly never needs it.
- **Before a release that starts a new version line** (0.8.0, 0.9.0, 1.0.0): the same workflow with "every role" on.
  All nine roles then read the whole project. Decide its findings, then run `node scripts/risk-register.mjs --full-panel`,
  which records the date, commit and version. Until then the release fails.
- **Never on a schedule**: a timer would spend a Claude session on days nothing moved.

## Security alerts, every release

**No release goes out with an open security alert** (Roger, 20 Oct 2026). The release, its dry run and the nightly each
run `node scripts/security-alerts.mjs`, in a job that installs nothing. It reads five lists:

| List | Read with | Stops a stable release | Stops a nightly |
| --- | --- | --- | --- |
| Code scanning (CodeQL) | The workflow's own token | Any open alert, or the list not read | High or critical |
| Dependabot | `SECURITY_ALERTS_TOKEN`, or the workflow's token | Any open alert | High or critical |
| Secret scanning | `SECURITY_ALERTS_TOKEN` | Any open alert (always critical) | Yes |
| npm audit, over `package-lock.json` | No token | Any advisory | High or critical |
| OSV, over `python/graph_spec/uv.lock` | No token | Any advisory | High or critical |

The only way past an alert is to fix it, or to accept it in `quality/risks.json`. An accepted risk names the alert in
its `alerts` list, with `accepted_by` and `accepted_reason`.

### Each day

The **Security** workflow (`security.yml`) runs at 06:00 UTC. It keeps one issue labelled `security` up to date, and
closes it when nothing is open. The repository is public, so the issue names each alert by key, severity and link
alone. The link opens only for the maintainer.

When an alert is not yet planned, its `fix` job asks Claude to fix it. Claude pushes one branch for each alert, named
`security/...`. It opens no pull request and never touches main. A daily Claude routine opens a draft pull request for
each branch, so CI runs, and drives it to green. Roger approves it as any other.

### Each fix keeps its kind out for good

A fix to a security risk raised from 20 Oct 2026 carries three things:

1. **A test** that fails on the old code and passes on the fix.
2. **A rule** that stops the same kind of problem anywhere: a lint rule, a CodeQL query or a check in `scripts/`.
3. **A risk** in `quality/risks.json`: the alert in `alerts`, and the test and the rule in `prevented_by`.

`node scripts/risk-register.mjs --check` fails a fixed security risk that names no rule, or names a file that is gone.
So deleting a rule stops the release until a person puts it back or replaces it.

### Each change, before it merges

GitHub's code scanning stops a pull request only for a problem the pull request adds. So CI's `code-scan` job runs the
same scan on all the code, and `scripts/code-scan.mjs` fails on any security problem it finds (#849). Its log names
each kind and how many, never the file or the line, as the repository is public.

To see where, run the scan yourself:

1. Download `codeql-bundle-linux64.tar.zst` from the `github/codeql-action` releases, and unpack it.
2. `codeql database create db --language=javascript --source-root .`
3. `codeql database analyze db codeql/javascript-queries:codeql-suites/javascript-code-scanning.qls
   --format=sarif-latest --output=out/javascript.sarif`
4. `node scripts/code-scan.mjs out`, or open the file. Built files such as `main.js` are not in a checkout, so leave
   them out of the folder you scan.

## Accessibility walk-through, every release

The spec (§11) says every interface, in every host, meets WCAG 2.2 Level AA. A new host meets it before its first
release.

`test/wcag.test.js` checks every view and page in light and dark. It checks axe-core's rules for WCAG 2.0 to 2.2, A and
AA, and the contrast of all text. It runs in a DOM with no layout and no paint, so it cannot see the items below.

**Walk them by hand on the build to be released, in each host, in the light theme and the dark.** Record it in
`test/walkthroughs/<version>.md`, and commit it before the tag:

1. Run `node scripts/walkthrough-record.mjs --new`. It writes an empty record for the version in `manifest.json`: the
   build, the day, and every check under each host and theme.
2. Walk each check. Tick it (`- [x] AX-05`), or leave it unticked with its reason after a dash
   (`- [ ] AX-14 — not on a desktop: this check is for a phone`).
3. Write your name after `- By:`.

The release and its dry run run `node scripts/walkthrough-record.mjs --release` first (UX-1). It fails while the record
is missing, a host or theme is not walked, or a check is unticked with no reason. A failure stops the release until it is
fixed or the reason it stays is written down.

The hosts: Obsidian on a desktop, Obsidian on a phone, and the browser editor's page (opened from Claude Code). A host added
later is added to this list in the pull request that adds the host, and walked before its first release.

### With the keyboard only (no mouse, no touch)

Use a note with the graph guide's example, a problem in one graph, and an empty graph block.

- [ ] **AX-01** Tab reaches every control of the card, the details, the edit pane, the settings page and the page's Export form.
      It goes in an order that follows the picture (SC 2.4.3). It never leaves the view or traps the focus (SC 2.1.2).
- [ ] **AX-02** The focus is always visible. It is at least as clear as 2 pixels of line or a change of 3 to 1 against what is
      next to it. It is never hidden behind the details sheet or a menu (SC 2.4.7, 2.4.11, 1.4.11).
- [ ] **AX-03** Every action of the editor can be done from the keyboard (SC 2.1.1). That covers choosing a thing and a link and
      moving along links. It covers the trail's Back and Forward, Fit and zoom, opening and closing the details, editing and Export.
- [ ] **AX-04** Nothing needs a drag: every move made by dragging can also be made by a single press or by typing (SC 2.5.7).
- [ ] **AX-05** Escape closes the details sheet, a menu or a form. The focus goes back to where it was (SC 3.2.2, 2.4.3).
- [ ] **AX-06** Keys typed in the note are never taken by the drawing. No single-character shortcut works while a text field
      has the focus (SC 2.1.4).

### With a screen reader

VoiceOver on macOS and on iOS; NVDA on Windows where one is at hand. Turn the display off or look away.

- [ ] **AX-07** Every control is announced with a name and a role that say what it does. A toggle says whether it is on
      (SC 4.1.2, 1.3.1).
- [ ] **AX-08** The graph is available as text. Its sentences are read in order, with each link said in words. The picture is
      not read twice (SC 1.1.1, 1.3.1; the text version of the graph, §11).
- [ ] **AX-09** What changes without a move of the focus is announced (SC 4.1.3). That means a problem found or fixed, the
      details opening, a notice, or an export finished.
- [ ] **AX-10** Every field in the settings page and the properties form is announced with the name of its row. Its
      description is read with it (SC 1.3.1, 3.3.2).
- [ ] **AX-11** An error says what is wrong and how to put it right. It says so in words, not by colour or a sign alone
      (SC 3.3.1, 3.3.3, 1.4.1).
- [ ] **AX-12** The page's language and title are read. Its headings give the way round the note (SC 3.1.1, 2.4.2, 2.4.6).

### Looking and touching

- [ ] **AX-13** Lines, borders and icons that carry meaning are 3 to 1 or better against their background in both themes
      (SC 1.4.11). These are the box outlines, the link arrows, the field borders and the focus ring. Check them with a
      colour picker.
- [ ] **AX-14** On a phone every target is 24 by 24 CSS pixels at least. The details sheet's buttons are 44 points (SC 2.5.8).
- [ ] **AX-15** At a window 320 CSS pixels wide, or at 400% zoom, nothing is lost. Nothing needs scrolling in two directions,
      except the drawing itself (SC 1.4.10). CI holds AX-14 and AX-15 on the harness and the browser page
      (test/a11y-targets-reflow.test.js); this is Obsidian itself, on a phone.
- [ ] **AX-16** Raise the text spacing and set the text size to 200%: nothing is cut off or overlaps (SC 1.4.12, 1.4.4).
      The spacing is line height 1.5, paragraph spacing 2, letter spacing 0.12 and word spacing 0.16, all times the font size.
- [ ] **AX-17** With the system set to reduce motion, no movement plays. Nothing flashes more than three times a second
      (SC 2.3.1, 2.2.2; the motion rules of §11).
- [ ] **AX-18** Nothing is said by colour alone (SC 1.4.1). Kinds of thing, problems, the chosen thing and a link that is
      estimated each also differ by a shape, a word or a line style.
- [ ] **AX-19** Pointer: a press that can be undone is done on release, not on press. A tooltip can be reached, held and
      dismissed (SC 2.5.2, 1.4.13).

### In the test languages

Open the browser editor's page with the browser's language set to `en-XA`, then to `ar-XB` (the test languages of
`packages/core/src/pseudo-words.ts`). `test/pseudo-locales.test.js` checks the words and the direction of every view in a
DOM with no layout; this checks what it cannot see.

- [ ] **AX-20** In `en-XA` no longer word is cut off, overlaps another part, or pushes a control out of its view.
- [ ] **AX-21** In `ar-XB` the page and the details mirror, the drawing does not, and the arrow keys still move the way the
      drawing shows.

## What a failure leaves

A fault found here becomes a test that fails first. It goes in `test/wcag.test.js` where it can be seen there, or in a
case in the host's own tests where it cannot. It is fixed in the same pull request. Only then is the release built.
