# Spike: the Obsidian view in a browser, for Claude Code

Proves whether the Obsidian plugin's own view can run as a page in the Claude Code desktop app's browser pane, on a real
note on the Mac, with its edits written back. Spike code: not a package, nothing released. 11 Oct 2026.

## Verdict: yes

- **The whole view runs**, unchanged, against the harness's shim of Obsidian: the bar (problems badge, Fit, zoom, full
  screen, Edit here, Edit in pane), the themed drawing, tapping a box for its details, and the edit pane with its block
  picker, Undo, Redo, Lock, problems, drawing and text.
- **Edits reach the note.** Fixing the sample note's typo in the pane's text wrote exactly that one line to
  `test-vault/Sample graph note.md`, every other byte kept, and every problems badge turned to "No problems".
- **The server is closed to everything but this machine**: it listens on 127.0.0.1 only; a request naming another Host
  is refused (403, DNS rebinding), an API call without the token is refused (401), and a path outside the folder or not a
  `.md` note is refused (400). Through `tailscale serve`, only the one Tailscale login named is let in (not tried here:
  that needs the machine's Tailscale set up).

## Findings

- **The harness shim lags the plugin.** Main's settings import `PluginSettingTab` and `SecretComponent`, and `onload`
  calls `addCommand`, which the shim lacks, so `packages/obsidian/harness/build.mjs` fails on main. `obsidian-shim.js`
  here adds them; the harness needs the same.
- **Icons show as their names** (`panel-right-open`): the shim has no icon set. Cosmetic; a real host would bundle
  Obsidian's Lucide icons or its own.
- **Theme:** the page uses the harness's light colours; a real host would follow `prefers-color-scheme`, as the
  Claude Code pane now does (rogerbucks/graph-note#62).
- **What a real host needs beyond this:** `/graph` starting the server (`$.process.spawn`) and opening the page; the
  folder named by the session; a note changed on disk while open (by Claude or Obsidian) drawn again; one server per
  machine; and Tailscale serve set up by the vault session.

## Run it

```bash
node spikes/browser-view/build.mjs
```

```bash
node spikes/browser-view/server.mjs test-vault
```

Open the printed address with `?path=Sample%20graph%20note.md` before the `#token=…`. Run
`node scripts/reset-test-vault.mjs` afterwards.
