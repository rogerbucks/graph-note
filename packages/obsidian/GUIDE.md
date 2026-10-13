# The Obsidian plugin: where things live

The plugin draws the graphs written in notes (spec §3) and edits them, in place in a drawing's card or in a pane beside
the note (spec §4). What a graph means, its problems, its drawing and its edits come from `@graph-note/core`; this
package puts them on Obsidian's page. It is bundled by `esbuild.config.mjs` into `main.js` at the repository root.

## The source, `src/`

Each module opens with a comment saying what it is for. A feature with several parts has a folder of its own, with one
module that ties the parts together, named as the folder is.

- `main.ts` — the plugin: registers the block processor, the pane, the editor extension, the settings page and the
  command that converts a note to standard GQL; keeps the settings, drafts and shared schemas; opens the editors.
- `inline-editors.ts` — the editors open in place: each found by its block's identity, never by another block that comes
  to its line, even one of the same graph; one to a block, however often Edit here is pressed; released, its typing
  written, when it is off the page and its note is closed, whether a card left or the editing view closed; never kept
  when its opening fails, for any reason, logged and said, or finds nothing, the note gone or without a graph block.
- `drafts.ts` — the drafts kept in the plugin's data, each with an id given once and never again, by which every change
  finds it, a random UUID however old the web view; its key, note and graph, only says whose it is. Drafts kept before
  ids are given one when the plugin loads, saved at once, so they keep it from one load to the next. They move
  with their note when it is renamed, edited or not, ids unchanged, beside, never over, a draft kept under the new name;
  and Recover kept drafts into a new note, the command that writes every one, once, a deleted note's among them, into a
  note, and says so when that note cannot be written.
- `block.ts` — one gql block in a note: drawn, or shown as code, never blank; as text with a banner when it is over a
  size or time limit.
- `view-block.ts` — a view (§7): a query block named as a view, drawn as what it picks out of its graph; refused, saying
  what is allowed, outside the view profile; shown as its query under the banner when its note is too large to read;
  saying so, with Change the view, when it matches nothing; faded or hidden
  outside it as its style says; its looks and legend; Save as shown and Fade or Hide others written in the style graph.
- `style-block.ts` — a style block (§2): never drawn, folded away until opened, saying whose style it is, what it holds
  and how many problems it has. The graph it styles is drawn with its nudges, and its problems listed, by `block.ts`.
- `code.ts` — a block that is not a graph, shown as coloured code; a very long one plain.
- `live-preview.ts` — the editing view's own cards, so the page stays still while a block is typed in; each block keeps
  its identity however lines move above it, so its card, and the editor in place in it, survive the move; each card's
  last height kept by its note and line, for the blocks the note has now.
- `editor.ts` — the comma and the colon added for you in the note's own editor.
- `pane.ts` — the edit pane, which holds a block editor.
- `reading-view.ts` — reading view never changes the note: `noteToRewrite`, which every command rewriting a note asks
  first, gives the note in the pane in front, or refuses with a notice when that pane is in reading view or holds no note;
  `stillToRewrite`, asked again just before the write, refuses the same way when that pane changed while the note was read.

### `src/layout-worker/` — the layout kept apart from the interface (spec §9, layout_contained)

- `layout-worker.ts` — `Layouts`: every graph, and every export, laid out in one Web Worker, started from a Blob URL of main.js's own copy
  of the worker's bundle; on the page's thread, with lower limits, only where the first worker cannot start; each said
  once in the console, as is drawing paused after three layouts in a row fail. Says why it is built so.
- `worker-entry.ts` — what runs inside the worker. `esbuild.config.mjs` bundles it on its own, Graphviz and all, into the
  function `layoutWorker` of the module `graph-note:layout-worker` (typed in `bundled-worker.d.ts`).
- `refusal-banner.ts` — the banner over a graph shown as text because it is too large to read or draw, took too long,
  or drawing is paused: an icon, and the limit and numbers in words.
- `refusal-words.ts` — those words, with no Obsidian in them, in two voices: the banner's, and the notice of an export
  stopped for the same reason ("what happened: why. Nothing was saved. What to do."), and for a layout that failed (the
  worker or its engine raised an error: its reason is put in brackets).

### `src/properties/` — the inspector's properties, as Obsidian's Properties panel

- `properties.ts` — `renderProperties`: a row for each property, its type menu, and the rows of the lists a thing holds.
- `list-form.ts` — the form that asks for a kind and a relationship when List is chosen.
- `list-row.ts` — a list as chips: the things linked to this one, each removed with its x, and a field to add a value.
- `menu-place.ts` — where a property's type menu is shown: under its icon, or above it when the window has no room below.

### `src/export/` — export (spec §16)

- `export.ts` — `exportGraph`: the scope read from the note as it is now, the core's plan (nothing to export, a
  question first, or go), the image laid out in the layout worker under its limits (one over a limit, or a note too
  large to read, writes nothing and says why), in fixed colours with its frame, written safely into the vault through its API with
  its companion note when set; on a phone, offered to the share sheet instead.
- `export-form.ts` — the Export form on a drawing: the whole diagram, or a view with or without its faded context; SVG
  or PNG; light or dark; and Export anyway when the note's classification asks first.
- `png.ts` — a PNG of the SVG drawn on a canvas at twice natural size or more; one larger than a phone's canvas holds is
  refused, with the SVG suggested.
- `classification.ts` — a note's classification however its front matter writes it (any key case, a word, a number, a
  list's highest), and from its own text before the metadata cache has indexed it.
- `vault-write.ts` — writing through the vault's API: a name of its own for each export, so none is overwritten; the
  plugin's own temporary file deleted outright on a failure, never left in the vault or its trash.

