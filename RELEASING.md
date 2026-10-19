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
