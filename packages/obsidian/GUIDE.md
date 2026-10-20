# The Obsidian plugin: where things live

The plugin draws the graphs written in notes (spec §3) and edits them. It edits in place in a drawing's card, or in a
pane beside the note (spec §4). What a graph means, its problems, its drawing and its edits come from
`@thoughtknot/core`. This package puts them on Obsidian's page. It is bundled by `esbuild.config.mjs` into `main.js` at
the repository root.

## The source, `src/`

Each module opens with a comment saying what it is for. A feature with several parts has a folder of its own, with one
module that ties the parts together, named as the folder is.

**The drawing, the details and the forms are the shared display layer's** (editor spec §26, C4). They live in
`packages/core/src/display/` and are imported as `@thoughtknot/core/display/<path>`. They are `code.ts`, `graph-view/`,
`properties/`, `proposals/proposal-strip.ts` and `mark-proposal.ts`, `export/export-form.ts`, `links/links-list.ts` and
`link-marks.ts`, `images/still-frame.ts`. Where the sections below describe one of them, they still say what it does.
The layer's own guide (`packages/core/GUIDE.md`) says where it lives.

The plugin keeps what is Obsidian's. `display-host.ts` installs Obsidian's icons, phone test, notice and menu as the
layer's host. `graph-card.ts` wraps a card in a component Obsidian owns (`graphCard`). The layer's types for what the
plugin supplies (`LinkHost`, `Exporting`, `ImageSource`) are in the layer. `link-host.ts`, `export.ts` and
`vault-images.ts` implement them.

### The plugin, its blocks and its drafts

- `main.ts` — the plugin. It registers the block processor, the pane, the editor extension, the settings page and the
  command that converts a note to standard GQL. It keeps the settings, drafts and shared schemas, the standard ones
  after the vault's (§27). It opens the editors.
- `inline-editors.ts` — the editors open in place.
  - Each is found by its block's identity. It is never found by another block that comes to its line, even one of the
    same graph.
  - There is one to a block, however often Edit here is pressed.
  - It is released, its typing written, when it is off the page and its note is closed. That holds whether a card left
    or the editing view closed.
  - It is never kept when its opening fails, for any reason, logged and said. Nor is it kept when it finds nothing: the
    note gone or without a graph block.
- `drafts.ts` — the drafts kept in the plugin's data.
  - Each has an id given once and never again, by which every change finds it. The id is a random UUID, however old the
    web view. Its key, note and graph, only says whose it is.
  - Drafts kept before ids are given one when the plugin loads, saved at once, so they keep it from one load to the
    next.
  - They move with their note when it is renamed, edited or not, ids unchanged. They go beside a draft kept under the
    new name, never over it.
  - Recover kept drafts into a new note is the command that writes every one, once, into a note, a deleted note's among
    them. It says so when that note cannot be written.
### The blocks a note holds

- `block.ts` — one gql block in a note. It is drawn, or shown as code, never blank. It is shown as text with a banner
  when it is over a size or time limit.
- `view-block.ts` — a view (§7): a query block named as a view, drawn as what it picks out of its graph.
  - Outside the view profile it is refused, saying what is allowed.
  - When its note is too large to read, it is shown as its query under the banner.
  - When it matches nothing, it says so, with Change the view.
  - What is outside it is faded or hidden as its style says. It has its looks and legend.
  - Save as shown and Fade or Hide others are written in the style graph.
  - A view of a graph the note draws FROM another note or a .gql file is put to that source, read there (`sourcedView`).
    It says where it comes from, and is drawn again when the source changes. It offers no export, which reads this note.
- `step-block.ts` — a graph step (§20).
  - Its card says what it proposes into. It lists each point with what it takes and a choice of the note's graphs and
    views to give it. It has Run.
  - Nothing runs until Run is pressed. Then it runs against the note as it is, through `vault.process`.
  - Refused inputs are listed in the card. An output is written beside its graph as a change set for a person to accept
    or reject.
  - Run is off while a run is under way, so a second press runs nothing.
  - Reading view, an embed and a hover preview offer no Run.
### Edit in pane, schemas, styles and code

- `edit-in-pane.ts` — Edit on a FROM block's card and a step's. It opens the block in the pane as an empty graph's card
  does. It is taken away where the card is only read.
- `schema-block.ts` — a block that holds only a schema (§3, schema_drawn), drawn as the core's `schemaPicture`. It shows
  its kinds and relationship types, read-only, with Source showing its text. Any other block is left to `block.ts`.
- `style-block.ts` — a style block (§2). It is never drawn, and is folded away until opened. It says whose style it is,
  what it holds (its diagram types among the rest) and how many problems it has. The graph it styles is drawn with its
  nudges, and its problems listed, by `block.ts`.