### `src/proposals/` — a proposal in a note (spec §17)

- `proposal-block.ts` — `renderProposalBlock`: a block whose graph line says CHANGE SET is drawn over its graph by the core's
  review (`ProposalReview.show`: the changes waiting laid over the graph, nothing written), as a card with the proposal's
  strip. A decision goes through the vault's API against the note as it is then (`vault.process`): Accept writes the change
  into the graph's block through the core's review, which has the pane's own session check it; Reject writes only the
  record in the change set; Undo takes the last decision back. The reviews are kept by the plugin (`reviewOf`) while it
  runs, so Undo is still there when the card is drawn again. The person is recorded as "you": Obsidian does not say who is
  at the keyboard.
- `proposal-strip.ts` — the card above the drawing: who proposed it, when and what it read; a notice, with a button to say it
  has been read, when the graph has moved since (Accept stays off until then); the changes one to a row, each in plain
  English with Accept and Reject, in groups with Accept and Reject for the group when there are many; Accept all, Reject
  all and Undo. On a phone it is a sheet at the bottom of the screen (`is-sheet`). Reading view takes the buttons away, and
  the gate (`read-only.ts`) closes `decide` and `undo`.
- `mark-proposal.ts` — the marks on the drawing: a class for the line (heavier for what is added, dashed for what is changed,
  dotted for what is removed), a word and a sign on each box, and the name said so to screen readers.

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
- `drawing-svg.ts` — the SVG put in the card, each box and link reachable by keyboard and named; a drawing that runs
  down the page is marked `graph-note-down`, which `styles.css` uses to give a link's label a gap from its line, so the
  layout source and the SVG stay the Python library's.
- `taps.ts` — what a tap or a key lands on, and the nearest things to a tap.
- `details-panel.ts` — the details of a box, a link or an estimated link, the one shown marked as selected, its
  properties to read, and the inspector while the block is edited.
- `estimate-actions.ts` — what an estimated link's details offer (§3): the quick fix, its problem's own fix (the core's
  `estimateFix`), written into the text being edited, or else into the note while the block is still as drawn
  (`ViewOptions.writeBlock`); and Edit the link, which opens the editor with the misspelt word selected. Neither where
  `read-only.ts`'s gate has closed the writes: reading view, and full screen opened from it.
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
- `add-thing.ts` — adding a thing (§5): while the card is edited, Add a thing asks for the text first and suggests the name
  from it as it is typed (`suggestName`), shown before anything is written; Add the thing writes it into the text being
  edited (`addThing`), as one edit an undo takes back. A name of its own is kept and held to the same rules. The pane's
  drawing has no editor of its own, so offers none of the graphic edits: there the thing is typed in the text.
- `suggested-name.ts` — a box drawn under a suggested name: what screen readers hear of it, where it is written in the
  block being edited, and in its details its suggested name with the one-click fix that writes it. Nothing else writes
  it: Park for later, Record a path, Make a view, a property changed or made a list and Save as shown with it
  selected are each refused, in the core's words ("accept its name first"), by `acceptNameFirst`. Each is checked
  against the note as it is when written, never the card's drawing, which can be older: an edit into the block with the
  editor session's `current()` (the note as last seen, with what is typed), a view or a style inside `vault.process`.
  The fix itself, Add the name, writes the name the note suggests now, and Add a thing suggests and checks its name the
  same way. An edit into the block (the editor's `replace`) is checked again as it is written (`PaneSession.edit`); a
  refusal reloads the block and says so in the draft banner, with the edit kept as a draft.
- `placement.ts` — where a card is: read-only in reading view, a hover preview and an embed of another note (in Live
  Preview too); waiting for a card to be put on the page.
- `read-only.ts` — the one check every write from a card passes: each function in its options, at any depth, is closed
  where the card is read-only (reading view, an embed, and full screen opened from them), but those named as only
  reading, so a new control that writes is read-only there by default; an option it cannot reach is refused, loudly.
- `view-options.ts` — what a drawing is given.

### `src/block-editor/` — the text of one graph block, in the pane or in place

- `block-editor.ts` — `BlockEditor`: ties the parts together; the field and what typing in it does.
- `editor-layout.ts` — the editor's parts on the page, built once for each block.
- `block-note.ts` — the note behind the editor and its session: opening, writing, undo, Lock, drafts; the note followed
  when it is renamed or moved, and what is typed kept as a draft when it is deleted; each editor's own draft known by
  its id, beside another's.
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
- `kept-draft.ts` — the draft banner: what was typed, never lost; Restore and Discard act on the very draft shown, by its
  id, and on no other when it is gone.
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
  `editing-view.js` opens a note in the editing view, in Live Preview, with the plugin's own extension and view plugins,
  closes it as Obsidian closes an editor, and gives the cards it would draw. A component's `registerEvent` is released when it unloads, and `state.listening()` counts the
  vault's listeners, so one left behind shows.
  `workers.js` stands in a browser's Worker: each runs the code main.js hands it, from its Blob URL, in a real thread.
  `fake-vault.js` stands in the vault's ways of making files (create, modify, rename, delete, a folder), one of which
  can be made to fail as a full disk would, a rename and a deletion told to whoever listens, and the metadata cache's
  front matter.
- `test/device-checklist.md` — what is checked by hand on the devices. Every item has a number that never changes
  (`V-03`: its section's letter and two digits), and each item after Before has a note in `test-vault/Device checks/`
  that shows the case on a graph to try it on; `test/device-check-notes.test.js` (repository root) holds the two together.

## The harness, `harness/`

A browser page that loads the plugin against a shim of Obsidian, to see and try it outside Obsidian.
