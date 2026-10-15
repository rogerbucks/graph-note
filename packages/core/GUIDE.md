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
- `note-reading.ts` — the types reading gives: `NoteReading`, `GraphDrawing`, `Problem`, `Block`, `Box`, `Link`, and
  `ThingNote`, a note on a thing or a link.
- `notes.ts` — notes on things and links (editor spec §24): `addNotes` reads each data block holding `///` with the
  graph library's `notes`, which the Python reader is held to by one table, and puts each note on the box or link drawn
  below it (`Box.note`, `Link.note`: its CommonMark text, its summary, its block and its `///` lines). It reads the
  block as the reader read it (`readBlocks`' `read`: with the suggested names in, and with what could not be read left
  out), so a thing drawn under a suggested name keeps its note. A note above a line holding more than one thing belongs
  to none of them, and is a warning whose fix says to put the thing on its own line; each note on what the reader left
  out is a warning that it is not shown, found, when the block cannot be read whole, as each run of `///` lines directly
  above a line where an item left out begins (`read`'s `dropped`; every item of a block left out whole); a note on a thing already noted where it is first written is a hint naming it, the
  first note kept. The layout source never reads a note.
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
- `hits.ts` — what a tap lands on or near, and where a box is (`boundsOf`, as fractions of the drawing; `centres`); a
  link merged into a trunk (§25) by either of its lines.
- `zoom.ts` — zoom, pan and full screen, and `resize` for a new viewport or a drawing laid out again (§25); `reveal` brings a box into view, centred, and leaves one already in view alone;
  `aim` says where the view would go to do so, keeping the zoom unless it is below a scale given (§25); `keepClear` keeps
  a strip at the viewport's foot clear, as a sheet covers it, letting the drawing pan up into it by as much and no more.
- `zoom-fit.ts` — the limits `Zoom` holds a drawing within: `MAX_SCALE` and `STEP`, the scale that fits the whole
  drawing (`wholeFit`, and `fitScale`, never above natural size in a note), the furthest out (`outLimit`: the whole
  drawing's fit, or natural size when it fits larger, in place of §3's quarter, zoom_out_to_fit; `Zoom.outLimit` says
  it), and where it may sit in its viewport (`clampPan`), each worked out from the sizes given whenever it is asked, so
  a resized view, full screen or a drawing laid out again has its own (zoom_fit_recomputed); `resize` brings a drawing
  shown below the new fit up to it. A viewport with no size (`hasSize`), as a hidden card or one not yet laid out has,
  has no fit yet (`outLimit` 0, `held` keeps any scale above 0), and a resize to it is no resize: only the drawing's new
  size is taken, so a hidden card keeps its zoom and a zoom restored before layout is kept; one fitted when hidden is
  fitted again, to the size it was laid out at meanwhile, at the next resize with a size.
- `zoom-across.ts` — `AcrossZoom`, a `Zoom` that only adds to it: a wide drawing fitted to its height, shown from its
  start and moved across only by one finger, until it is zoomed in; a pinch as any drawing's (a tree, flow or timeline
  on a phone, §15 wide_types_phone).

**Finding your way round a large graph (spec §25)**

Pure and host-free: each says only what to keep at full strength, hide or bring forward, so a host changes the drawing
and nothing else (untangle_data_untouched). Nothing here is written to a note or saved, but the legend's choices, which
a host writes into the style graph when the user saves a view as shown (untangle-saved.ts).

- `focus.ts` — focus on a selection: `focusOf` keeps a thing, its links and the things at their other ends (to two steps
  by the setting), or a link and the two things it joins; `highlightOf` is what the pointer, keyboard focus or a touch's
  tap marks; `FocusState` is the selection, cleared by an empty tap or Escape; `edgesOf` numbers the drawing's links as
  its SVG does (written ones, then the estimates of a name), `estimateEdge` finds one. `FADE` and `KEPT` are how a faded
  and a kept thing are drawn, by strength and outline, never by colour; `focus.test.js` holds `FADE.text` to 4.5:1 in
  both themes, and the host's `styles.css` to these numbers.
- `untangle.ts` — `neighbourhood` (a thing and what is within one or two steps, filtered to), `kindLegend` and
  `LegendFilter` (choosing a kind or relationship type brings it forward, again hides it, once more puts it back),
  `shortestPath` and `pathWords` (fewest links, either way; or that there is none), `find` (by name or property),
  `nextAlong` (an arrow key walks to the neighbour in that direction), `emphasis` (a path over the selection over the
  legend), and `Untangle`, which holds all of it for one drawing and works it out into `layers`: what is kept and what is
  hidden. `LegendFilter.choices` gives the legend's lines brought forward or hidden, kinds first, each by name, and
  `restore` puts them back; an `Untangle` made for a view saved with them starts with them.
