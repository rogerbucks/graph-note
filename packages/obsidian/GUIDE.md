# The Obsidian plugin: where things live

The plugin draws the graphs written in notes (spec §3) and edits them, in place in a drawing's card or in a pane beside
the note (spec §4). What a graph means, its problems, its drawing and its edits come from `@graph-note/core`; this
package puts them on Obsidian's page. It is bundled by `esbuild.config.mjs` into `main.js` at the repository root.

## The source, `src/`

Each module opens with a comment saying what it is for. A feature with several parts has a folder of its own, with one
module that ties the parts together, named as the folder is.

- `main.ts` — the plugin: registers the block processor, the pane, the editor extension, the settings page and the
  command that converts a note to standard GQL; keeps the settings, drafts and shared schemas; opens the editors.
- `block.ts` — one gql block in a note: drawn, or shown as code, never blank; as text with a banner when it is over a
  size or time limit.
- `view-block.ts` — a view (§7): a query block named as a view, drawn as what it picks out of its graph; refused, saying
  what is allowed, outside the view profile; saying so, with Change the view, when it matches nothing; faded or hidden
  outside it as its style says; its looks and legend; Save as shown and Fade or Hide others written in the style graph.
- `style-block.ts` — a style block (§2): never drawn, folded away until opened, saying whose style it is, what it holds
  and how many problems it has. The graph it styles is drawn with its nudges, and its problems listed, by `block.ts`.
- `code.ts` — a block that is not a graph, shown as coloured code; a very long one plain.
- `live-preview.ts` — the editing view's own cards, so the page stays still while a block is typed in.
- `editor.ts` — the comma and the colon added for you in the note's own editor.
- `pane.ts` — the edit pane, which holds a block editor.

### `src/layout-worker/` — the layout kept apart from the interface (spec §9, layout_contained)

- `layout-worker.ts` — `Layouts`: every graph laid out in one Web Worker, started from a Blob URL of main.js's own copy
  of the worker's bundle; on the page's thread, with lower limits, only where the first worker cannot start; each said
  once in the console, as is drawing paused after three layouts in a row fail. Says why it is built so.
- `worker-entry.ts` — what runs inside the worker. `esbuild.config.mjs` bundles it on its own, Graphviz and all, into the
  function `layoutWorker` of the module `graph-note:layout-worker` (typed in `bundled-worker.d.ts`).
- `refusal-banner.ts` — the banner over a graph shown as text because it is too large to read or draw, took too long,
  or drawing is paused: an icon, and the limit and numbers in words.

### `src/properties/` — the inspector's properties, as Obsidian's Properties panel

- `properties.ts` — `renderProperties`: a row for each property, its type menu, and the rows of the lists a thing holds.
- `list-form.ts` — the form that asks for a kind and a relationship when List is chosen.
- `list-row.ts` — a list as chips: the things linked to this one, each removed with its x, and a field to add a value.
- `menu-place.ts` — where a property's type menu is shown: under its icon, or above it when the window has no room below.

### `src/export/` — export (spec §16)

- `export.ts` — `exportGraph`: the scope read from the note as it is now, the core's plan (nothing to export, a
  question first, or go), the image in fixed colours with its frame, written safely into the vault through its API with
  its companion note when set; on a phone, offered to the share sheet instead.
- `export-form.ts` — the Export form on a drawing: the whole diagram, or a view with or without its faded context; SVG
  or PNG; light or dark; and Export anyway when the note's classification asks first.
- `png.ts` — a PNG of the SVG drawn on a canvas at twice natural size or more; one larger than a phone's canvas holds is
  refused, with the SVG suggested.
- `classification.ts` — a note's classification however its front matter writes it (any key case, a word, a number, a
  list's highest), and from its own text before the metadata cache has indexed it.
- `vault-write.ts` — writing through the vault's API: a name of its own for each export, so none is overwritten; the
  plugin's own temporary file deleted outright on a failure, never left in the vault or its trash.