- `code.ts` (now the shared layer's, `core/src/display/code.ts`) — a block that is not a graph, shown as coloured code.
  A very long one is shown plain.

### The editing view and the pane

- `live-preview.ts` — the editing view's own cards, so the page stays still while a block is typed in.
  - Each block keeps its identity however lines move above it. So its card, and the editor in place in it, survive the
    move.
  - Each card's last height is kept by its note and line, for the blocks the note has now.
  - A FROM block and a step get a card too, each known by its graph line alone. So a long block is never read to choose
    its card.
- `editor.ts` — the comma and the colon added for you in the note's own editor.
- `pane.ts` — the edit pane, which holds a block editor.
- `reading-view.ts` — reading view never changes the note.
  - Every command rewriting a note asks `noteToRewrite` first. It gives the note in the pane in front. It refuses with a
    notice when that pane is in reading view or holds no note.
  - `stillToRewrite` is asked again just before the write. It refuses the same way when that pane changed while the note
    was read.

### `src/layout-worker/` — the layout kept apart from the interface (spec §9, layout_contained)

- `layout-worker.ts` — `Layouts`: every graph, and every export, laid out in one Web Worker. The worker is started from
  a Blob URL of main.js's own copy of the worker's bundle. Only where the first worker cannot start is a graph laid out
  on the page's thread, with lower limits. Each is said once in the console, as is drawing paused after three layouts in
  a row fail. The module says why it is built so.
- `worker-entry.ts` — what runs inside the worker. `esbuild.config.mjs` bundles it on its own, Graphviz and all, into
  the function `layoutWorker` of the module `thoughtknot:layout-worker` (typed in `bundled-worker.d.ts`).
- `refusal-banner.ts` — the banner over a graph shown as text because it is too large to read or draw, took too long, or
  drawing is paused. It shows an icon, and the limit and numbers in words.
- those words are the core's `hosts/refusal-words.ts`, shared with the browser editor's page. They come in two voices:
  the banner's, and the notice of an export stopped for the same reason ("what happened: why. Nothing was saved. What to
  do."). They also cover a layout that failed: the worker or its engine raised an error, and its reason is put in
  brackets.

### `src/sources/` — a graph drawn from another note or a .gql file (spec §20, §7 view_of_another_note)

- `sources.ts` — `renderSourceBlock`: a FROM block's card, the whole graph as its source holds it, read-only, with its
  problems at their lines there. Or it says why it cannot be drawn, with the block as text, never blank. A source too
  large to read is shown under the banner a note's blocks get. `sourcedView` is the same reading for a view of the
  graph.
- `source-read.ts` — the source found as Obsidian finds a link from the note (else by its path), read through the vault,
  never copied.
  - A .gql file larger than `READ_LIMITS.bytes`, by the size the vault keeps, is never read.
  - A missing one is looked for by name elsewhere, so a move is said.
  - One that cannot be read is said with its reason.
  - `watchSource` draws the card again when the source is changed, made, moved or deleted.
- `source-strip.ts` — the line naming where the data comes from, and Open for a note, as a tap on a link opens it.

### The inspector's properties, now the shared layer's `properties/` (packages/core/src/display/properties/)

- `properties.ts` — `renderProperties`: a row for each property, its type menu, and the rows of the lists a thing holds.
- `list-form.ts` — the form that asks for a kind and a relationship when List is chosen.
- `list-row.ts` — a list as chips: the things linked to this one, each removed with its x, and a field to add a value.
- `menu-place.ts` — where a property's type menu is shown: under its icon, or above it when the window has no room
  below.

### `src/export/` — export (spec §16)

- `export.ts` — `exportGraph`.
  - The scope is read from the note as it is now. Then comes the core's plan: nothing to export, a question first, or
    go.
  - Then come the files: the image (`image.ts`), or the data as a GQL block, CSV or GraphML. The data is written by the
    core with no layout asked for, so a graph too large to draw is still exported.
  - A view's data is the view's alone, unless its faded context is asked for. That context is then marked as outside the
    view.
  - The files are written safely into the vault through its API, under names of their own. All of a paged PNG's pages
    are written, or none. A page that cannot be taken away again is named, to delete by hand.
  - Its companion note is written with them when set. The data's companion note links the file and says how much it
    holds.
  - On a phone the files are offered to the share sheet instead, every page at once. They are saved in the vault when
    the phone cannot share a file of that kind.
- `image.ts` — the image laid out in the layout worker under its limits. One over a limit, or a note too large to read,
  writes nothing and says why.
  - It is drawn in fixed colours with its frame, and with its style: the arrowheads it hides and the properties it shows
    inline. Their values come from the graph as read (`ImageAsk`'s `data`, which comes with every style, or the type
    check fails).
  - A PNG too large for one sharp image is drawn on pages (`pngPages`). Every page is drawn before any is written. It is
    refused when even pages cannot hold it.
  - An SVG moves the links its style moves, and plays a path it is given, as an animated SVG. It is still under reduced
    motion. A PNG is drawn still.
  - One too large for the device (`deviceOf`: a phone or a computer) is refused before anything is laid out. It says why
    and what would make it fit (`tooLargeWords`). `export.ts` asks first, the core again.
  - The images on boxes are read from the vault (`picturesFrom`), each animated one with its first frame drawn, and
    embedded by the core. What was done with each animated image is said after the outcome, in the notice
    (export_animation_stated).

### Export: the form and the files

- `export-form.ts` (now the shared layer's, `core/src/display/export/`) — the Export form on a drawing.
  - What to export: the whole diagram, or a view with or without its faded context. Or a path, played as an animated SVG
    at a pace chosen.
  - The format: SVG, PNG or the data as a GQL block, CSV or GraphML.
  - Light or dark, for an image only.
  - Export anyway, when the note's classification asks first.
  - `dataExportBar` gives a graph or view shown as text, too large to draw, a bar with an Export button for its data
    alone.
- `png.ts` — a PNG of the SVG, drawn on a canvas at twice natural size or more. It is drawn at the size it is given: the
  whole image, or one page of it. The canvas is made nothing wide and nothing high once its PNG is made, so pages never
  pile up.
- `classification.ts` — a note's classification however its front matter writes it: any key case, a word, a number, a
  list's highest. It is read from its own text too, before the metadata cache has indexed it. `classificationInText`
  reads the text alone. `higherClassification` takes the higher of two readings. An unknown one counts highest; none
  counts as the level set for unlabelled notes, and wins a tie with it.
- `vault-write.ts` — writing through the vault's API. Each export gets a name of its own, so none is overwritten. The
  pages of one export share one number (`freePaths`). The plugin's own temporary file is deleted outright on a failure,
  never left in the vault or its trash.

### `src/images/` — the images a note's things name (spec §18)

- `vault-images.ts` — `vaultImages`: a property's value read by the core (`imageLink`) and found as Obsidian finds a
  link from the note. Its type, size and bytes are read through the vault's API.
  - An address outside the vault, or a place that could leave it, is never loaded, with the core's words. A link's
    target is held to the same as a path.
  - A folder in the vault that is a symbolic link elsewhere is followed, as Obsidian follows it for any link. A file
    reached through it counts as the vault's.
  - Its `url` is the vault's own address for it, so a photograph over the size limit is shown without being read here.
- `still-frame.ts` (now the shared layer's, `core/src/display/images/`) — `stillFrame`: an image's first frame as a PNG.
  It is drawn by the platform's own decoding on a canvas from the file's bytes (no library). It is null where it cannot
  be drawn. It is never drawn for a frame over `STILL_PIXELS` (50 million pixels). The plugin's `stillFrame` calls it,
  so a test can stand in one, as for `rasterise`.

### `src/proposals/` — a proposal in a note (spec §17)

- `proposal-block.ts` — `renderProposalBlock`: a block whose graph line says CHANGE SET.
  - It is drawn over its graph by the core's review (`ProposalReview.show`: the changes waiting laid over the graph,
    nothing written). It shows as a card with the proposal's strip.
  - A decision goes through the vault's API against the note as it is then (`vault.process`).
  - Accept writes the change into the graph's block through the core's review, which has the pane's own session check
    it.
  - Reject writes only the record in the note's judgement graph.
  - Both take the change out of the change set. Undo takes the last decision back.
  - The reviews are kept by the plugin (`reviewOf`) while it runs, so Undo is still there when the card is drawn again.
  - The person is recorded by the name in the settings' Proposals section, exactly as typed, or "you" when it is empty.
    Obsidian does not say who is at the keyboard.
- `proposal-strip.ts` (now the shared layer's, `core/src/display/proposals/`) — the card above the drawing.
  - It says who proposed it, when and what it read.
  - It says what the graph spec's check of the change set said: all passed, or each line that failed.
  - When the graph has moved since, it shows a notice, with a button to say it has been read. Accept stays off until
    then.
  - It lists the changes one to a row, each in plain language and its exact text, with Accept and Reject. The exact text
    is the GQL, the SET line or the removal, in a code span and in the buttons' names.
  - It gives each change's reason as plain text. A model's reason is kept escaped in the note, and unescaped for the
    card.
  - Accept all and a group's Accept send the ids of what can be accepted now.
  - When there are many changes, they are in groups, with Accept and Reject for the group.
  - It has Accept all, Reject all and Undo.
  - On a phone it is a sheet at the bottom of the screen (`is-sheet`). Reading view takes the buttons away, and the gate
    (`read-only.ts`) closes `decide` and `undo`.
- `mark-proposal.ts` (now the shared layer's, `core/src/display/proposals/`) — the marks on the drawing. A class for the
  line: heavier for what is added, dashed for what is changed, dotted for what is removed. A word and a sign on each
  box, and the name said so to screen readers.

### `src/ai/` — asking an AI model to propose changes (spec §19)

- `ai.ts` — the command, Ask an AI model to propose changes.
  - While AI is off or no model is set up, it is only a notice.
  - Otherwise it opens the send dialog on the note in front, never one in reading view.
  - The note's classification is read from its text as well as the metadata cache, and the higher taken
    (`higherClassification`). It is read again each time the dialog shows what will be sent, against the classifications
    as they are then.
  - Obsidian has no AI of its own to offer first, so only the models set up here are offered.
  - Also the command Clear the record of sends to AI models. The plugin keeps the last `SENDS_KEPT` (200).
- `send-dialog.ts` — `SendDialog`: what to send (the whole graph, a view, or the things ticked), the model and the
  question. The model set up for proposing changes comes first.
  - Show what will be sent puts the exact request on screen. It shows the model, its address, the headers (a key only by
    its name) and the note's classification. Or it shows why nothing may be sent.
  - Send, pressed on exactly that, sends it once. Any change takes the yes away until it is shown again.
  - The note's classification is read once more as Send is pressed. If it has changed, nothing goes until it is shown
    again.
  - The key is read from the app's secret store as the request goes. Every model's key is read before, only to make sure
    none is in what is sent.
  - Every send is recorded in the plugin's data (`recordAiSend`).
  - An answer is written into the note as a change set after the graph's blocks, through `vault.process`. A failure is
    said in a notice, the note left as it was.
#### The destination matrix and the network

- `matrix-note.ts` — the destination matrix note, named in the settings, read into plain rows (`matrixRows`).
  - The rows come from the first table with an empty top-left cell and a known class across its header.
  - A cell exactly ✅ is yes, ❌ no, ⚠️ with the words after it conditional. Anything else is unknown, which refuses. `\|`
    stays in its cell.
  - It is read afresh each time what will be sent is shown (`readMatrix`), so the core never sees the note's layout.
  - `matrix-known.ts` says which header names are known classes.
  - A read that fails refuses plainly, and one that finishes after a change is ignored.
- `send.ts` — the one module that reaches the network: the request, with Obsidian's `requestUrl`, never a vendor's
  library. Only the send dialog imports it (`test/policy.test.js`).

### `src/databases/` — importing from a database (spec §20)

- `import.ts` — the command, Import from a database. With no SQLite file in the vault, it is only a notice.
  - Otherwise it opens a dialog on the note in front, never one in reading view. It asks for the database file, the
    graph's name, the things query and an optional links query. It works the same on desktop and mobile.
  - Nothing is read until Import is pressed. Then the file's bytes are read from the vault, on the device.
  - The rows are written at the end of the note as a graph block (`importedBlock`), through `vault.process`. It is text
    that keeps no live link. A failure is said in a notice, the note left as it was.
- `sqlite.ts` — `sqliteQuery`: runs the queries on a SQLite file's bytes, in memory, with sql.js. The engine's
  WebAssembly is inside main.js, so nothing is fetched.
  - The database is opened query-only, so a query that writes fails. The file itself is never written.
  - A query of more than 10,000 rows fails, saying how to narrow it.
  - The plugin's `queryDatabase` calls it, so a test can stand in its own.
- `sql-js.d.ts` — the types of the parts of sql.js the import uses.
- `../commands.ts` — `addAskCommands` adds the commands that reach outside the vault: Ask an AI model, Clear the record
  of sends, and Import from a database. `addCommands` adds them and the keyboard shortcuts' commands.
- `../shortcuts.ts` — `addShortcutCommands` adds Show the keyboard shortcuts, and the drawing's own commands: Zoom in,
  Zoom out, Fit and Full screen. They have no keys until a person gives them some in Hotkeys (§44, shortcuts_listed).

### `src/settings/` — the settings page (spec §21)

- `settings.ts` — `ThoughtKnotSettingTab`: one page in Obsidian's plugin settings, in its declarative form. It is built
  from the core's `OPTIONS`, so every option is on it with its sentence. Its parts: strictness and the departures
  Simplified allows, with the action that converts a note to standard GQL; the classifications; formatting; drawing.
- `ai-models.ts` — the AI models of §19 as a list, a page for each.
  - Each page has: name, purpose (the spec's purposes suggested), ceiling, model and endpoint (said on the model's row
    when it cannot be used).
  - Its key is chosen in the app's own secret store by name, so only the name is saved.
  - Use AI models, off until turned on, heads the part of the page.
  - Unlabelled notes count as, a choice among the classifications, the most sensitive until chosen, follows them.
  - The Destination matrix note (a path) and Matrix classes follow. Matrix classes is a mapping of other names to
    classifications, one per line, with the classes matched by neither flagged.
- `ai-matrix-controls.ts` — a model's Matrix row: a choice among the rows of the matrix note (none keeps the ceiling).
  For a row picked, each class it marks conditional gets a switch, off until turned on for that model. The row's
  condition is beside it. A class matched by no classification is flagged.

### The drawn graph, now the shared layer's `graph-view/` (packages/core/src/display/graph-view/)

#### The card and how it is worked

- `graph-view.ts` — `GraphView`: the card, its zoom and full screen; ties the rest together.
- `viewport-size.ts` — the viewport's size. While the page gives it none, it is drawn at the drawing's own size, and
  told to the zoom as none then (`zoomSize`). So a card hidden by `display: none` or another tab, or made before it is
  laid out, keeps its zoom. That includes a zoom saved as shown (zoom_fit_recomputed).
- `viewport-events.ts` — how the drawing is worked by pointer, wheel and keyboard. Each event goes to the core's `Zoom`.
  A tap opens what it lands on, or clears the selection. It also handles the highlight's pointer and focus, and the
  sheet moved with the note.
- `view-bar.ts` — the bar: problems badge, Fit, zoom, Find a thing, Filter by kind or link, View, Full screen, Export,
  Edit here, Edit in pane, Source.
- `view-switches.ts` — the View menu (§25): labels by zoom, busy hubs folded, groups folded and parallel links merged.
  Each is a switch on or off, starting as the settings (and a view saved as shown) say.
  - `ViewSwitching` turns them. It opens a busy hub's stub or a folded group's box, and folds or opens a hub from its
    details. It opens the folds a thing found is hidden in.
  - It lays the graph out again (`SwitchesShown.relayout`) for the card to put in place. It keeps the selection: a thing
    folded into a box is selected as its box.
  - It keeps the focus too: the keyboard stays on the same box, or is taken to a hub opened by Enter.
  - Its moving links are marked again, the legend says only those drawn, and a path playing is stopped.
  - The state is the plugin's for each graph and view in a note and where it starts (`switchesFor`), never the note's.
    It is saved only when a view is saved as shown.
- `problems-list.ts` — the problems behind the badge, grouped when many, and the completeness report.

#### The drawing and the selection

- `drawing-svg.ts` — the SVG put in the card, each box and link reachable by keyboard and named.
  - A drawing that runs down the page is marked `thoughtknot-down`. `styles.css` uses it to give a link's label a gap
    from its line, so the layout source and the SVG stay the Python library's.
  - A busy hub's stub and a folded group's box are buttons (`data-fold`). A link merged into a trunk is itself by either
    of its lines (§25).
  - Laid out again, the new drawing goes into the same SVG element (`swapSvg`), so everything that holds it holds the
    new one.
- `taps.ts` — what a tap or a key lands on, and the nearest things to a tap. Where a box is, to bring it into view, and
  the middle of each, for the arrow keys. The fold a stub or a box opens (`foldAt`).
- `selection.ts` — what is selected in a card and how it shows (spec §25). The selection is the focus, with the
  highlight, the untangling and the arrow keys that walk the links. A thing chosen from the details is brought into
  view, readable, and the selection kept clear above the details sheet. It ties the next four to the card, and marks the
  drawing by class only.
- `focus-marks.ts` — what the core says is kept, hidden or highlighted, put on the drawing as classes
  (`thoughtknot-kept`, `-dim`, `-hidden`, `-hot`). `styles.css` draws them by strength and outline, never by colour
  alone. It never moves or resizes anything, so a highlight lays nothing out again.
- `hover.ts` — the highlight: under the pointer, with the keyboard focus, and on touch from the tap that selects, so
  nothing depends on hover.
- `untangle.ts` — filtering the drawing to a thing and its neighbours, the legend, the shortest path and the search box,
  tied to the core's `Untangle`.
  - It changes the picture only, never the note, so reading view has them. A view's Save as shown does write the
    legend's choices, and the view opens with them again (untangle_legend).
  - Its parts are three. `untangle-banner.ts` shows what the drawing is filtered to, the path and the question, each
    with its way back. `untangle-legend.ts` has a button for each kind and relationship type: in front, hidden, back.
    `untangle-find.ts` is the search row.

#### The details

- `details-panel.ts` — the details of a box, a link or an estimated link, the one shown marked as selected.
  - It shows its properties to read, and the inspector while the block is edited.
  - A thing's links are grouped by type and direction in words, each thing and link a choice. The trail has back and
    forward (§25).
  - A thing's details offer Show only this and its neighbours, and the shortest path to another thing (§25).
  - Closing it, by button, Escape or a tap on empty space, clears the focus.
- `rich-details.ts` — `RichDetails`, the rich parts of the details (§18).
  - A thing's text (when it holds Markdown) and its properties are rendered by Obsidian's `MarkdownRenderer`.
  - A thing whose id is a link to a note embeds the note it stands for, with Open beside it (node_is_a_note).
  - It shows the links and attachments the thing holds (`links/links-list.ts`).
  - All are owned by a component unloaded when the details are drawn again or close.
- `note-controls.ts` — while the block is edited, the details' Add a note, Change the note and Remove the note. They are
  written by the core's `setNote` through the editor (note_add). A refusal is said beside them, nothing written.
  `rich-details.ts` shows the note itself, rendered as Markdown by the same renderer (note_shown).
- `note-callouts.ts` — `markCallouts`: with the setting Draw notes as callouts on (off by default), each note is drawn
  over the finished SVG. It is a box beside its thing joined by a dashed line, within the viewBox, its words as text
  (note_callouts). The layout and the viewBox are as without.

#### Viewer aids and finding your way

- `viewer-aids.ts` — `aidsOf` (the settings' mini-map and details-kept-open) and `Aids`, the parts a card builds from
  them. They are the mini-map, the quick-info tooltip and where the kept-open details sit (§24).
- `mini-map.ts` — `MiniMap` (mini_map, mini_map_setting): a small copy of the whole drawing, with the part in view
  outlined. It has a box for each thing and a line for each link, from the tap areas. It is shown by the setting: off,
  when the drawing is bigger than its view, or always. Tapped or dragged, it pans the core's `Zoom` so the middle of the
  view is where it points.
- `quick-info.ts` — `QuickInfo` (quick_info, quick_info_no_hover_only): the tooltip.
  - It is opened by a hover after a moment, a long press on touch, and the keyboard focus (not a click's).
  - It is closed by leaving, a press, a move of the view or Escape.
  - It sits on the page itself, its note rendered by the card's renderer.
  - `quick-info-content.ts` is what it says (`infoOf`, from the core's details). `quick-info-place.ts` is where it goes
    (`placeTip`: below, above, right, left, never over the thing).
#### The summary, the trail and the sheet

- `details-summary.ts` — the graph's summary the details panel shows when it is kept open and nothing is chosen
  (details_always_visible).
  - `details-untangle.ts` — a thing's untangling offers.
  - `source-toggle.ts` — Source in reading view.
  - `full-screen.ts` — the card's full-screen overlay. It is a dialog that takes the keyboard and keeps Tab in it. It
    leaves on Escape from any control and gives the keyboard back.
- `details-nav.ts` — finding your way from the details (§25). It renders the groups of links from the core's
  `linkGroups`, the trail's buttons and the names of steps. `Glide` is the brief eased move to what is chosen, a frame
  at a time. It moves at once when the system asks for reduced motion.
- `details-sheet.ts` — the details in view mode, in a note's card (§25).
  - It is a sheet over the card, pinned to the foot of the part of the screen the note is seen in. It is pinned to the
    foot of the card instead when the card ends above it.
  - It is placed again as the window, the card or the note's scroll moves. It is gone while the card is off the screen.
  - It sits in the card instead where the browser does not lay it out where it was put (a transformed container). It
    does so in a canvas card and in a hover preview too.
  - Its toggle minimises it to a bar or restores it, the state remembered for the session.
  - Escape in it closes it, never a key typed in the note.
  - It says where its top is, so the card keeps the chosen thing clear above it.
- `selection-pointer.ts` — the arrow at the edge of the drawing pointing to a selection out of view, named for it.
  Tapped, it brings the selection into view. A tap on it is never a tap on the drawing (§25).

#### Edits and views from the card

- `estimate-actions.ts` — what an estimated link's details offer (§3).
  - The quick fix, its problem's own fix (the core's `estimateFix`). It is written into the text being edited, or else
    into the note while the block is still as drawn (`ViewOptions.writeBlock`).
  - Edit the link, which opens the editor with the misspelt word selected.
  - Neither is offered where `read-only.ts`'s gate has closed the writes: reading view, and full screen opened from it.
- `parked.ts` — things parked for later (§5, §8).
  - Each is drawn dashed with a "⏳ later" or "⏳ overdue" mark on the SVG Graphviz drew, so the layout stays the Python
    library's.
  - They are listed behind the badge, which counts them apart from problems.
  - Park for later is in a box's details while the block is edited, writing the Deferred into its text.
  - In a locked graph whose schema lacks Deferred and DEFERS, the refusal offers "Declare Deferred and DEFERS in the
    schema". That writes them and then parks, with what was typed in the form kept. It writes with
    `BlockNote.declareDeferred`: into the text being edited when the schema is in that block, else through
    `vault.process`.
  - The form is checked first, so nothing is declared for a park that would fail, and a second press does nothing.
  - Declarations written into another block are not undone with the park.
#### Views and diagram types

- `view-maker.ts` — making a view by tapping (§7), while the block is edited. It has the kind of view, the boxes tapped,
  and its reading said as it is built. Write the view writes a view block after the graph's last block.
- `view-strip.ts` — a view's card: its reading in plain language, Fade or Hide others, and Save as shown. Save as shown
  keeps the legend's choices that untangle (§25 untangle_legend), and a view saved so opens with them. The card has the
  legend too, and what is outside it faded and its looks drawn on the drawing.
- `type-strip.ts` — the diagram type (§15), on every card, a graph's or a view's: how it is drawn, and Diagram type.
  - Diagram type lists the seven types. Each that fits can be chosen, written into the style graph for the graph or the
    view. A tree is drawn along the relationship it fits best.
  - Each type that does not fit is listed with why. The suggested one is said, and never drawn until chosen.
  - A chosen type that has stopped fitting is said, the graph drawn as a network, and the nearest type that fits
    offered.
  - A graph of more than 50 things gets a way in: the table or a view.
  - Reading view keeps the words and drops the controls that write. The core decides all of it (`diagramOffer`).
- `table-view.ts` — a graph drawn as a table: the plugin's own table, never Graphviz.
  - It has a row for each thing (its kind and properties) and each link. Each row is reached, named and opened as a box
    or a link is. `taps.ts` and the details take a row as its thing or link.
  - It is moved and scaled as a whole by the card's zoom.
  - On a phone, a wide tree, flow or timeline is fitted to its height and scrolled across only (`graph-view.ts`, the
    core's `Zoom` with `across`).

#### Walked paths and moving links

- `walk.ts` — walked paths (§7): the strip below the bar with Play for each path in the note, playing it
  (`path-play.ts`). A path with no steps is said to have none. While the block is edited, Record numbers each box as it
  is tapped and writes the path into the text. Its `stop`, which the card calls as it unloads, leaves no step waiting.
- `path-play.ts` — a path playing (path_autoplay): the core's `PathAutoplay` stepping on its own at the pace chosen
  (Pace).
  - Its controls are Pause and Play on, Previous and Next (a step by hand pauses it) and Stop.
  - The step now on is outlined and pulsing. A dot runs the link from the step before when a link joins them, forwards
    along the walk.
  - Each step is said in the strip's one live region. Under reduced motion it steps at once and with no dot.
  - Export as an animated SVG always opens the Export form on the path at its pace (`openExportForm`). It replaces a
    form already open (path_animation_export). An export at a pace Play does not step at is refused.
  - `playablePaths` are the paths the Export form offers.
- `flow-marks.ts` — links that move (§7, links_show_flow).
  - Each link the style graph moves is found by Graphviz's number (`linkGroup`). So a link guessed from a near miss of
    its type is found too, which has no `data-link`.
  - `linkGroups` gives both lines of a link merged into a trunk by the View menu. They move and carry a played path's
    dot alike.
  - Each is given the classes `styles.css` moves it by, and its name is said with its movement and meaning.
  - For a dot there is a runner, a copy of its line (`runnerOn`, which the path playing uses too). It is drawn whatever
    the setting, and hidden by `styles.css` under reduced motion. So turning that off later moves it at once.
  - The card has a legend of what the moving links mean, each in words beside its icon (motion_not_alone).
  - The movement is `styles.css`'s, still under `prefers-reduced-motion` (motion_reduced_respected).
#### Images on the card

- `animated-images.ts` — a thing's images (§18).
  - `renderImages` shows each image its properties name in its details. `placePictures` places each picture its style
    draws on a box, in the square the core kept (`PICTURE_MARK`).
  - Each is read from the vault's bytes (`images/vault-images.ts`) and started as the core's `startOf` says. It may be
    moving, or still under reduced motion until played (motion_reduced_respected). Past a limit it shows its first
    frame, saying why with the limits, with Play refused (animated_image_limited).
  - Each has a pause and play control (animation_pause_play).
  - `MovingImages` counts what moves on the card, its details among it, so no more than `IMAGE_LIMITS.moving` do. It
    lets each image go with the details it was shown in, or with the card.
  - An address outside the vault is never loaded, and says so.
  - A file over the size limit is never read: its size on disk decides, and it is not shown, saying why. A JPEG, by its
    name, is shown from the vault's address.
  - An image is only ever shown by an image element. An SVG is never put inline in the page.
- `image-views.ts` — where an image is drawn. It is a figure in the details (the image, its caption, a button and what
  it says). Or it is the picture on a box, with its control drawn in the square's corner. That control is an SVG button
  reached by Tab and pressed by Enter, Space, a click or a tap. `viewport-events.ts` never takes it for a tap or a key
  on the box.

#### Adding a thing and suggested names

- `add-thing.ts` — adding a thing (§5), while the card is edited.
  - Add a thing asks for the text first and suggests the name from it as it is typed (`suggestName`). The name is shown
    before anything is written.
  - Add the thing writes it into the text being edited (`addThing`), as one edit an undo takes back.
  - A name of its own is kept and held to the same rules.
  - The pane's drawing has no editor of its own, so it offers none of the graphic edits. There the thing is typed in the
    text.
- `suggested-name.ts` — a box drawn under a suggested name. It covers what screen readers hear of it, and where it is
  written in the block being edited. In its details it shows its suggested name with the one-click fix that writes it.
  - Nothing else writes it. Each of these is refused: Park for later, Record a path, Make a view, a property changed or
    made a list, and Save as shown with it selected. They are refused in the core's words ("accept its name first"), by
    `acceptNameFirst`.
  - Each is checked against the note as it is when written, never the card's drawing, which can be older. An edit into
    the block is checked with the editor session's `current()`: the note as last seen, with what is typed. A view or a
    style is checked inside `vault.process`.
  - The fix itself, Add the name, writes the name the note suggests now. Add a thing suggests and checks its name the
    same way.
  - An edit into the block (the editor's `replace`) is checked again as it is written (`PaneSession.edit`). A refusal
    reloads the block and says so in the draft banner, with the edit kept as a draft.
#### Where a card is and what it may write

- `placement.ts` — where a card is. It is read-only in reading view, a hover preview and an embed of another note (in
  Live Preview too). It also covers waiting for a card to be put on the page. And it covers the part of the screen its
  note is seen in, and scrolling it.
- `read-only.ts` — the one check every write from a card passes. Each function in its options, at any depth, is closed
  where the card is read-only: reading view, an embed, and full screen opened from them. Those named as only reading
  stay open, so a new control that writes is read-only there by default. An option it cannot reach is refused, loudly.
- `view-options.ts` — what a drawing is given, its links' movement among it (`LinkMotion`).

### `src/links/` — links and attachments (spec §18)

- `link-host.ts` — `linkHost`, what a card is given to follow its links through Obsidian (`LinkHost`).
  - A note or file is opened by the workspace's own `openLinkText`; a modifier-click opens it in a new tab.
  - A web or mail address is said to leave Obsidian in a dialog, and handed to the system only on Open. Any other link
    is never opened.
  - A hover is told to Page preview (`hover-link`, from `HOVER_SOURCE`), the dialog showing the site's host first.
  - Markdown is rendered by `MarkdownRenderer` after the core's `safeMarkdown`, so nothing remote loads and no HTML is
    rendered.
  - A note embedded is read here and rendered made safe (`embedParts`, `embeddedMarkdown`), never embedded by Obsidian.
    A heading embedded gives only its section.
  - Every link it renders, then or later, is followed by the same rules. Later links are caught by a MutationObserver
    for as long as its owner lasts. A link is refused when its `href` or its `data-href` is.
  - It keeps where a card was left when a link took its tab (`cameBack`, back_where_you_were).
  - Create the note, for a broken link, is the one write, closed in reading view.
  - `vaultNames` gives the names a broken link's likeliest meaning is chosen from.
- `links-list.ts` (now the shared layer's, `core/src/display/links/`) — the details' Links and Attachments.
  - Each link is an anchor (`linkAnchor`, `followAnchor`), opened on a click, a middle-click or Enter. It is previewed
    on hover, and on a long press by touch.
  - An address outside the vault is kept in `data-href` with `href="#"` and no context menu, so nothing reaches the
    browser past the dialog.
  - One never opened is shown as text.
  - A broken one is marked, with Create the note and Change it to what it most likely meant (written through the card's
    `writeBlock`).
- `link-marks.ts` (now the shared layer's, `core/src/display/links/`) — marks on the drawing. A line of a box's or
  link's words holding a link is drawn as a link (broken, dashed). A thing with attachments gets a paperclip with the
  count, said to screen readers.
- `rename-follow.ts` — `followLinks`, on the vault's rename event. Every link to the renamed note or file inside a graph
  block of any note is rewritten. It goes through the note's editor when open (one undoable change), else
  `vault.process`. A note the metadata cache says holds no code block is never read.

### `src/block-editor/` — the text of one graph block, in the pane or in place

**The editor is the display layer's** (editor spec §26, C9). It lives in `packages/core/src/display/editor/` and is
imported as `@thoughtknot/core/display/editor/<module>`. It is the same code the browser editor's page runs.

`block-editor.ts` (`BlockEditor`) ties the parts together: the field and what typing in it does. After another program,
a sync or another pane changes its block, Undo and Redo keep their names, so voice control finds them. They are marked
unavailable and described by why there is nothing to take back (undo_never_over_theirs). Switching block in the picker
starts that block's own history (undo_stays_in_its_block).

The other modules are `editor-layout.ts`, `block-picker.ts` (the picker and Open again), `typing-rests.ts`,
`kept-field.ts`, `typing-keys.ts`, `inline-completion.ts`, `editor-history.ts`, `added-for-you.ts`, `text-help.ts`,
`text-picture.ts`, `problem-help.ts` and `suggestions.ts`. There is also `kept-draft.ts`, the draft banner, which acts
on the very draft shown, by its id. `pane-drawing.ts` is the pane's own drawing, with a View menu of its own (§25).
`lock-text.ts` is the text Lock the graph writes.

What the editor asks of its note is one interface, `editor-note.ts` (`EditorNote`). The layer's own guide
(`packages/core/GUIDE.md`) says what each does. The plugin keeps what is Obsidian's:

- `block-editor.ts` — `BlockEditor`: the layer's editor wrapped in a `Component` Obsidian owns, to load and unload with
  the pane or the plugin. It works over the vault's note (below). Its public surface is what the pane, the cards and the
  editors in place use (`mount`, `open`, `flush`, `replace`, `reveal`, `done`, `detach`, `selected`, `lists`).
- `block-note.ts` — `BlockNote`, the layer's `EditorNote` over the vault: opening, writing, undo, Lock, drafts.
  - The note is followed when it is renamed or moved. What is typed is kept as a draft when it is deleted.
  - Each editor's own draft is known by its id, beside another's.
  - Stopped by a copy, the stop is said once. Typing after it is saved quietly as the editor's own draft, at each pause
    and at each change from outside. There is no banner or notice again, so it is never held in memory alone.
- `note-writing.ts` — writing safely, through the note's editor or the vault.

## Tests, `test/`

The tests load the built `main.js` in Node against stand-ins for the host. Each test file is named after the module or
folder it tests. `graph-view-zoom.test.js` tests zooming in `src/graph-view/`, and `pane-writing.test.js` writing from
the pane. A test file that spans modules is listed in `CONTRIBUTING.md` instead. Run one with `node --test test/<file>`
from this package, or all with `npm test` from the repository root. Each builds `main.js` first.

- `test/host/` — the stand-ins for the host and what the tests share.
  - `fake-dom.js` — a small DOM.
  - `fake-settings.js` — the settings page, drawn from its definitions, and the secret store.
  - `fake-obsidian.js` — the obsidian module and CodeMirror, with a dialog and a `requestUrl` that never reaches the
    network. Each request is kept, and answered by the test's own `state.reply`.
  - `fake-markdown.js` — Obsidian's MarkdownRenderer, each render kept with what it was handed, and its Keymap.
  - `load-plugin.js` — building and loading the plugin.
  - `cascade.js` — the part of the CSS cascade a test needs.
  - `notes.js` — a fenced block, a button by its label.
  - The notes each group of tests opens: `card-notes.js`, `pane-notes.js`, `view-notes.js`, and `inspector-steps.js`
    (opening a box's details and driving the inspector's rows, menus and chips).
  - `editing-view.js` opens a note in the editing view, in Live Preview, with the plugin's own extension and view
    plugins. It closes it as Obsidian closes an editor, and gives the cards it would draw. A component's `registerEvent`
    is released when it unloads. `state.listening()` counts the vault's listeners, so one left behind shows.
  - `workers.js` stands in a browser's Worker: each runs the code main.js hands it, from its Blob URL, in a real thread.
  - `fake-vault.js` stands in the vault's ways of making files (create, modify, rename, delete, a folder). One of them
    can be made to fail as a full disk would. A rename and a deletion are told to whoever listens. It also stands in the
    metadata cache's front matter.
- `test/device-checklist.md` — what is checked by hand on the devices. Every item has a number that never changes
  (`V-03`: its section's letter and two digits). Each item after Before has a note in `test-vault/Device checks/` that
  shows the case on a graph to try it on. `test/device-check-notes.test.js` (repository root) holds the two together.

## The harness, `harness/`

A browser page that loads the plugin against a shim of Obsidian, to see and try it outside Obsidian.
