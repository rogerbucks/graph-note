# The Obsidian plugin: where things live

The plugin draws the graphs written in notes (spec §3) and edits them, in place in a drawing's card or in a pane beside
the note (spec §4). What a graph means, its problems, its drawing and its edits come from `@graph-note/core`; this
package puts them on Obsidian's page. It is bundled by `esbuild.config.mjs` into `main.js` at the repository root.

## The source, `src/`

Each module opens with a comment saying what it is for. A feature with several parts has a folder of its own, with one
module that ties the parts together, named as the folder is.

- `main.ts` — the plugin: registers the block processor, the pane and the editor extension; keeps drafts and shared
  schemas; opens the editors.
- `block.ts` — one gql block in a note: drawn, or shown as code, never blank.
- `code.ts` — a block that is not a graph, shown as coloured code.
- `live-preview.ts` — the editing view's own cards, so the page stays still while a block is typed in.
- `editor.ts` — the comma and the colon added for you in the note's own editor.
- `pane.ts` — the edit pane, which holds a block editor.

### `src/properties/` — the inspector's properties, as Obsidian's Properties panel

- `properties.ts` — `renderProperties`: a row for each property, its type menu, and the rows of the lists a thing holds.
- `list-form.ts` — the form that asks for a kind and a relationship when List is chosen.
- `list-row.ts` — a list as chips: the things linked to this one, each removed with its x, and a field to add a value.

### `src/graph-view/` — a drawn graph

- `graph-view.ts` — `GraphView`: the card, its zoom and full screen; ties the rest together.
- `view-bar.ts` — the bar: problems badge, Fit, zoom, Full screen, Edit here, Edit in pane, Source.
- `problems-list.ts` — the problems behind the badge, grouped when many, and the completeness report.
- `drawing-svg.ts` — the SVG put in the card, each box and link reachable by keyboard and named.
- `taps.ts` — what a tap or a key lands on, and the nearest things to a tap.
- `details-panel.ts` — the details of a box or link, and the inspector while the block is edited.
- `placement.ts` — where a card is: read-only in reading view; waiting for a card to be put on the page.
- `view-options.ts` — what a drawing is given.

### `src/block-editor/` — the text of one graph block, in the pane or in place

- `block-editor.ts` — `BlockEditor`: ties the parts together; the field and what typing in it does.
- `editor-layout.ts` — the editor's parts on the page, built once for each block.
- `block-note.ts` — the note behind the editor and its session: opening, writing, undo, Lock, drafts.
- `note-writing.ts` — writing safely, through the note's editor or the vault.
- `kept-field.ts` — the field's focus and scroll, kept through each redraw.
- `typing-keys.ts` — what typing does: Tab and Enter for the inline match or a suggestion, Escape to put it away, undo and
  redo keys.
- `inline-completion.ts` — the inline match: the best completion for the caret, shown as ghost text, written only when taken.
- `editor-history.ts` — the text's own undo history in the field.
- `added-for-you.ts` — the comma and the colon added as you type, and a closer typed where it is already there stepped over.
- `text-help.ts` — the help beside the text, from what was read.
- `text-picture.ts` — the coloured picture under the field, with the inline match as ghost text where the caret is.
- `problem-help.ts` — the problems list, the fixes on the caret's line, the announcements.
- `suggestions.ts` — the suggestions bar.
- `kept-draft.ts` — the draft banner: what was typed, never lost.
- `pane-drawing.ts` — the pane's own drawing of what is typed.

## Tests, `test/`

The tests load the built `main.js` in Node against stand-ins for the host. Each test file is named after the module or
folder it tests — `graph-view-zoom.test.js` tests zooming in `src/graph-view/`, `pane-writing.test.js` writing from the
pane — or, when it spans modules, is listed in `CONTRIBUTING.md`. Run one with `node --test test/<file>` from this
package, or all with `npm test` from the repository root. Each builds `main.js` first.

- `test/host/` — the stand-ins for the host and what the tests share: `fake-dom.js` (a small DOM), `fake-obsidian.js`
  (the obsidian module and CodeMirror), `load-plugin.js` (building and loading the plugin), `cascade.js` (the part of
  the CSS cascade a test needs), `notes.js` (a fenced block, a button by its label), and the notes each group of tests
  opens: `card-notes.js`, `pane-notes.js`, `view-notes.js`, and `inspector-steps.js` (opening a box's details and driving the inspector's rows, menus and chips).
- `test/device-checklist.md` — what is checked by hand on the devices.

## The harness, `harness/`

A browser page that loads the plugin against a shim of Obsidian, to see and try it outside Obsidian.
