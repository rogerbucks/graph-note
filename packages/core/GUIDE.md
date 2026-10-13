# The core: where things live

The host-free core of the graph note editor (spec §10): what to draw, problems and their fixes, zoom, edits and undo.
It imports no host — no Obsidian, editor or Node module — so the same code runs in Obsidian on a desktop or a phone and,
later, in VS Code. It is written in erasable TypeScript, so Node runs its tests with no build.

## The entry

- `src/index.ts` is the package's one entry: everything a host uses is exported from it, and only from it.
  `test/index.test.js` holds its list of names, so a change to it is a decision, not an accident.

## The source, `src/`

Every module is flat in `src/`, one purpose each, named for it. Each opens with a comment saying what it is for.

**Reading a note**

- `whitespace.ts` — whitespace as GQL names it, the one set every reader uses, never JavaScript's `\s` or `trim()`.
- `blocks.ts` — where each gql block of a note is, and what its graph line says.
- `block-items.ts` — a block's top-level items (paths, SET, MATCH), so a bad one can be left out.
- `partial-read.ts` — reading the blocks as far as they can be read, with a problem for each part left out. A failed block
  is read again on its own, and each line found from an index of the block's lines: the same reading as before, proved
  against the old one kept in `test/partial-read.test.js`. Past a budget of reading again (`REREAD_BUDGET`, 4 million
  UTF-16 units), the rest of a badly broken block is left out at once, so reading never holds the page (spec §9); the
  Python reader (`graphspec/reader/drawing.py`) counts and cuts exactly so, so both still draw alike (drawn_in_part).
  A card is read from the blocks up to its own (`upTo`), but names are suggested against every block, so the card, the
  whole note and every edit agree on a thing's suggested name, and its fix never writes a name a later block has
  (suggested_name_unique).
