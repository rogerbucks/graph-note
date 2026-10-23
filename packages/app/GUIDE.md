# The desktop app: where things live

The standalone app (spec §41, `standalone_app`) is the browser editor in a Tauri v2 window, over a plain folder of
notes. It works offline on macOS, Windows and Linux. The same window will carry the iPhone app later (`ios_app`).

There is no server inside. The window runs the browser editor's page from the Claude Code host unchanged. The page's
calls are answered in the window itself, from the folder the person picked. So there is one editor page for the
browser and the app, and nothing to port to Rust but seven small folder commands.

## How it fits together

```
window (WebKit, WebView2 or WebKitGTK)
  index.html + app.js        pick a folder, list its notes
  editor.html                the browser editor's page (packages/claude-code/page)
    app-editor.js            answers the page's /api/ calls (src/app-api.ts)
      core storage           workspaceStorage (packages/core/src/workspace-storage.ts)
        tauriFiles           the seven commands, through Tauri's invoke (src/tauri-files.ts)
Rust (src-tauri/)
  lib.rs                     the window, the picked folder, the seven commands
  place.rs                   every path checked to stay inside the folder
```

## The source, `src/`

- `app-api.ts`: `appFetch`, a `fetch` that answers the editor's `/api/` calls from the folder's notes.
  - A note's id is its path in the folder.
  - A write names the version it was typed against. It is refused (409) when the note changed, with the note as it now
    is, and what was sent is kept as the note's draft.
  - The change stream sends the note, then reads it again every 2 seconds (`FOLLOW_EVERY_MS`) for changes made by
    other programs.
  - An export goes beside the note. Its files are written as new files, never over a file (`saveNew`).
  - Earlier versions and GitHub reviews are refused in words for now (`app.not-yet`).
- `tauri-files.ts`: `tauriFiles` and `tauriStorage`. The core's workspace storage over the folder commands. Also
  `tauriSaveNew`, which writes an export. `invoke` is handed in, so nothing here imports Tauri.
- `app-start.ts`: the first page. Pick a folder with the system's dialog, then each note is a link into the editor.
- `app-editor.ts`: runs before the editor's page. It installs `appFetch` and adds a link back to the list.

## The Rust, `src-tauri/`

- Seven commands, and no others: `pick_folder`, `read_dir`, `read_text`, `write_text`, `remove_file`, `make_dir`,
  `write_new`. The same seven are named in `lib.rs`, `build.rs` and `capabilities/default.json`. A test holds the three lists together.
- `place.rs` refuses any path that climbs out, starts at a root, names a hidden part (such as `.git`), or reaches
  outside through a link. A note is written to a new file beside it, then renamed over it.
- `write_new` writes an export only as new files. A name taken gets the next number. All of the files or none.
- The window's policy (`tauri.conf.json`) allows only the app's own pages and Tauri's calls. No other origin.
- `thoughtknot-app <folder>` opens that folder without asking. The end-to-end check uses this.
- The crates are pinned to exact versions. `Cargo.lock` is committed.

## Build and run

```
npm run build --workspace packages/app        # the window's files, into packages/app/dist
cd packages/app/src-tauri && cargo build      # first: see below
cd packages/app/src-tauri && cargo test       # the folder checks
cd packages/app/src-tauri && cargo run -- path/to/notes
```

Build before `cargo test` on a fresh checkout. `cargo test` compiles the library twice at once, and both copies pack
the window's files into one folder. One can take in a file the other is still writing, such as `page.js`. The app
then cannot unpack it, and serves its first page in its place.

On Linux the build needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`). The tests in `test/` run with the rest of the
JavaScript suite and need no Rust. `test/app-window.js` runs the built window in a DOM, over a real folder. The
first-run journey (`test/repository/journey-app.js`) and the WCAG check (`test/wcag.test.js`) use it.

## The real app, tested

`test/standalone-app.test.js` starts the built app on a folder and drives it through tauri-driver. It lists the
notes, opens one, draws it, writes an edit to disk, and checks that the window refuses any other address. It skips
with one line where there is no app, driver or display.

The desktop app workflow (`.github/workflows/desktop-app.yml`) builds the app and runs `cargo test` on Linux, macOS
and Windows. On Linux it also runs that test under a virtual display. tauri-driver has no macOS driver, so macOS and
Windows are built and tested, not driven.

```
cargo install tauri-driver --locked --version 2.1.0
cd packages/app/src-tauri && cargo build && cd ../../..
xvfb-run -a npm run test:ai -- test/standalone-app.test.js
```

## Installers

The same workflow builds an installer on each system and keeps it as a download of the run:

- macOS: a `.dmg`;
- Windows: an NSIS setup `.exe`;
- Linux: a `.deb`.

They are signed where Roger has set the keys: macOS signed and notarised, and the `.deb` with a `.asc` GPG signature
beside it. Windows is not signed (Roger, 23 Oct 2026). A pull request build is never signed. How to get each key, and
what it costs: [docs/app-signing.md](../../docs/app-signing.md).

An unsigned app makes macOS and Windows warn the first time it opens. On a Mac, right-click the app and choose Open.
On Windows, choose "More info", then "Run anyway". The `.deb` uses the system's own WebKitGTK and carries none of it.
A Linux package that carries WebKitGTK waits for the licence check named in `licences/bundled.json`.

```
cargo install tauri-cli --locked --version 2.12.4
npm run build --workspace packages/app
cd packages/app/src-tauri && cargo tauri build      # the installer, in target/release/bundle/, unsigned
```