### `src/settings/` — the settings page (spec §21)

- `settings.ts` — `GraphNoteSettingTab`: one page in Obsidian's plugin settings, in its declarative form, built from the
  core's `OPTIONS` so every option is on it with its sentence: strictness and the departures Simplified allows, with
  the action that converts a note to standard GQL; the classifications; formatting; drawing.
- `ai-models.ts` — the AI models of §19 as a list, a page for each: name, purpose, ceiling, model, endpoint, and its key
  chosen in the app's own secret store by name, so only the name is saved.

### `src/graph-view/` — a drawn graph

- `graph-view.ts` — `GraphView`: the card, its zoom and full screen; ties the rest together.
- `view-bar.ts` — the bar: problems badge, Fit, zoom, Full screen, Export, Edit here, Edit in pane, Source.
- `problems-list.ts` — the problems behind the badge, grouped when many, and the completeness report.
- `drawing-svg.ts` — the SVG put in the card, each box and link reachable by keyboard and named.
- `taps.ts` — what a tap or a key lands on, and the nearest things to a tap.
- `details-panel.ts` — the details of a box or link, and the inspector while the block is edited.
- `parked.ts` — things parked for later (§5, §8): each drawn dashed with a "⏳ later" or "⏳ overdue" mark on the SVG
  Graphviz drew, so the layout stays the Python library's; listed behind the badge, which counts them apart from
  problems; and Park for later in a box's details while the block is edited, writing the Deferred into its text. In a
  locked graph whose schema lacks Deferred and DEFERS, the refusal offers "Declare Deferred and DEFERS in the schema",
  which writes them (`BlockNote.declareDeferred`: into the text being edited when the schema is in that block, else
  through `vault.process`) and then parks, with what was typed in the form kept. The form is checked first, so nothing
  is declared for a park that would fail, and a second press does nothing. Declarations written into another block are
  not undone with the park.
- `view-maker.ts` — making a view by tapping (§7), while the block is edited: the kind of view, the boxes tapped, its
  reading said as it is built, and Write the view, a view block after the graph's last block.
- `view-strip.ts` — a view's card: its reading in plain English, Fade or Hide others, Save as shown, the legend, and what
  is outside it faded and its looks drawn on the drawing.
- `walk.ts` — walked paths (§7): the strip below the bar with Play for each path in the note, stepping one thing at a
  time, marked and said; a path with no steps said to have none; and, while the block is edited, Record, which numbers
  each box as it is tapped and writes the path into the text.
- `suggested-name.ts` — a box drawn under a suggested name: what screen readers hear of it, where it is written in the
  block being edited, and in its details its suggested name with the one-click fix that writes it.
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

- `test/host/` — the stand-ins for the host and what the tests share: `fake-dom.js` (a small DOM), `fake-settings.js` (the settings page, drawn from its definitions, and the secret
  store), `fake-obsidian.js`
  (the obsidian module and CodeMirror), `load-plugin.js` (building and loading the plugin), `cascade.js` (the part of
  the CSS cascade a test needs), `notes.js` (a fenced block, a button by its label), and the notes each group of tests
  opens: `card-notes.js`, `pane-notes.js`, `view-notes.js`, and `inspector-steps.js` (opening a box's details and driving the inspector's rows, menus and chips).
  `workers.js` stands in a browser's Worker: each runs the code main.js hands it, from its Blob URL, in a real thread.
  `fake-vault.js` stands in the vault's ways of making files (create, modify, rename, delete, a folder), one of which
  can be made to fail as a full disk would, and the metadata cache's front matter.
- `test/device-checklist.md` — what is checked by hand on the devices. Every item has a number that never changes
  (`V-03`: its section's letter and two digits), and each item after Before has a note in `test-vault/Device checks/`
  that shows the case on a graph to try it on; `test/device-check-notes.test.js` (repository root) holds the two together.

## The harness, `harness/`

A browser page that loads the plugin against a shim of Obsidian, to see and try it outside Obsidian.