- `written-things.ts` — the things written in a block, found by their parentheses: name, kinds, properties, where they are.
- `name-gaps.ts` — the things of a block that lack a name or a text, with the suggestion and a fix that writes it. No name:
  a warning, and the thing is read as if the suggested name were there, in a copy, never in the note. No text: a hint
  (severity `hint`: offered in place, never counted as a problem), unless a SET or the thing written elsewhere gives it text.
  The warning carries the name (`suggested`), and the box drawn under it carries where its ( is (`Box.suggested`), so it
  is drawn dashed and labelled as suggested, selected by `spanOf` and fixed from its details. The Python library suggests
  the same names (`graphspec/reader/name_gaps.py`); `python/graph_spec/tests/name_cases.json` holds both to one table.
- `suggested-names.ts` — `acceptNameFirst`: why an edit naming a thing drawn only under a suggested name must wait ("accept its
  name first", saying which text and which name), so nothing writes the name before its fix is accepted
  (unnamed_drawn_suggested). `pathBlock`, `makeList` and `addToList` (the thing, or a value that reuses one) ask it
  themselves; so do `parkForLater` and `styleEdit` (a nudge, a look or a view's selection naming one) and `addView`
  (view-write.ts, the one way a host writes a view into a note). Each checks the note it writes into as it is then,
  never an older drawing: `styleEdit` and `addView` read the note itself with `unnamedIn`, which uses the reader's own
  `prepare` and its rule for a box drawn suggested (`suggestedPlaces`, which drawing.ts uses too), so the two cannot
  differ; the edits into one block (`parkForLater`, which requires it, `pathBlock`, `makeList`, `addToList`) take the
  reading of the note as it is now with the block as typed, which a host gives (`PaneSession.current()`), for a quick
  answer; the check that counts is made as such an edit is written, against the note written into (`edit-check.ts`).
  So no caller can leave the check out. Property edits are refused too
  (`setProperty` finds no pattern for a name that is not written), the host saying why in these words. A name only
  suggested is also left out of the names completed while typing and of the near misses guessed (`help.ts`, `estimates.ts`).
- `schema-checks.ts` — the warnings for types a schema does not declare.
- `note-reading.ts` — the types reading gives: `NoteReading`, `GraphDrawing`, `Problem`, `Block`, `Box`, `Link`.
- `drawing.ts` — `readNote`: what a note's graph blocks draw, built from the modules above.
- `estimates.ts` — near misses drawn as guesses; never a guess of a thing drawn under a suggested name, whose name nobody
  has written (a fix changing a word to it would write it unaccepted).
- `estimate-places.ts` — where an estimated name is written in its block (`BlockPlaces`): at the path's own reference
  to it, never the same word in a text or another link on its line. `estimates.ts` gives the problem and the estimate
  that `span`, and a type's problem the place in its brackets, so the fix bar, the quick fix and Edit the link all land
  on the word; with both ends misspelt, one fix changes both (`also`), as the sentence says.
- `estimate-fix.ts` — `estimateFix`: accepting an estimate is its problem's own fix, the one `help.ts`'s `diagnostics`
  offers in the fix bar, found at the estimate's `span` (so an editor can select the word there); none for a text that
  is not that block as read, so a fix never writes blind.
- `completeness.ts` — the completeness report behind the problems badge.
- `deferred.ts` — deferred things (§5, §8): `parkForLater` writes a Deferred (what, why, an optional revisit day and rule)
  as a block's last items, with the comma GQL needs and a fresh `later_<thing>` id (fresh in the whole graph when the
  note's reading of it is given), and refuses an empty what or why, a block ending with SET or MATCH, and a locked graph
  whose schema does not declare Deferred and DEFERS (the graph library checks them like any type), with a
  `DeferredNotDeclared` (same words, a `code` and the `lacking` names) so a host can offer the fix;
  `declareDeferred(note, graph, indent)` is that fix: the note with Deferred and DEFERS declared, as Lock writes a
  declaration (readings `defers` and `is deferred by`; the library's guess misspells the second), in the block that holds
  the graph's GraphMeta, only what is lacking, with fresh ids and the comma GQL needs, every other byte kept; it refuses
  a draft, a graph typed by a shared schema, a schema with no GraphMeta or one whose id is not a plain name (it says
  what to rename it to), and a block ending with SET or MATCH. `declareDeferredBlock(blocks, graph, indent)` is the same
  on the blocks' texts, giving the block's index and new text, for a host that is editing that block itself. The
  declarations are a change of the schema, not of the parked thing: written into another block they are not undone
  with the park; they stay until they are taken out by hand.
  `parked` says which things some Deferred defers and which are overdue (every Deferred on the thing is past its
  `revisit_by`, as `completeness.js` counts), and `parkedCount` how many of each, apart from the problems. `readNote`
  sets `Box.deferred` on each such box (it takes the day as its fifth argument, the current day by default); the layout
  source is untouched, so the host draws the dashing and the later mark on the finished drawing.

**Drawing**

- `layout.ts` — the Graphviz layout source, byte-identical to the Python library's, a box drawn under a suggested name
  dashed and labelled so in both.
- `engine.ts` — starting the bundled Graphviz engine, WebAssembly: the one module that imports it, and only the entry
  imports this one, so the rest of the core runs in a host with no WebAssembly, such as a Claude Code mod.
- `render.ts` — laying out with the engine it is handed, or around one run elsewhere (`directions`, then `chosen` with
  the SVGs it drew), and what a box's or link's details are.
- `layout-limits.ts` — how large a graph may be before it is shown as text (spec §9, layout_contained), each limit with
  its reason: the note's text, measured before it is read (`READ_LIMITS`, `textTooLarge`, which `readNote` applies to the
  graph blocks and shared schemas, never to a query or an excerpt); the things, links, longest word and drawing
  instructions, before any layout (`LAYOUT_LIMITS`, `tooLarge`); and the tighter ones on the page's own thread
  (`PAGE_LIMITS`). `READ_LIMITS` are the plugin's alone, a known exception to drawing as the Python reader does
  (drawn_in_part): over them the plugin reads and draws nothing, so there is nothing to compare.
- `layout-worker.ts` — the layout kept apart from the interface: both sides of the talk with a worker, through a port the
  host gives it — the worker's (`serveLayouts`: its engine started at once, and "ready" said) and the page's
  (`LayoutRunner`: one worker reused; each layout timed from "ready"; a fresh worker after one overruns, none after three
  in a row; the page's thread only when the first worker cannot start, where every layout already queued is held again to
  the page's lower limits; a layout superseded before it starts dropped). A layout may ask for a fixed theme (`light` or
  `dark`), which the worker themes it in: that is how an export is laid out, in the same worker and under the same limits.
- `theme.ts` — the drawing's colours and size, from the theme, in the host's palette; `hueColour` is the one blend every
  hue is drawn through, kinds, readings and the style graph's looks alike.
- `palette.ts` — the one colour mapping (spec §10): how each host writes the style's colours. Obsidian's entry names
  its theme variables; the fixed light and dark entries, for a host that draws the SVG as an isolated image (a Claude
  Code pane), are worked out to hex and paint their own page, with the locked contrast held; the system entry carries
  both in the drawing's own style sheet, `prefers-color-scheme` choosing, for a host that cannot say which it shows.
- `hits.ts` — what a tap lands on or near.
- `zoom.ts` — zoom, pan and full screen.

**Editing**

- `pane.ts` — the edit session: what is typed, written back to the note safely; `texts` gives the note's blocks with the
  typed text in the edited block's place, and `current()` the note as last seen, read so. `edit` is an edit made from
  the drawing: the names it newly writes are checked as it is written, and a refusal reloads the block and keeps the
  edit as a draft (`edit: true`).
- `edit-check.ts` — that check (§4): `editRefusal` refuses a name the note written into draws only under a suggested
  name (accept its name first), or a name the edit gives a thing that another block of the graph gives too (already a
  name); `newNames` finds the names an edit newly writes.
- `store.ts` — replacing or inserting a block in a note, keeping every other byte.
- `history.ts` — the text's own undo history.
- `help.ts` — diagnostics, fixes, completions and the read-back, in the shapes of the Language Server Protocol.
- `tokens.ts` — the gql-highlight tokenizer, for colouring.
- `name-suggestions.ts` — a name from a text, in the style of the graph's names and never one of them or a reserved
  word; a text from a name; and the ASCII words and slug of a text (`nameWords`, `nameSlug`), as the graph reader's names allow.
- `name-book.ts` — a graph's names kept up to date as names are added, its style and the names taken with them, so
  naming thousands of things never freezes the page (spec §9); each name the one `nameFromText` gives.
- `add-thing.ts` — adding a thing (add_thing): `suggestName` gives the name for a text, from a `NameBook` of the graph's
  names (the note as read and the block as typed, written or only mentioned), in their style and never one of them;
  `addThing` writes the thing after the block's last item, `(name:Kind {name: 'text'})` under the key the kind's other
  things use, and refuses with the reason when there is no text (it is asked for first), the name is not one word, is
  kept by the language or is taken (an `id` typed in the block counts), the kind is a schema label or is not declared by
  a locked schema, or the block holds only a SET or MATCH.
- `commas.ts` — the comma and the colon added for you.
- `autocomplete.ts` — completing as you type: the one best inline match (a closer, keyword, kind, type, property name or
  value) and the closer stepped over; nothing is inserted unasked.
- `inspector.ts` — properties of a thing or link, edited as text.
- `linked-list.ts` — a property held as things linked to this one: made, added to and removed from, as text edits.
- `lists-held.ts` — the lists a thing holds, read from a drawing (`listsOf`, `linkedValues`); `linked-list.ts` re-exports them.
- `lock.ts` — Lock the graph: a draft's schema written out, indented as the settings say; `kindLines` and `typeLines`
  are the lines that declare one kind or relationship type, which `declareDeferred` writes the same way.

**Paths (spec §7; graph spec §22)**

- `paths.ts` — walked paths. `PathRecorder` takes the boxes tapped in order (the last step tapped again is ignored; an
  earlier one is added again, as a walk may revisit). `pathBlock` writes the walk at the end of a block as a `Path` node
  with `STEP` edges numbered 1 to n, comma-joined, with a fresh id in the graph's style, and refuses with a reason when
  there are no steps or no title, a step is not a fact in the graph, or a locked graph does not declare Path and STEP.
  `pathsOf` gives each path as data: its steps in seq order, each marked `missing` when the thing is not in the graph
  (the reader leaves such a STEP out and reports it; `paths.ts` finds it again in the problem's `dropped` text), and the
  path marked `empty` when it has no steps. `PathPlayer` plays one path step by step with a screen-reader sentence for
  each ("Step 2 of 5: …"); a missing step is stopped on and announced as missing, and a path with no steps is refused
  (`PathPlayer.refusal`), never played as an empty story. `pathProblems` reports a STEP through something removed, on the
  STEP's own line with its fix and, where the step sits on one line, the edit that removes it, and a path with no steps;
  `mergePathProblems` is what `readNote` uses to put them in `NoteReading.problems`, replacing the reader's own report of
  the same STEP, so the badge counts each once.
- `path-edits.ts` — a step taken out numbers the later steps of its path again (`stepsAfter`), carried as the removing
  fix's further edits (`Problem.also`), so the path keeps §22's steps 1 to n.

**The style graph (spec §2, §6, §7)**

A graph's nudges, the properties it shows and the styling of its views and paths are a graph of their own, written in a
style block beside it: `// graph: trip_style · STYLE trip`. `blocks.ts` knows one by its graph line (`styleOf`), and
`dataKind` never takes it for data, so `readNote` never reads or draws it and the data reads the same with or without
it. A graph line that says STYLE but names no graph is a problem, never data.

- `style-graph.ts` — what a style graph holds once read (`StyleGraph`: nudges, shows, looks, each view's fade or hide,
  how each view was shown, the direction, where arrowheads are hidden) and the words it allows: the four nudge words, the
  lines, the formats, fade or hide, on or off (`INLINE`), show or hide (`ARROWHEADS`), and the colours, which are only
  the locked style's hues by name (`STYLE_HUES`). A Show switches a property on or off inline for a kind, a thing or a
  relationship type's links, in the whole graph or one view; an Arrows hides or shows arrowheads for every link or one
  type's, in the whole graph or one view.
- `style.ts` — `readStyle`: every style block of a graph read with the data's own reader (`readBlocks`, told which blocks
  to read), so what cannot be read is a problem on its line and the rest is used; never a throw, and a style too large
  to read is not read (the locked style is kept, and why is said). `lookOf` is the look of a thing or link in a view or
  path (a named hue, a line, a format; the thing's own look over its kind's); `legendOf` every colour used there with
  what it means; `outsideOf` a view's fade or hide, fade when none is written.
- `style-checks.ts` — each style thing checked on its own: its kind, its words, its values, and every name it uses
  (thing, other, from, to, selected, kind, relationship type, path, property) against the graph it styles, a name not
  there given the nearest (`estimates.ts`'s `nearest`) as its fix. A view's name is not checked: views are query blocks,
  and a name is the user's own (`style-words.test.js` holds that, however odd the name). A thing with a key its kind does
  not know (`STYLE_KEYS`) is reported and left out; a message quotes a written word as written, `$` and all.
- `style-words.ts` — the words of a style graph checked (style_words_checked): `unknownKeys`, a problem on each key the
  kind does not know, fixed to the nearest key the thing does not already write (several equally near: each a fix; none
  near: the keys to choose from, no edit), and `readFrame`, a frame as four numbers joined by single commas (an optional
  sign, digits with a dot before or after them, an optional exponent; never hexadecimal; no space, no stray comma).
  Stray commas and spaces are a problem whose fix is the list without them, even when that is not four numbers yet; a
  part that is not a number has no edit. A thing with such a key is not also told what it lacks (`RawThing.misspelt`):
  the rename comes first, then what is still absent is said.
- `style-conflicts.ts` — the things checked against each other: two directions, beside and before on one pair, a thing
  in two groups, a loop of befores, a view set to both fade and hide or saved twice, a colour given two meanings in one
  view or path, a property switched both on and off, or arrowheads both hidden and shown, for one place in one view. The
  first written is kept, the later left out, each with a problem.
- `style-source.ts` — nudges applied after the layout source is made (`nudgedSource`: beside a `rank=same` line, before
  an invisible link after every drawn one, group a labelled cluster), and direction set on the drawing (`nudgedDrawing`).
  With no nudges the source is returned unchanged, byte-identical to the Python library's. The Python library honours
  nudges the same way (`graph_svg.nudged_source`, its style read by `gql_profile.read_style`), held to the core byte for
  byte on `python/graph_spec/tests/nudge_cases.json` by `test/layout-parity.test.js` (python_honours_nudges).
  `styledDrawing` is the drawing as its style draws it in a view or the whole graph, as every host draws a graph, a view
  or an export: its direction and nudges, the links it draws without arrowheads, and the properties it shows inline.
- `arrows.ts` — arrowheads hidden or shown (§15): `arrowsShown` (the most particular choice — a view's over the whole
  graph's, then a type's over every link's — shown when none), `arrowlessLinks` (the links a drawing draws without them,
  guesses included) and `arrowlessSource` (`dir=none` written on those links). Only the arrowhead changes, so each link
  keeps its reading when tapped and in the text version (direction_never_lost).
- `inline-properties.ts` — properties shown inline (§14): `inlineRows` (each box's and link's rows, its most particular
  Show deciding — a view's over the whole graph's, then a thing's over its kind's), `valueText` (a value said as the
  reader keeps it), and `inlineSource` (the rows below a box's text or a link's reading, at the kind caption's size, in
  the box's text colour or the link's label colour; past `INLINE_ROWS`, whole properties and how many are hidden). The
  Python library draws both the same way (`graphspec/style/arrows.py`, `inline.py`), held to the core byte for byte on
  `python/graph_spec/tests/style_cases.json` by `test/layout-parity.test.js` (arrows_both_renderers).
- `style-edit.ts` — `styleEdit`: a nudge, a look, a view's fade or hide, how a view was shown, a property switched on or
  off inline, or arrowheads hidden or shown, written as text into the graph's style block (made after the graph's last
  block when there is none); a view's setting, or a choice of properties or arrowheads for one place, changed in place,
  never written twice; never a data block touched. A styled hue is drawn with `theme.ts`'s `hueColour`, the same blends as a
  kind's, so it meets the locked contrast.

**Views (spec §2, §7)**

A view is a named query block in the note: `// graph: <graph> · QUERY view <name>`, then the query. The reader already
reads `· QUERY` as a query, and the core draws no query as data, so a view is never drawn as a graph of its own.

- `views.ts` — `viewsOf` finds the views of a note (each with its graph, its block and its query text; a block meant as a
  view with no name, a name that is not one word, or a name already used in its graph is listed with a `fault`, never
  skipped), and `readingOf` says a view in plain English ("everything within 2 steps of Alice").
- `view-profile.ts` — the view profile: `parseView` reads the five shapes of query (a hand-picked set, everything near a
  thing, how one thing reaches another, only some kinds, a walked path) into a `ViewSpec`, and refuses anything else with
  a message that names the five shapes in words and shows the nearest one's form (`VIEW_NAMES`, `VIEW_FORMS`). The
  queries are ISO GQL that Grafeo runs as written. A thing is named by its `id` property, which the reader writes into
  every node it gives Grafeo and the core's world keys every node by. Several kinds are written after `IS`
  (`(n IS Person|Team)`), because Grafeo does not read `(n:Person|Team)`; a colon takes one kind. A name the query gives
  a thing or a route is never a word `reserved-words.ts` keeps from names, and a kind is never one it keeps from kinds;
  `viewQuery` refuses such a kind with a RangeError that says why.
- `reserved-words.ts` — the words a view may not use, in any case. As a name: GQL's reserved and pre-reserved words
  (ISO/IEC 39075:2024 §21.3) and its truth values (§21.2), as the openGQL grammar lists them, and the words GQL leaves
  free that Grafeo 0.5.43 refuses as a name, NaN and Inf among them (`GRAFEO_REFUSED`). As a kind, which is a label: only
  the fewer words Grafeo refuses as a label (`GRAFEO_REFUSED_KINDS`), so Path, Match and Nothing may still be kinds. The
  Python library's `test_view_parity.py` holds both Grafeo lists to Grafeo, from a word list of its own. A refusal says
  only that GQL keeps the word, and suggests another.
- `view-write.ts` — `viewQuery` writes the query for a view built by tapping, always one `parseView` reads back to the
  same view (steps held to 1 to 3 near and 1 to 6 reaching; a long set of names goes over lines), and `viewBlock` writes
  the whole block. `makeView` makes a view's block (the entry exports it, not those two) and says in words what no query
  can say; `addView` is the one way a host writes one into a note, after its graph's last block, against the note as it
  is then: it refuses a view of a thing only suggested there ("accept its name first") and a name another view has.
- `view-evaluate.ts` — `evaluate` puts a view to a graph of a reading, never to a copy of it, and gives its things, its
  links (indexes into the links the graph draws) and, when nothing matches, `empty` with a sentence saying so and what to
  change. A route of up to k steps is a walk, as Grafeo takes it (a link may be used again), found by two breadth-first
  searches. The things were compared with Grafeo's answers for the same queries on random graphs, and are held to them
  by one table, `python/graph_spec/tests/view_cases.json`, which `test/view-parity.test.js` holds the core to and the
  Python library's `test_view_parity.py` holds Grafeo to.

**Export (spec §16)**

The host does what needs a canvas, the file system or a dialog; the core decides everything else. An image is exported as
SVG or PNG (`EXPORT_FORMATS`), of the whole diagram or of a view, in the fixed light or dark colours chosen.

- `export-scope.ts` — `exportScope`: what an export holds. The whole diagram is the graph as drawn. A view is put to the
  graph as `evaluate` puts it and holds only its things and the links between them, in the graph's order, with a guess (an
  estimated link) still a guess at its new place; with the faded context asked for it holds the whole graph and lists what
  is outside the view (`faded`: things by key, links by edge number). An empty graph or view is `empty`, with `why`.
- `export-marks.ts` — fading and looks written into the SVG (`marked`): an opacity in the style attribute of the group of
  each faded thing and link (the pane's 0.35), and each look's border, text, line and format as style declarations in the
  locked blend of its hue, as the pane's stylesheet draws them, because an image cannot take the stylesheet. Groups are
  found by Graphviz's numbering (`node1`, `edge1`…) in a single pass.
- `export-frame.ts` — the frame (`framed`): the image's own background, a title, the reading of a view, the legend, and a
  footer with the note and the day (`saidDate`, `11 Oct 2026`), in the locked style's font and sizes and the palette's
  fixed colours. The drawing is nested inside at natural size. Text widths are estimated, so long lines wrap early.
- `export.ts` — `exportWithLayout`: lays the scope out through the layout the host hands in (`ExportLayout`: the one its
  drawings use, apart from the interface and under the same size and time limits, so a huge or hostile graph never
  holds the page for an export), in `PALETTES.light` or `dark`, marks it, frames it, and gives `{ svg, width, height }`
  with no theme variable or `color-mix` in a colour (it throws if one is left). A layout over a limit, or timed out, is
  given back whole as its `Refusal`, for the host to say why and write nothing; null when it is no longer wanted. An
  empty scope is refused before any layout is asked for; an engine failure is raised. `exportSvg` is the same with an
  engine run on the calling thread under no limit: for tests and tools, never a host that draws apart from its interface.
  `pngSize` is the PNG's pixel size, never under `PNG_MIN_SCALE` (twice natural size) and rounded up. A view's looks are
  drawn and put in the legend with what they mean.
- `export-plan.ts` — `exportPlan`, the one decision before anything is written: `{ nothing }` for an empty scope,
  `{ ask }` for a note classified above the configured level (naming both; a classification not in the list counts as
  above every level; the host asks again with `confirmed` once the user says yes), or `{ go }` with the file's name and
  place and, as configured, the companion note's. A name is made from the note, the graph or view and the day, safe on
  every platform; a folder setting that could leave the vault is not used.
- `export-note.ts` — `companionNote`: the Markdown that links the image and the source note and names the graph or view,
  the day and the scope, with nothing of the data beyond what the image shows.
- `export-write.ts` — `writeSafely`: the bytes go to a temporary file given by the host's `write`, then `rename` into place;
  on any failure the temporary file is `remove`d, the target is never touched, and the result says why in a sentence.

**Settings (spec §21)**

- `strictness.ts` — the three departures from standard GQL the reader reads as meant (each problem says which, in
  `Problem.departure`), what Standard, Forgiving and Simplified make of them, converting a note back to standard GQL,
  checked before it is written, and the standard text an engine or an export is given whatever the level.
- `settings.ts` — every option with its name, sentence, choices and default (`OPTIONS`, `DEFAULT_SETTINGS`), and saved
  settings read back with anything unknown, out of range or secret left out (`settingsFrom`). An AI model keeps the
  name of its key in the host's secret store (`keyName`), never the key. The Export section holds the export theme (light
  or dark), whether an export saved in the vault gets a companion note, the folder exports go to (`vaultFolder` keeps it
  inside the vault; empty is next to the note) and the classification above which an export asks first (one of
  `classifications`, the lowest until chosen).

## Command-line tools, `bin/`

- `bin/layout-source-node.mjs` — writes the layout source of every graph in a set of notes, for the vault's
  conformance check. `esbuild.layout.mjs` bundles it into `dist/`.

## Tests, `test/`

Each test file is named after the module it tests (`zoom.test.js` tests `zoom.ts`; `layout-parity.test.js` tests
`layout.ts`), or, when it spans modules, is listed in `CONTRIBUTING.md`. Run one with `node --test test/<file>`, or all
with `npm test` from the repository root.

A test asserts the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026). Where what is held is
work, such as a text never read, a block read again only within its budget or drawing instructions never written, the
test counts it with `test/reader-work.js`, paired with a control that shows the same count sees the work when it is
done: a count is the same on every machine, under load and under coverage. What the core's work costs — 50 things
drawn, the worst reads at the size limits, the refusals, naming thousands of things, a keystroke reaching the note, and
each ratio between two sizes or two cases of the same work — is counted in CPU instructions by the benchmarks in
`scripts/benchmarks/`, run under Cachegrind on every release (`scripts/instruction-counts.mjs`), never timed in a test.
`scripts/timed-assertions.mjs` finds any assertion on elapsed time, and `test/timed-assertions.test.js` fails on one.