- `untangle-saved.ts` — the legend's choices saved with a view (untangle_legend, view_saved_as_shown): written by
  `styleEdit` as a Shown's `legend` ('kind:Person forward, type:NEAR hidden', `legendText`) only when the user saves the
  view as shown, never otherwise, a choice that is no legend's refused first (`legendRefusal`); read and checked by
  `legendChecked` (an empty entry, one that cannot be read, a state not allowed, a kind or type the graph lacks with the
  nearest, a line chosen twice: each a problem on the Shown's line with its fix, the rest kept). The Python library
  reads it the same (`graphspec/style/legend.py`), held to `python/graph_spec/tests/legend_cases.json` by
  `test/untangle-saved-parity.test.js`.
- `untangle-fold.ts` — folding (untangle_hubs, untangle_groups, untangle_merge): `BUSY_HUB` (a thing with more links is
  a busy hub), `busyHubs`, `drawnGroups` (the groups the nudges draw, as `nudgedSource` boxes them; none in lanes),
  `foldPlan` (what a drawing folds and merges: things hidden with a hub, links folded into a stub or inside a folded
  group, each hub's count, every group and whether it is folded, and whether links between groups merge), and
  `foldsHiding` (the folds a found thing is hidden in). Plain lists, so the plan crosses to the layout worker.
- `fold-source.ts` — the plan written into the layout source last (`foldedSource`): a stub with its count for each hub,
  a box with its count for each folded group, two or more links from one group to another drawn through one trunk, each
  link still its own two lines (`edge7_tail`, `edge7`), and every box and link still drawn given the id Graphviz gave it
  unfolded, so the host finds each by its number as before; and `routedSource`, links straight (`splines=line`) or
  right-angled (`splines=ortho`, readings as `xlabel`). Nothing to fold or route: the source unchanged. The Python
  library writes the same (`graphspec/style/folding.py`, `fold_source.py`), held to it byte for byte on
  `python/graph_spec/tests/fold_cases.json` by `test/layout-parity.test.js`.
- `view-switches.ts` — the View menu's four switches (view_switches): `VIEW_SWITCHES`, `SWITCH_NAMES`,
  `startingSwitches` (from the settings' defaults, the style graph's merging and a view's switches saved as shown,
  view_switch_defaults), `labelsHidden` and `LABEL_SCALE` (a link's label under 11 pixels is hidden, untangle_labels),
  and `ViewState`, one card's switches and the folds opened since, which folds a styled drawing for its layout
  (`folded`), offers a hub's fold from its details (`hub`) and gives the switches a view saves (`saved`); the drawing's
  alone, never written to the note (view_switch_view_only).
- `details-nav.ts` — finding your way from a thing's details: `linkGroups` (its links by relationship type and direction,
  in words with a count: "is reported to by Bob and Cy (2)", the reverse reading the schema's or the library's guess, a
  thing linked twice the same way named once with each of its links),
  `Trail` (the things chosen from them, back and forward), `glideAt` and `MOVE_MS` (the brief eased move to a chosen
  thing), `READABLE_SCALE` (below it a thing's words are under 11 pixels, too small to read), `pointerTo` (the arrow at
  the view's edge pointing to a selection out of sight), and `sheetLimit` and `coverOf` (how tall the details sheet may
  be, and how much of a viewport it covers).

**Links and attachments (spec §18)**

The core finds and judges links; the host says which files the vault holds, and opens, previews and renders through its
own handlers. Nothing here reaches the network.

- `links.ts` — the entry for §18, re-exporting the three below: `linksHeld` (every link in a thing's or relationship's
  text properties, by property), `attachmentsOf` (a thing's files, by name and type, each once), `noteOf` (a thing whose
  id is a global note id, `note:` and the note's name as graph spec §10 writes it, or a link to a note, stands for it),
  and `brokenLinks` (each written link found from where the last of the same was, what it meant worked out once per
  target) (each link to a note or file the host's `LinkVault` does not
  hold: a warning on the line it is written, its fix in words, Create the note or Put the file in the vault, or change it
  to what it most likely meant — a file of the same name with another extension, else the nearest names — with the
  place to change; `withMeant` writes that change into the block).
- `link-scan.ts` — `linksIn`, one linear pass over each line (every search for a closing mark goes on from where the
  last stopped): wikilinks with heading and alias, embeds, Markdown links and images, bare web and mail addresses, each
  with where its target is written; `linkKind` (only notes, files, web and mail addresses are opened; any other scheme,
  however disguised by controls or entities, is refused); `linkTo` (a host's rendered link, judged alike);
  `leavingWords` (said before a link leaves the host) and `refusedWords`; `attachmentType`.
- `link-markdown.ts` — `safeMarkdown`: what a host renders for a thing's details, with an image from outside the vault,
  Markdown or HTML, made a link showing its address (nothing remote loaded), a Markdown link or reference definition the
  user may not open escaped to text (its address on its own line or the next), other raw HTML escaped, inside maths too,
  a note embed made a link, and only an image, a sound, a video or a PDF of the vault left embedded (a canvas, a base or
  any other file embedded is a link); code spans and fences untouched, told apart as CommonMark tells them (an escaped
  backtick opens no span; a backtick fence's words hold no backtick; a fence closes on its marks alone). `embedParts`
  cuts out each note embedded, for the host to read itself, and `embeddedMarkdown` is that note's text made safe, front
  matter left out, only the section a heading embed names (offline_and_mobile_apis).
- `link-renames.ts` — `renamedLinks`, the changes that follow a renamed note or file in every link inside a note's
  graph blocks (never prose), keeping each link's alias, heading and form; a link that still finds a file, or whose new
  name a block could not hold, is left; `applyChanges` makes them.

**Editing**

- `pane.ts` — the edit session: what is typed, written back to the note safely; `texts` gives the note's blocks with the
  typed text in the edited block's place, and `current()` the note as last seen, read so. `edit` is an edit made from
  the drawing: the names it newly writes are checked as it is written, and a refusal reloads the block and keeps the
  edit as a draft (`edit: true`). Once the block changes outside the session (another program, a sync or another
  pane: reloaded, a conflict, or a write refused), its undo history starts again from the note as it now is, and Undo
  and Redo are refused saying why (`history: true`, `stepRefusal`), so no undo is ever written over that change
  (undo_never_over_theirs, cc_undo_safe); a change elsewhere in the note leaves the history as it is. Switching to
  another block (`select`) starts that block's own history, so Undo never writes one block's text into another
  (undo_stays_in_its_block). Through every change, the block is followed by `block-follow.ts`, never to a copy of it;
  when a copy cannot be told from it, the session stops (`stopped`): every write (marked `stopped`), Undo and Redo is
  refused saying so, and `noteChanged` says `conflict`, until a block is chosen again (block_followed_not_its_copy).
  `blockText` is the text of the block on a line, for a picker to check a choice is still the block it showed.
- `block-follow.ts` — `followBlock`: where the session's block is in a note changed since, found by the lines unchanged
  at the note's start and end, never by its text alone, so a copy pasted elsewhere is never taken for it, and the
  original edited after the paste is still the block; rewritten so far that too little of it is left to know it by
  (`readsAsEdited`: keeping at least half of the held block's text after the graph line), with a copy elsewhere, the
  session stops, never following the copy. Another block moved to its line is never taken for it, and a new block
  pasted beside it is taken for it edited only when it reads so. A block followed with a new block of its graph
  directly beside it, on either side, is followed `wary`, as no reading tells that from the original rewritten beside
  a copy: the session clears its history, as after a change made outside, so Undo never reverts what may be a copy;
  Undo and Redo follow the note they are pressed on first, so this holds whether the change was heard or not. A change
  that could as well sit before the block as after it (a copy pasted beside it) is read both ways, and two blocks found
  make it a `twin`; when the change runs through the whole block, it is found by its text, a `twin` when two blocks
  hold it, or when a new block of its graph sits on its line, unless that was only pasted beside it. The work is
  linear in the blocks, counted in `FollowWork`.
- `edit-check.ts` — that check (§4): `editRefusal` refuses a name the note written into draws only under a suggested
  name (accept its name first), or a name the edit gives a thing that another block of the graph gives too (already a
  name); `newNames` finds the names an edit newly writes.
- `store.ts` — replacing or inserting a block in a note, keeping every other byte; `replaceSpan` writes a block already
  found, as the session finds its own.
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
- `path-play.ts` — `PathAutoplay`: Play stepping through a path on its own (path_autoplay), around a `PathPlayer`
  (which also says where it is, `index`, and goes back to the first step, `restart`): from the step it is on, one step at
  the pace set (`PATH_PACES`, `DEFAULT_PACE`, said by `paceSaid`), until the last; paused or stopped at any step, played
  on from where it paused, a step taken by hand pausing it. The host hands in its timer (`Scheduler`), so the core never
  waits on a clock and a host clears it when its card goes.
- `path-animation.ts` — a played path exported as an animated SVG (path_animation_export): `pathPlan` (each step's
  thing, by Graphviz's node number, and a dot for each two steps in a row a drawn link joins, forwards along the walk),
  `pathBody` (each step's number on its thing, and the dots' runners) and `pathCss` (a heavier outline moving from step
  to step at the pace, round and round, by `step-end` keyframes; every step outlined when still; all of it stopped under
  reduced motion); `pathSubtitle` says the walk in order. `animationFits` refuses one too large for the device
  (`ANIMATION_LIMITS`: steps, and an estimate of its bytes), saying why and what would make it fit, before anything is
  laid out (animation_export_fits); `exportWithLayout` gives that refusal back as a `TooLargeToAnimate`.
- `path-edits.ts` — a step taken out numbers the later steps of its path again (`stepsAfter`), carried as the removing
  fix's further edits (`Problem.also`), so the path keeps §22's steps 1 to n.

**The style graph (spec §2, §6, §7)**

A graph's nudges, the properties it shows and the styling of its views and paths are a graph of their own, written in a
style block beside it: `// graph: trip_style · STYLE trip`. `blocks.ts` knows one by its graph line (`styleOf`), and
`dataKind` never takes it for data, so `readNote` never reads or draws it and the data reads the same with or without
it. A graph line that says STYLE but names no graph is a problem, never data.

- `style-graph.ts` — what a style graph holds once read (`StyleGraph`: nudges, shows, looks, each view's fade or hide,
  how each view was shown and the View menu's switches it was saved with, the direction, where arrowheads are hidden,
  the diagram types chosen, how links move, how links are routed and merged, the pictures on boxes) and the words it
  allows: the four nudge words, the ways a link moves (`FLOW_MOTIONS`), the routings (`ROUTINGS`), the
  lines, the formats, fade or hide, on or off (`INLINE`), show or hide (`ARROWHEADS`), and the colours, which are only
  the locked style's hues by name (`STYLE_HUES`). A Show switches a property on or off inline for a kind, a thing or a
  relationship type's links, in the whole graph or one view; an Arrows hides or shows arrowheads for every link or one
  type's, in the whole graph or one view.
- `style.ts` — `readStyle`: every style block of a graph read with the data's own reader (`readBlocks`, told which blocks
  to read), so what cannot be read is a problem on its line and the rest is used; never a throw, and a style too large
  to read is not read (the locked style is kept, and why is said). `lookOf` is the look of a thing or link in a view or
  path (a named hue, a line, a format; the thing's own look over its kind's); `legendOf` every colour used there with
  what it means; `outsideOf` a view's fade or hide, fade when none is written.
- `style-reader.ts` — `reader`: one style thing's properties read as text, a number, a word it allows or a name of the
  graph it styles, each fault a problem with its fix; shared by `style-checks.ts`, `style-choice-checks.ts` and
  `link-flow.ts`.
- `style-choice-checks.ts` — the choices for how a graph or a view is drawn, each checked: an Arrows, a Diagram, and a
  Links (§25: `routing` one of `ROUTINGS`, curved, straight or right-angled; `merge` on or off; for the whole graph or
  a view). `style.ts`'s `linksOf` says how a graph's or a view's links are drawn, a view's own over the whole graph's.
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
  or an export: its direction and nudges, the links it draws without arrowheads, the properties it shows inline, and
  how its links are routed (§25). `render.ts`'s `directions` writes in, last, what the View menu folds (`folding`, put on
  the drawing by `ViewState.folded`) and the routing.
- `arrows.ts` — arrowheads hidden or shown (§15): `arrowsShown` (the most particular choice — a view's over the whole
  graph's, then a type's over every link's — shown when none), `arrowlessLinks` (the links a drawing draws without them,
  guesses included), `linkTypes` (the type each link is styled by: a guessed type's link by the type it is taken for,
  for its arrowhead and its properties alike) and `arrowlessSource` (`dir=none` written on those links). Only the arrowhead changes, so each link
  keeps its reading when tapped and in the text version (direction_never_lost).
- `inline-properties.ts` — properties shown inline (§14): `inlineRows` (each box's and link's rows, its most particular
  Show deciding — a view's over the whole graph's, then a thing's over its kind's), `valueText` (a value said as the
  reader keeps it), and `inlineSource` (the rows below a box's text or a link's reading, at the kind caption's size, in
  the box's text colour or the link's label colour; past `INLINE_ROWS`, whole properties and how many are hidden). The
  Python library draws both the same way (`graphspec/style/arrows.py`, `inline.py`), held to the core byte for byte on
  `python/graph_spec/tests/style_cases.json` by `test/layout-parity.test.js` (arrows_both_renderers).
- `link-flow.ts` — links that move (§7): a `Flow` in the style graph, `(f1:Flow {motion: 'dashes', means: '…'})`, for
  every link or a `type`'s, in the whole graph or a `view`, moves its links as dashes running along them or a dot
  travelling along them; `still` takes a wider one back, and every link is still unless a Flow moves it
  (flow_in_style_graph). `flowOf` checks one (a Flow that moves links must say what it `means`, motion_not_alone),
  `flowFor` and `flowLinks` choose as `arrows.ts` does (the most particular, the first of two alike), and `flowSource`
  writes each moving link into the source: its label opened by its icon (`FLOW_ICONS`), the classes
  `graph-note-flow`, `-dashes` or `-dot` and `-back` (its line laid out from its far end, so it moves backwards along
  it), and dashes drawn dashed, so they show when still. `flowLegend` and `flowSaid` say each movement and its meaning in
  words, for the legend and a screen reader; `reversedLinks` says which lines run against their links. The movement
  itself is a style sheet's — the plugin's `styles.css`, or an export's (`export-motion.ts`) — and stops under reduced
  motion (motion_reduced_respected). The Python library writes the same source (`graphspec/style/flow.py`), held to the
  core byte for byte on `python/graph_spec/tests/flow_cases.json` by `test/link-flow-parity.test.js`.
- `picture.ts` — a picture on a box (§18, animated_image_shown): a `Picture` in the style graph,
  `(p1:Picture {property: 'photo', kind: 'Cat'})`, names the property holding a thing's image, for a kind's things or
  one thing, in the whole graph or a `view`; `pictureOf` checks one, `pictureFor` picks the most particular (a view's over
  the whole graph's, a thing's over its kind's, the first of two alike), `picturesFor` gives each box whose Picture's
  property holds text, and `pictureSource` keeps room for it in the source: a fixed square of `PICTURE_SIZE` points at the
  top of the box's label, filled with `PICTURE_MARK`, which a host finds and fills with the image. The Python library
  keeps the same room (`graphspec/style/picture.py`), held to the core byte for byte on
  `python/graph_spec/tests/picture_cases.json` by `test/picture-parity.test.js`.
- `style-edit.ts` — `styleEdit`: a nudge, a look, a view's fade or hide, how a view was shown, a property switched on or
  off inline, arrowheads hidden or shown, or the diagram type chosen, written as text into the graph's style block
  (made after the graph's last block when there is none); a view's setting, or a choice of properties, arrowheads or
  diagram type for one place, changed in place, never written twice; never a data block touched. A styled hue is drawn with `theme.ts`'s `hueColour`, the same blends as a
  kind's, so it meets the locked contrast.

**Animated images (spec §18, §11, §13)**

A thing's image is a file attached in the vault, named by a property's value; the host reads it and draws it with its
own image decoding, and the core says what it is and what it may do. No library decodes an image here.

- `image-links.ts` — where an image comes from: `imageLink` reads a value as a link (`[[cat.gif]]`, `![[cat.gif|200]]`)
  or a path from the vault's root to a file of an image type (`IMAGE_EXTENSIONS`); an address outside the vault
  (`https:`, `data:`, `//`) is never loaded (remote images are a later slice, remote_images_asked), and a place that
  could leave the vault is refused, as a source's is (`sources.ts`, `outsideVault`), a link's target as a path's.
  `imagesOf` lists a thing's images; `neverMoves` knows a JPEG by its name, for an image too large to read.
- `image-facts.ts` — `imageFacts`: an image's format, whether it moves, its frames and its size, read from its bytes'
  header and chunks (a GIF's image descriptors, an APNG's `acTL`, an animated WebP's flag and `ANMF` chunks, an AVIF's
  `avis` brand, an SVG's animate elements or keyframes), never past the bytes there, and never looping on a length that
  does not move it on. An SVG's start and root are found by `svgScan`, which looks at each character once and counts
  what it looked at, so hostile markup (200 empty comments) costs no more than its length (review of #443). An SVG has
  no frames to count, and has a pixel size only when its root gives one in pixels: its size on disk alone holds it to
  the limits otherwise; an AVIF's size is not read either.
- `image-limits.ts` — the limits an animated image moves within (`IMAGE_LIMITS`, said in `LIMITS_SAID`: size on disk,
  pixels a frame, frames, and how many move at once in one drawing); an image over the size on disk is never read, and
  is not shown, saying why; `startOf` says how an image starts — moving; still
  under reduced motion, until played (motion_reduced_respected); its first frame, saying why, past a limit, Play refused
  (animated_image_limited); still while as many as may move already do — and `playRefusal` why Play is refused.

**Diagram types (spec §15)**

A graph is drawn as a network unless its style graph chooses a type: `(d1:Diagram {type: 'tree', relationship:
'MANAGES'})`, for the whole graph or, with `view`, for one view (type_remembered). Style-graph.ts holds the seven
`DIAGRAM_TYPES`; style-checks.ts and style-conflicts.ts check a Diagram's words and allow one type for each place.

- `types-shape.ts` — the shape a type is judged on (`shapeOf`: the things, their kinds and first dates, the links, and
  the groups the nudges draw), with its first loop and its centre.
- `types.ts` — which types fit a drawing's shape, and why each that does not (`typeFits`): a network always; a tree
  along one relationship with at most one parent each (a parent linked twice is one) and no loop (none chosen: the
  relationship with the most links that makes one, of two with as many the first by name); a flow, links with no loop;
  a radial drawing, three things or more joined to the centre, the thing with the most links, and no group written; lanes,
  every thing of one kind and every group of one kind, two kinds or more, each group drawn inside its lane and never by
  the nudges again; a timeline, every thing carrying a date, a rank for each day; a table, any things. `suggestType` gives the best fit and why, never
  drawn unless chosen; `diagramFor` the type drawn: the chosen one while it fits, else a network, with why and
  `nearestType` (type_stops_fitting), and the plan Graphviz lays it out by; `diagramOffer` all three at once, for a
  host's card, a tree judged along the relationship chosen for it. `styledDrawing` puts that plan on the
  drawing; render.ts writes it in first (graph-layout.js `typedSource`) and lays a tree out down and the other types
  across, unless a direction is set. The Python library judges and lays out alike (`graphspec/style/diagram_types.py`),
  held byte for byte on `python/graph_spec/tests/type_cases.json` by `test/layout-parity.test.js`.
- `types-table.ts` — the table, which the host draws as a plain table (`tableOf`: Thing, Kind and each property, and
  each link); the way in to a graph of more than `LARGE_GRAPH` things (`wayIn`, large_way_in); and which types scroll
  one way only on a phone (`scrollsOneWay`).

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

**Graph sources and graph steps (spec §20; §7 view_of_another_note)**

A graph may be written somewhere other than the note that draws it, and a step works out a graph from graphs. Neither
is data of the note it is written in: `blocks.ts`'s `isSourceBlock` keeps a FROM block out of `dataKind` (the Python
reader's `data_kind` does the same), and a step is a query block, so the note reads the same with them or without. Both
are known by their graph line alone (`isSourceBlock`, `isStepBlock`), so a long block is never read to decide it.

- `sources.ts` — a block whose graph line says FROM and a place, `// graph: trip · FROM Graphs/trip.gql` or
  `· FROM [[Trip plan]]`, draws its graph from that .gql file or note (`sourceOf`, `sourceFor`; a place that is neither,
  or a block holding lines of its own, is a fault, so data is never copied in; so is a place that could leave the vault
  or reach what it hides: a leading slash or backslash, a drive letter, a `..` part or any part starting with a dot).
  The host fetches the text (`Fetched`: found, unreadable, too large by the size it keeps and so never read, or missing
  with any file of the same name `elsewhere`); `readSource` reads it as a note's own
  blocks are read, by `readNote`, so the same partial reader and limits hold (a .gql file is one block, its CRs taken
  off), or refuses in a sentence naming the place: missing, moved, unreadable, no graph line, or no such graph (a note
  that draws it FROM elsewhere itself is named, with where to point instead). `lineInSource` is a problem's line there.
- `steps.ts` — a step is a query block `// graph: <graph> · QUERY step <name>`, its named points declared above its rule
  (`// takes <point>: (:Kind), [:TYPE]`); `stepOf` reads one or says what to change (no name, longer than
  `MOST_STEP_CHARACTERS`, refused before its rule is read, no point, a rule matching a kind or type no point takes). `runStep` runs it only when a host asks, on the note as it is: the step's fault, a
  graph the note does not write, and each input are checked first, and any refuses the run; the links its INSERT names
  for every match are its output graph, and those its graph lacks are a proposal from the step (`makeProposal`,
  `linkChange`, `thingChange` for an end the graph lacks, `basisOf`), id `<step>_<n>`, each with the match that found
  it as its reason. Nothing is written: the host writes the proposal beside the graph (`noteWithProposal`).
- `steps-rule.ts` — the rule, a GQL query over graph data and never code or a named action: MATCH one pattern (things
  with an optional name, kind and properties, joined by up to `MOST_PATTERN_LINKS` links, one way or either), then
  INSERT links between things it named. CALL, a function, SET or DELETE and the other writes, RETURN, and anything that
  reads as code are refused, each saying why and showing `RULE_FORM`. `ruleTokens` reads a rule once: a text ends at
  its line, and nothing after the first mark that cannot be read is read (spec §9).
- `steps-match.ts` — every match of the pattern, as GQL matches a path: each link once in a match, a name used twice the
  same thing; bounded by `MOST_MATCHES` and `MOST_TRIES` (every thing and link looked at, fitting or not), past which it
  stops and says so (spec §9).
- `steps-input.ts` — what is given at a point: a graph of the note, whole, or a view of one (a queried path among them),
  put to the reading as `evaluate` puts it, never a copy; `inputFaults` checks each against its point (every kind and
  type it takes held, something given) before the step runs; `together` reads the inputs as one graph, a thing by id.

**Export (spec §16)**

The host does what needs a canvas, the file system or a dialog; the core decides everything else. An image is exported as
SVG or PNG (`EXPORT_FORMATS`), of the whole diagram or of a view, in the fixed light or dark colours chosen; the data as
a GQL block, CSV or GraphML (`DATA_FORMATS`), each read back into the very things and links exported.

- `export-scope.ts` — `exportScope`: what an export holds. The whole diagram is the graph as drawn. A view is put to the
  graph as `evaluate` puts it and holds only its things and the links between them, in the graph's order, each saying
  which written link it is (`edge`, so its properties are its own), with a guess (an
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
  With `ExportInfo.walk` the image plays that path (path-animation.ts), refused first when too large for
  `ExportInfo.device`; with `ExportInfo.motion` it moves the links its style moves (export-motion.ts).
  `pngSize` is the PNG's pixel size, never under `PNG_MIN_SCALE` (twice natural size) and rounded up. A view's looks are
  drawn and put in the legend with what they mean.
- `export-motion.ts` — movement in an exported SVG, by CSS in the file itself (no encoder, nothing loaded): with
  `ExportInfo.motion` (an SVG; a PNG is drawn still), the links a style moves run their dashes, or a dot travels a copy
  of each one's line (`withRunners`), and `withStyleSheet` puts the style sheet first in the image; every animation stops
  under `@media (prefers-reduced-motion: reduce)`, leaving the dashes, the icons and the legend's words. Every rule is
  written under the class the image's root carries (`IMAGE_CLASS`, `inImage`), so an SVG put inline in a page styles
  nothing of the page's own.
- `export-pictures.ts` — the pictures on boxes in an exported image (§16, export_animation_stated; §18): with
  `ExportInfo.pictures`, the host's loader, each image embedded as a data address, so the file loads nothing; an SVG
  keeps an animated one moving within `IMAGE_LIMITS`, its first frame beside it shown instead under reduced motion by
  the image's own style sheet, scoped under `IMAGE_CLASS`; a PNG, or one past a limit, reduced to its first frame; one
  that cannot be had, or was never read (`UnreadImage`, over the size limit: left out), drawn as a dashed frame. Only an
  image type of a fixed list is written before the bytes, which must be base64, and an image is never put inline.
  `ExportImage.animation` says what was done with each animated image, a line
  each, and the frame says it too (`animationSaid`).
- `export-pages.ts` — `pngPages`: an image too large for one sharp PNG on the device, split into a grid of pages, each at
  twice natural size or more, within the device's pixels and no side over `PNG_MOST_SIDE` (32,767 device pixels), as
  few as the pixels allow and then evened out, so a row is never whole pages and a sliver, in reading order; null when
  the pages would be too small (`PNG_PAGE_LEAST`) or too many (`PNG_MOST_PAGES`). `pageSvg` cuts the SVG to a page by
  its root's size and view box.
- `export-data.ts` — `exportedData`: the things a scope draws and the links written between them, with every kind and
  property as read, never a schema's own thing or a guess (`ExportScope.linksAt` finds a view's links as written). A
  view holds only its own, unless its faded context is asked for: then the whole graph, with what is outside the view
  in `faded`, which each format marks. Each thing's and link's `///` note, as `notes.ts` put it on the drawing, is in
  `notes` (§24, note_standard): kept by a format with comments, left out of CSV, which has none. `dataText` writes it
  in one of `DATA_FORMATS`. No layout is asked for.
- `export-data-model.ts` — the data's types, and the five kinds of value the profile reads, each said so it reads back.
- `export-data-gql.ts` — a GQL block: the graph line, a comment saying where it came from, a thing or link to a line; a
  thing under its id, or, where its id cannot be a name, under `thing_<n>` with its id written in full. A thing or link
  of a view's faded context owns a `//@ faded: outside view <name>` line (§27), a comment to the reader; a note is
  the `///` lines directly above its thing or link.
- `export-data-csv.ts` — CSV as RFC 4180 writes it, with no byte order mark, so a spreadsheet that assumes another
  encoding without one may show non-ASCII text wrongly: a header naming each property with the kind of its values, a
  row for each thing then each link, of kind `faded thing` or `faded link` outside a view; an empty text quoted, so it is
  told from a missing one; a text a spreadsheet would run as a formula guarded by an apostrophe, which the readers take
  off but a spreadsheet such as Excel shows. CSV has no comments, so a note is left out, never made a column.
- `export-data-graphml.ts` — GraphML that keeps to its schema: a node named by its place, the thing's id, kinds and a
  link's type as data, a key for each property and kind (a day or an instant said by the key's own description,
  `gn:date` or `gn:datetime`), a view's faded context marked by `:faded`, XML's marks escaped; a character XML cannot
  hold refused, naming where it is. No GraphML schema is on this machine to validate against, and none is downloaded:
  the output was checked well-formed with xmllint, and it writes no attribute GraphML does not name. A note is an XML
  comment on the line directly before its node or edge, a comment and never a key, as GQL's engines take it.
- `xml-comment.ts` — `noteComment`: a note as the XML comment that holds it, its text escaped (`\\`, `\-` for a
  hyphen after a hyphen, `\r`, `\u{…}` for a character XML cannot hold) so it holds no `--`, never ends with `-`, can
  never end the comment, and reads back exactly. The Python library's SCXML export writes the same comment
  (`note_comment`), both held to `python/graph_spec/tests/note_comment_cases.json`; `notXml` is XML 1.0's characters.
  `commentPieces` gives the escaped text a piece for each character, keeping only the last character written, so the
  work is linear in the note (a run of hyphens among them), counted in `test/xml-comment.test.js`, never timed.
- `export-plan.ts` — `exportPlan`, the one decision before anything is written: `{ nothing }` for an empty scope,
  `{ ask }` for a note classified above the configured level (naming both; a classification not in the list counts as
  above every level; the host asks again with `confirmed` once the user says yes), or `{ go }` with the file's name and
  place and, as configured, the companion note's. A name is made from the note, the graph or view and the day, safe on
  every platform; a folder setting that could leave the vault is not used. The data gets its companion note as an image
  does; a PNG on pages gets each page's name (`pages`).
- `export-note.ts` — `companionNote`: the Markdown that links the export and the source note and names the graph or
  view, the day and the scope. An image's shows the image, or each page, with nothing of the data beyond what the image
  shows; the data's links its file, shows nothing, and says how many things and links it holds, and how many of them
  are a view's faded context.
- `export-write.ts` — `writeSafely`: the bytes go to a temporary file given by the host's `write`, then `rename` into place;
  on any failure the temporary file is `remove`d, the target is never touched, and the result says why in a sentence.

**Proposals (spec §17)**

A proposal is changes to a graph that somebody other than the person reading proposes: an AI's answer (§19), a graph
step's output (§20), or anyone. It is data, whatever its source; nothing here knows where it came from. It is shown over
the graph and never written until a person accepts a change, and then written as an ordinary edit.

- `proposals.ts` — the data: `makeProposal` checks a proposal (who proposed it, the state of the graph it was made against,
  at least one change, each change written as a block writes it) and gives each change an id (`c1`…) and a group; `Provenance`
  (who, when, what it read, the basis); a change is an addition (one item of GQL), a change of a property (`set`) or a
  removal of a thing or a link; `thingChange` and `linkChange` build additions from parts for a source whose answer is data;
  `groupsOf` and `provenanceLines`; `BIG_PROPOSAL`, above which a proposal is reviewed in groups.
- `proposals-basis.ts` — `basisOf`: the state of a graph as graph-spec's change sets name it (`against`), and `staleness`,
  whether the graph has moved since.
- `proposals-text.ts` — a proposal as graph-spec's change set (§24 H1), with what that has no line for as comments its readers
  pass over (who proposed it, what it read, removals, ids, groups, reasons, and each decision a person made). `changeSetText`
  writes it, `readChangeSet` reads it back whole; so the change set in the note is the record of what was decided.
  `recordDecisions` records a decision by putting one line above the change (and the `// basis now:` line), keeping every
  other byte of the block, an author's comments among them.
- `proposals-apply.ts` — one change written as text on the blocks' texts (an addition after the graph's last block of data, a
  property changed where it is written, a removal of the item that wrote the thing or link), `notTaken` (a change read back to
  see it took effect) and `newProblems` (what a change leaves wrong that was not before). Not exported by the entry: only a
  review writes a change.
- `proposals-marks.ts` — which boxes and links each change adds, changes or removes (`MARK_WORDS` says it in words, never by
  colour alone), and each change read back in plain English as the text pane reads a line (`readBack`).
- `proposals-review.ts` — `ProposalReview`: `show` (the proposal laid over the graph, rows, groups, marks, provenance, whether
  the graph has moved; writes nothing), `accept` and `reject` (a person, by name, one change, some, a group or all; accepted
  changes are written through `PaneSession`, so they are checked as any edit is, then read back, and refused whole if one does
  not take effect or leaves a new problem; a graph that has moved is refused until its notice is seen), and `undo`. It works
  on the note's text and hands the new text back; the host writes it. The decision is recorded in the note's change set.
- `proposals-shown.ts` — the shapes a review hands a host: `ProposalShown`, its `ChangeRow`s, who decides (`Person`), which
  changes (`Which`) and what came of it (`Reviewed`).

**Working with an AI (spec §19)**

The core reaches no network: a send goes only through the transport a host hands in, and only once the user has seen
exactly what goes and said yes to it. Its answer comes back as a proposal (§17), never an edit.

- `ai.ts` — the send: `prepareSend` makes the exact request for what the user chose, or refuses (AI off, no such model,
  an address that cannot be used, above the model's ceiling, at the highest classification, or holding a credential);
  `confirmSend` is the user's yes to exactly that request, good for one send; `sendPrepared` sends it through the host's
  `Transport`, putting the key from the host's secret store in its header only as it goes and taking it out of anything
  said before it is cut short, and gives back a proposal or why there is none, with a `SendRecord` of the send either
  way: never the text sent, only its SHA-256 digest and size, its scope (the kind of choice and the counts), the model's
  name and address, the time and the outcome. The model is copied as it is prepared, so what is sent is what was shown.
  The address and the whole message are looked over for credentials before they are put in the request.
- `ai-digest.ts` — `sha256` and `utf8Size`, written here, as the core has no host's library; a lone surrogate is taken
  as U+FFFD, as a UTF-8 encoder sends it.
- `ai-choice.ts` — which AI may be asked: `aiReady` (off until `aiUse` is on and a model has a name, a model and a
  usable address), `endpointProblem` (a host written in letters, digits, dots, hyphens, colons and brackets only, so it
  cannot be told apart from another; no user name, password, query string or fragment; plain http only to localhost,
  127.x.x.x or [::1] exactly, read with the runtime's own URL; any other by https), and `modelChoices` (the host's own
  AI first, where it has one; then the models set up for the purpose; then the rest; none while AI is off).
  `AI_PURPOSES` are the spec's purposes.
- `ai-ceiling.ts` — `clearance`: a note with no classification counts as `aiUnlabelled`, the most sensitive level
  until the user chooses another (unclassified_strictest), so by default it goes to no model, and the refusal says to
  give it a classification or choose a lower level under Unlabelled notes count as; a note above a
  model's ceiling is not sent to it, saying why and naming the models cleared for it; nothing at the highest
  classification set goes to any model; an unknown classification counts above every ceiling. `credentialsIn` names, by
  common patterns, the kinds of credential a text holds (a private key, an access key, an API key, a token, a password
  or secret by its name, even at the end of a snake_case or camelCase one, though a bare `key` is an ordinary word and
  only a name ending in `_key` or `Key` is a secret's, a card number, or the key of any model set up), never
  the text.
- `ai-scope.ts` — `aiScope`: what is sent of a note, as the user chose (the whole graph, a view, or things by name),
  written out again as GQL from the graph as read: each thing with its kinds and properties, and the links between the
  things chosen. Nothing else of the note goes: no prose, no other graph, no comment.
- `ai-request.ts` — the request body, in the chat completions shape local servers and most services take, with the
  instructions that ask for changes as JSON (`INSTRUCTIONS`); `readReply` and `changesIn` read an answer back, the whole
  answer refused if one change cannot be read. A model's reason is kept as plain text, each Markdown and HTML mark
  escaped, so it never renders as an image, a link or HTML where `///` notes are rendered.
- `ai-answer.ts` — `proposalFrom`: the changes made into a proposal from the model, against the state of the graph that
  was sent, naming the send's record; `noteWithProposal`: the note with its change set written after the graph's last
  block, the graph untouched.

**Settings (spec §21)**

- `strictness.ts` — the three departures from standard GQL the reader reads as meant (each problem says which, in
  `Problem.departure`), what Standard, Forgiving and Simplified make of them, converting a note back to standard GQL,
  checked before it is written, and the standard text an engine or an export is given whatever the level.
- `settings.ts` — every option with its name, sentence, choices and default (`OPTIONS`, `DEFAULT_SETTINGS`), and saved
  settings read back with anything unknown, out of range or secret left out (`settingsFrom`). AI is off until `aiUse`
  is turned on; `aiUnlabelled`, the level a note with no classification counts as, is one of `classifications`, the
  most sensitive until chosen. An AI model keeps the name of its key in the host's secret store (`keyName`), never the key. The Export section holds the export theme (light
  or dark), whether an export saved in the vault gets a companion note, the folder exports go to (`vaultFolder` keeps it
  inside the vault; empty is next to the note) and the classification above which an export asks first (one of
  `classifications`, the lowest until chosen). The Drawing section also holds how far focus reaches from a selected
  thing (`focusDepth`: `one`, the default, or `two`; `depthOf` reads it), and the default of each View menu switch
  (`labelsByZoom` and `foldHubs` on, `foldGroups` and `mergeLinks` off, view_switch_defaults).

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

A data export is proved by reading it back (export_lossless): `test/export-data-readers.js` reads a GQL block with the
graph-spec reader, and CSV and GraphML with strict readers of its own, as RFC 4180 and XML read them, so an escape the
writer leaves out shows. The Obsidian package's tests read its exports back with them too. They read the notes back
too (`readNotes`; note_standard): a GQL block's with the library's `notes`, a GraphML comment's escapes by a strict
reader of their own (`commentNote`); `test/notes-export.test.js` holds each format to the rule.
