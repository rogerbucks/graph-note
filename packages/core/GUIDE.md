# The core: where things live

The host-free core of the graph note editor (spec §10): what to draw, problems and their fixes, zoom, edits and undo.
It imports no host — no Obsidian, editor or Node module. So the same code runs in Obsidian on a desktop or a phone and,
later, in VS Code. It is written in erasable TypeScript, so Node runs its tests with no build.

## The entry

- `src/index.ts` is the package's one entry: everything a host uses is exported from it, and only from it.
  `test/index.test.js` holds its list of names, so a change to it is a decision, not an accident.

## The source, `src/`

Every module is flat in `src/`, one purpose each, named for it. Each opens with a comment saying what it is for.

### Reading a note

#### Blocks and partial reading

- `whitespace.ts` — whitespace as GQL names it, the one set every reader uses, never JavaScript's `\s` or `trim()`.
- `blocks.ts` — where each gql block of a note is, and what its graph line says.
- `block-items.ts` — a block's top-level items (paths, SET, MATCH), so a bad one can be left out.
- `partial-read.ts` — reading the blocks as far as they can be read, with a problem for each part left out.
  - A failed block is read again on its own. Each line is found from an index of the block's lines. This is the same
    reading as before, proved against the old one kept in `test/partial-read.test.js`.
  - There is a budget of reading again (`REREAD_BUDGET`, 4 million UTF-16 units). Past it, the rest of a badly broken
    block is left out at once, so reading never holds the page (spec §9).
  - The Python reader (`graphspec/reader/drawing.py`) counts and cuts exactly so, so both still draw alike
    (drawn_in_part).
  - A card is read from the blocks up to its own (`upTo`), but names are suggested against every block. So the card,
    the whole note and every edit agree on a thing's suggested name. Its fix never writes a name a later block has
    (suggested_name_unique).
- `written-things.ts` — the things written in a block, found by their parentheses: name, kinds, properties, where they are.

#### Suggested names

- `name-gaps.ts` — the things of a block that lack a name or a text, with the suggestion and a fix that writes it.
  - No name: a warning. The thing is read as if the suggested name were there, in a copy, never in the note.
  - No text: a hint (severity `hint`: offered in place, never counted as a problem). The exception is when a SET or the
    thing written elsewhere gives it text.
  - The warning carries the name (`suggested`). The box drawn under it carries where its ( is (`Box.suggested`). So it
    is drawn dashed and labelled as suggested, selected by `spanOf` and fixed from its details.
  - The Python library suggests the same names (`graphspec/reader/name_gaps.py`).
    `python/graph_spec/tests/name_cases.json` holds both to one table.
- `suggested-names.ts` — `acceptNameFirst`: why an edit naming a thing drawn only under a suggested name must wait.
  It says "accept its name first", naming which text and which name. So nothing writes the name before its fix is
  accepted (unnamed_drawn_suggested).
  - These ask it themselves: `pathBlock`, `makeList` and `addToList` (the thing, or a value that reuses one). So do
    `parkForLater` and `styleEdit` (a nudge, a look or a view's selection naming one). So does `addView` (view-write.ts,
    the one way a host writes a view into a note).
  - Each checks the note it writes into as it is then, never an older drawing.
  - `styleEdit` and `addView` read the note itself with `unnamedIn`. It uses the reader's own `prepare` and its rule for
    a box drawn suggested (`suggestedPlaces`, which drawing.ts uses too), so the two cannot differ.
  - The edits into one block are `parkForLater` (which requires it), `pathBlock`, `makeList` and `addToList`. For a
    quick answer they take the reading of the note as it is now, with the block as typed, which a host gives
    (`PaneSession.current()`).
  - The check that counts is made as such an edit is written, against the note written into (`edit-check.ts`). So no
    caller can leave the check out.
  - Property edits are refused too (`setProperty` finds no pattern for a name that is not written), the host saying why
    in these words.
  - A name only suggested is also left out of the names completed while typing and of the near misses guessed
    (`help.ts`, `estimates.ts`).
- `schema-checks.ts` — the warnings for types a schema does not declare.
- `note-reading.ts` — the types reading gives: `NoteReading`, `GraphDrawing`, `Problem`, `Block`, `Box`, `Link`, and
  `ThingNote`, a note on a thing or a link.

#### Notes on things and links

- `notes.ts` — notes on things and links (editor spec §24).
  - `addNotes` reads each data block holding `///` with the graph library's `notes`. The Python reader is held to it by
    one table.
  - It puts each note on the box or link drawn below it (`Box.note`, `Link.note`). The note carries its CommonMark text,
    its summary, its block and its `///` lines.
  - It reads the block as the reader read it (`readBlocks`' `read`). That means with the suggested names in, and with
    what could not be read left out. So a thing drawn under a suggested name keeps its note.
  - A note above a line holding more than one thing belongs to none of them. It is a warning whose fix says to put the
    thing on its own line.
  - Each note on what the reader left out is a warning that it is not shown. It is found when the block cannot be read
    whole. Each such note is a run of `///` lines directly above a line where an item left out begins. (See `read`'s
    `dropped`; every item of a block left out whole.)
  - A note on a thing already noted where it is first written is a hint naming it, the first note kept.
  - The layout source never reads a note.
- `note-lines.ts` — the `///` note lines and `//@` tag lines a thing or link owns, as the reader reads them (`NOTE`,
  `TAG`, `ownedAbove`, `runStart`). It is the one definition, used by `notes.ts` and by every edit that takes an item out.
- `note-edit.ts` — `setNote` (note_add): a thing's or link's note added, changed or removed as text.
  - The note is the `///` lines above it. The edit is refused unless the reader reads back the note written on that
    thing alone.
  - Every edit that takes an item out takes the note and tags above it too, so no other thing takes them up. These are
    `withoutItem` (so proposals' removals and lists) and `removal` for a path's step.
  - Every other edit leaves them where they are (note_kept_by_edits). `test/notes-edits.test.js` sweeps the entry
    points.
- `drawing.ts` — `readNote`: what a note's graph blocks draw, built from the modules above.

#### Estimates and completeness

- `estimates.ts` — near misses drawn as guesses. It never guesses a thing drawn under a suggested name, whose name nobody
  has written. A fix changing a word to it would write it unaccepted.
- `estimate-places.ts` — where an estimated name is written in its block (`BlockPlaces`).
  - It is at the path's own reference to it, never the same word in a text or another link on its line.
  - `estimates.ts` gives the problem and the estimate that `span`, and a type's problem the place in its brackets. So
    the fix bar, the quick fix and Edit the link all land on the word.
  - With both ends misspelt, one fix changes both (`also`), as the sentence says.
- `estimate-fix.ts` — `estimateFix`: accepting an estimate is its problem's own fix.
  - It is the one `help.ts`'s `diagnostics` offers in the fix bar, found at the estimate's `span`. So an editor can
    select the word there.
  - There is none for a text that is not that block as read, so a fix never writes blind.
- `completeness.ts` — the completeness report behind the problems badge.

#### Deferred things

- `deferred.ts` — deferred things (§5, §8).
  - `parkForLater` writes a Deferred as a block's last items: what, why, an optional revisit day and rule. It writes the
    comma GQL needs and a fresh `later_<thing>` id. The id is fresh in the whole graph when the note's reading of it is
    given.
  - It refuses an empty what or why, and a block ending with SET or MATCH.
  - It also refuses a locked graph whose schema does not declare Deferred and DEFERS (the graph library checks them like
    any type). It refuses with a `DeferredNotDeclared` (same words, a `code` and the `lacking` names), so a host can
    offer the fix.
  - `declareDeferred(note, graph, indent)` is that fix: the note with Deferred and DEFERS declared, as Lock writes a
    declaration. The readings are `defers` and `is deferred by` (the library's guess misspells the second).
  - It writes in the block that holds the graph's GraphMeta. It writes only what is lacking, with fresh ids and the
    comma GQL needs, every other byte kept.
  - It refuses a draft, a graph typed by a shared schema, and a block ending with SET or MATCH. It also refuses a schema
    with no GraphMeta, or one whose id is not a plain name (it says what to rename it to).
  - `declareDeferredBlock(blocks, graph, indent)` is the same on the blocks' texts, giving the block's index and new
    text. It is for a host that is editing that block itself.
  - The declarations are a change of the schema, not of the parked thing. Written into another block, they are not
    undone with the park; they stay until they are taken out by hand.
  - `parked` says which things some Deferred defers and which are overdue. A thing is overdue when every Deferred on it
    is past its `revisit_by`, as `completeness.js` counts. `parkedCount` says how many of each, apart from the problems.
  - `readNote` sets `Box.deferred` on each such box. It takes the day as its fifth argument, the current day by
    default.
  - The layout source is untouched, so the host draws the dashing and the later mark on the finished drawing.

### Drawing

#### Layout and the engine

- `layout.ts` — the Graphviz layout source, byte-identical to the Python library's. A box drawn under a suggested name is
  dashed and labelled so in both.
- `engine.ts` — starting the bundled Graphviz engine, WebAssembly. It is the one module that imports it, and only the
  entry imports this one. So the rest of the core runs in a host with no WebAssembly, such as a Claude Code mod.
- `render.ts` — laying out with the engine it is handed, or around one run elsewhere (`directions`, then `chosen` with
  the SVGs it drew). It also says what a box's or link's details are.
- `drawing-direction.ts` — a drawing in the direction it is read (spec §42, rtl_drawing_direction). In a right-to-left
  language, one that runs across is mirrored after layout (`inReadingDirection`; `shownAsRead` for a host's layout). Its
  labels are anchored at their other end. The layout source and the exports stay the same.
- `layout-limits.ts` — how large a graph may be before it is shown as text (spec §9, layout_contained). Each limit has
  its reason:
  - the note's text, measured before it is read (`READ_LIMITS`, `textTooLarge`). `readNote` applies it to the graph
    blocks and shared schemas, never to a query or an excerpt;
  - the things, links, longest word and drawing instructions, before any layout (`LAYOUT_LIMITS`, `tooLarge`);
  - and the tighter ones on the page's own thread (`PAGE_LIMITS`).
  - `READ_LIMITS` are the plugin's alone, a known exception to drawing as the Python reader does (drawn_in_part). Over
    them the plugin reads and draws nothing, so there is nothing to compare.
- `layout-worker.ts` — the layout kept apart from the interface. It holds both sides of the talk with a worker, through
  a port the host gives it.
  - The worker's side is `serveLayouts`: its engine started at once, and "ready" said.
  - The page's side is `LayoutRunner`. One worker is reused, and each layout is timed from "ready".
  - A fresh worker starts after one overruns, but none after three in a row.
  - The page's thread is used only when the first worker cannot start. There, every layout already queued is held again
    to the page's lower limits.
  - A layout superseded before it starts is dropped.
  - A layout may ask for a fixed theme (`light` or `dark`), which the worker themes it in. That is how an export is laid
    out, in the same worker and under the same limits.

#### Colours and tokens

- `theme.ts` — the drawing's colours and size, from the theme, in the host's palette. `hueColour` is the one blend every
  hue is drawn through, kinds, readings and the style graph's looks alike.
- `palette.ts` — the one colour mapping (spec §10): how each host writes the style's colours.
  - Obsidian's entry names its theme variables.
  - The fixed light and dark entries are for a host that draws the SVG as an isolated image (a Claude Code pane). They
    are worked out to hex and paint their own page, with the locked contrast held.
  - The system entry carries both in the drawing's own style sheet, `prefers-color-scheme` choosing. It is for a host
    that cannot say which it shows.
- `theme-tokens.ts` — the interface's design tokens (editor spec §44, ui_theme_tokens, plugin_theme_tokens).
  - `THEME_TOKENS` lists each `--gn-*` token of colour, type, spacing, corners, depth and motion with what it is for.
    These are the only variables the style sheets' rules read.
  - `OBSIDIAN_TOKEN_MAP` is the one table from Obsidian's theme. `obsidianTokenValue` writes each token out at the top of
    styles.css for each of the plugin's own elements. The browser page maps its own theme in page.css.
  - `TOKEN_DEFAULTS` gives a token its own value where the theme has none, such as how long a moving dash takes.
  - A plug-in's own colour (`ThemeToken`) is named `--gn-plugin-<its id>-<word>`. It gives `#rrggbb` or `#rgb` for
    light and dark. It must meet `LOCKED_CONTRAST` on the core background it sits on (`TOKEN_BACKGROUNDS`).
  - `themeTokenCss` writes the tokens added as CSS for a host to apply.
  - The drawing's colours are not tokens: they stay in palette.ts.

#### Taps, drags and zoom

- `hits.ts` — what a tap lands on or near, and where a box is (`boundsOf`, as fractions of the drawing; `centres`). A
  link merged into a trunk (§25) is hit by either of its lines.
- `box-drag.ts` — where a box dragged and let go would land (§6, drag_moves_box).
  - `landingFor` reads the boxes as drawn and gives the nudge the place writes. That is beside the box it is dropped by,
    across the ranks; or before or after it, along them.
  - It gives null away from every box, or where that nudge is written already.
  - `landingSaid` says it, "Put Ann beside Bob".
  - The card draws the drag (`display/graph-view/box-drag-view.ts`) and the host writes the nudge (`styleEdit`).
  - `placesFor` lists every place a box can go, for the keyboard (move_box_keyboard). The card's keys are in
    `display/graph-view/box-move-keys.ts`.
  - In a radial drawing, a box goes before or after a thing around the centre (radial_spoke_order).

#### Zoom

- `zoom.ts` — zoom, pan and full screen, and `resize` for a new viewport or a drawing laid out again (§25).
  - `reveal` brings a box into view, centred, and leaves one already in view alone.
  - `aim` says where the view would go to do so, keeping the zoom unless it is below a scale given (§25).
  - `keepClear` keeps a strip at the viewport's foot clear, as a sheet covers it. It lets the drawing pan up into it by
    as much and no more.
- `zoom-fit.ts` — the limits `Zoom` holds a drawing within.
  - `MAX_SCALE` and `STEP`.
  - The scale that fits the whole drawing (`wholeFit`, and `fitScale`, never above natural size in a note).
  - The furthest out (`outLimit`): the whole drawing's fit, or natural size when it fits larger. This replaces §3's
    quarter (zoom_out_to_fit), and `Zoom.outLimit` says it.
  - Where it may sit in its viewport (`clampPan`).
  - Each is worked out from the sizes given whenever it is asked. So a resized view, full screen or a drawing laid out
    again has its own (zoom_fit_recomputed).
  - `resize` brings a drawing shown below the new fit up to it.
  - A viewport with no size (`hasSize`), as a hidden card or one not yet laid out has, has no fit yet. Then `outLimit` is
    0, and `held` keeps any scale above 0.
  - A resize to such a viewport is no resize: only the drawing's new size is taken. So a hidden card keeps its zoom, and
    a zoom restored before layout is kept.
  - One fitted when hidden is fitted again at the next resize with a size. It is fitted to the size it was laid out at
    meanwhile.
  - Full screen or the pane squeezed to no height by a thing's details is told no size too (`zoomSize`). So closing the
    details gives back the zoom and place the drawing had (details_keep_view).
- `zoom-across.ts` — `AcrossZoom`, a `Zoom` that only adds to it. A wide drawing is fitted to its height and shown from
  its start. It is moved across only by one finger, until it is zoomed in. A pinch works as on any drawing (a tree, flow
  or timeline on a phone, §15 wide_types_phone).

### Finding your way round a large graph (spec §25)

These are pure and host-free. Each says only what to keep at full strength, hide or bring forward. So a host changes the
drawing and nothing else (untangle_data_untouched).

Nothing here is written to a note or saved, except the legend's choices. A host writes those into the style graph when
the user saves a view as shown (untangle-saved.ts).

#### Focus and untangling

- `focus.ts` — focus on a selection.
  - `focusOf` keeps a thing, its links and the things at their other ends (to two steps by the setting). Or it keeps a
    link and the two things it joins.
  - `highlightOf` is what the pointer, keyboard focus or a touch's tap marks.
  - `FocusState` is the selection, cleared by an empty tap or Escape.
  - `edgesOf` numbers the drawing's links as its SVG does (written ones, then the estimates of a name). `estimateEdge`
    finds one.
  - `FADE` and `KEPT` are how a faded and a kept thing are drawn, by strength and outline, never by colour.
  - `focus.test.js` holds `FADE.text` to 4.5:1 in both themes, and the host's `styles.css` to these numbers.
- `untangle.ts` — the tools for untangling one drawing:
  - `neighbourhood`: a thing and what is within one or two steps, filtered to;
  - `kindLegend` and `LegendFilter`: choosing a kind or relationship type brings it forward, again hides it, once more
    puts it back;
  - `shortestPath` and `pathWords`: fewest links, either way; or that there is none;
  - `find`: by name or property;
  - `nextAlong`: an arrow key walks to the neighbour in that direction;
  - `emphasis`: a path over the selection over the legend;
  - and `Untangle`, which holds all of it for one drawing. It works it out into `layers`: what is kept and what is
    hidden.
  - `LegendFilter.choices` gives the legend's lines brought forward or hidden, kinds first, each by name. `restore` puts
    them back. An `Untangle` made for a view saved with them starts with them.
- `untangle-saved.ts` — the legend's choices saved with a view (untangle_legend, view_saved_as_shown).
  - They are written by `styleEdit` as a Shown's `legend` ('kind:Person forward, type:NEAR hidden', `legendText`).
  - This happens only when the user saves the view as shown, never otherwise. A choice that is no legend's is refused
    first (`legendRefusal`).
  - They are read and checked by `legendChecked`. Each fault is a problem on the Shown's line with its fix, the rest
    kept. The faults are an empty entry, one that cannot be read, or a state not allowed. They are also a kind or type
    the graph lacks (with the nearest), or a line chosen twice.
  - The Python library reads it the same (`graphspec/style/legend.py`). It is held to
    `python/graph_spec/tests/legend_cases.json` by `test/untangle-saved-parity.test.js`.

#### Folding and routing

- `untangle-fold.ts` — folding (untangle_hubs, untangle_groups, untangle_merge).
  - `BUSY_HUB`: a thing with more links is a busy hub. `busyHubs` finds them.
  - `drawnGroups`: the groups the nudges draw, as `nudgedSource` boxes them; none in lanes.
  - `foldPlan`: what a drawing folds and merges. That is things hidden with a hub, and links folded into a stub or
    inside a folded group. It also gives each hub's count, every group and whether it is folded, and whether links
    between groups merge.
  - `foldsHiding`: the folds a found thing is hidden in.
  - These are plain lists, so the plan crosses to the layout worker.
- `fold-source.ts` — the plan written into the layout source last (`foldedSource`).
  - Each hub gets a stub with its count, and each folded group a box with its count.
  - Two or more links from one group to another are drawn through one trunk. Each link is still its own two lines
    (`edge7_tail`, `edge7`).
  - Every box and link still drawn is given the id Graphviz gave it unfolded. So the host finds each by its number as
    before.
  - `routedSource` draws links straight (`splines=line`) or right-angled (`splines=ortho`, readings as `xlabel`).
  - With nothing to fold or route, the source is unchanged.
  - The Python library writes the same (`graphspec/style/folding.py`, `fold_source.py`). It is held to it byte for byte
    on `python/graph_spec/tests/fold_cases.json` by `test/layout-parity.test.js`.

#### Switches and the details

- `view-switches.ts` — the View menu's four switches (view_switches).
  - `VIEW_SWITCHES`, and `switchName`, each switch's name from the catalogue.
  - `startingSwitches`: from the settings' defaults, the style graph's merging and a view's switches saved as shown
    (view_switch_defaults).
  - `labelsHidden` and `LABEL_SCALE`: a link's label under 11 pixels is hidden (untangle_labels).
  - `ViewState`: one card's switches and the folds opened since. It folds a styled drawing for its layout (`folded`). It
    offers a hub's fold from its details (`hub`). It gives the switches a view saves (`saved`).
  - These are the drawing's alone, never written to the note (view_switch_view_only).
- `details-nav.ts` — finding your way from a thing's details.
  - `linkGroups`: its links by relationship type and direction, in words with a count: "is reported to by Bob and Cy
    (2)". The reverse reading is the schema's or the library's guess. A thing linked twice the same way is named once
    with each of its links.
  - `Trail`: the things chosen from them, back and forward.
  - `glideAt` and `MOVE_MS`: the brief eased move to a chosen thing.
  - `READABLE_SCALE`: below it a thing's words are under 11 pixels, too small to read.
  - `pointerTo`: the arrow at the view's edge pointing to a selection out of sight.
  - `sheetLimit` and `coverOf`: how tall the details sheet may be, and how much of a viewport it covers.

### Links and attachments (spec §18)

The core finds and judges links. The host says which files the vault holds, and opens, previews and renders through its
own handlers. Nothing here reaches the network.

- `links.ts` — the entry for §18, re-exporting the three below.
  - `linksHeld`: every link in a thing's or relationship's text properties, by property.
  - `attachmentsOf`: a thing's files, by name and type, each once.
  - `noteOf`: a thing stands for a note when its id is a global note id, or a link to a note. A global note id is
    `note:` and the note's name, as graph spec §10 writes it.
  - `brokenLinks`: each link to a note or file the host's `LinkVault` does not hold. Each written link is found from
    where the last of the same was, and what it meant is worked out once per target.
    - Each is a warning on the line it is written, with its fix in words: Create the note, or Put the file in the vault.
    - Or the fix is to change it to what it most likely meant, with the place to change. That is a file of the same
      name with another extension, else the nearest names.
    - `withMeant` writes that change into the block.
- `link-scan.ts` — `linksIn`, one linear pass over each line. Every search for a closing mark goes on from where the last
  stopped.
  - It finds wikilinks with heading and alias, embeds, Markdown links and images, and bare web and mail addresses. Each
    comes with where its target is written.
  - `linkKind`: only notes, files, web and mail addresses are opened. Any other scheme, however disguised by controls or
    entities, is refused.
  - `linkTo`: a host's rendered link, judged alike.
  - `leavingWords` (said before a link leaves the host) and `refusedWords`; `attachmentType`.

#### Rendering and renaming links

- `link-markdown.ts` — `safeMarkdown`: what a host renders for a thing's details.
  - An image from outside the vault, Markdown or HTML, is made a link showing its address (nothing remote loaded).
  - `remoteImagesIn` lists those images from the web, each once. `embeddedRemoteImages` lists an embedded note's. A
    host puts a Load image button by each, and loads one only when it is pressed (remote_images_asked).
  - A Markdown link or reference definition the user may not open is escaped to text. Its address goes on its own line
    or the next.
  - Other raw HTML is escaped, inside maths too.
  - A note embed is made a link.
  - Only an image, a sound, a video or a PDF of the vault is left embedded. A canvas, a base or any other file embedded
    is a link.
  - Code spans and fences are untouched, told apart as CommonMark tells them. An escaped backtick opens no span; a
    backtick fence's words hold no backtick; a fence closes on its marks alone.
  - `embedParts` cuts out each note embedded, for the host to read itself.
  - `embeddedMarkdown` is that note's text made safe, front matter left out. It keeps only the section a heading embed
    names (offline_and_mobile_apis).
- `link-renames.ts` — `renamedLinks`, the changes that follow a renamed note or file in every link inside a note's graph
  blocks (never prose).
  - It keeps each link's alias, heading and form.
  - A link that still finds a file, or whose new name a block could not hold, is left.
  - `applyChanges` makes them.

### Editing

#### The edit session

- `pane.ts` — the edit session: what is typed, written back to the note safely.
  - `texts` gives the note's blocks with the typed text in the edited block's place. `current()` gives the note as last
    seen, read so.
  - `edit` is an edit made from the drawing. The names it newly writes are checked as it is written. A refusal reloads
    the block and keeps the edit as a draft (`edit: true`).
  - The block may change outside the session (another program, a sync or another pane: reloaded, a conflict, or a write
    refused). Then its undo history starts again from the note as it now is.
  - Undo and Redo are then refused saying why (`history: true`, `stepRefusal`). So no undo is ever written over that
    change (undo_never_over_theirs, cc_undo_safe).
  - A change elsewhere in the note leaves the history as it is.
  - Switching to another block (`select`) starts that block's own history. So Undo never writes one block's text into
    another (undo_stays_in_its_block).
  - Through every change, the block is followed by `block-follow.ts`, never to a copy of it.
  - When a copy cannot be told from it, the session stops (`stopped`). Every write (marked `stopped`), Undo and Redo is
    refused saying so. `noteChanged` says `conflict` until a block is chosen again (block_followed_not_its_copy).
  - `blockText` is the text of the block on a line, for a picker to check a choice is still the block it showed.

#### Following the block

- `block-follow.ts` — `followBlock`: where the session's block is in a note changed since.
  - It is found by the lines unchanged at the note's start and end, never by its text alone. So a copy pasted elsewhere
    is never taken for it, and the original edited after the paste is still the block.
  - It may be rewritten so far that too little of it is left to know it by. `readsAsEdited` means keeping at least half of
    the held block's text after the graph line. With a copy elsewhere, the session then stops, never following the
    copy.
  - Another block moved to its line is never taken for it. A new block pasted beside it is taken for it edited only when
    it reads so.
  - A block may be followed with a new block of its graph directly beside it, on either side. It is then followed
    `wary`, as no reading tells that from the original rewritten beside a copy.
  - Then the session clears its history, as after a change made outside, so Undo never reverts what may be a copy. Undo
    and Redo follow the note they are pressed on first, so this holds whether the change was heard or not.
  - A change that could as well sit before the block as after it (a copy pasted beside it) is read both ways. Two blocks
    found make it a `twin`.
  - When the change runs through the whole block, it is found by its text. It is a `twin` when two blocks hold it. It is
    also a `twin` when a new block of its graph sits on its line, unless that was only pasted beside it.
  - The work is linear in the blocks, counted in `FollowWork`.
- `edit-check.ts` — that check (§4).
  - `editRefusal` refuses a name the note written into draws only under a suggested name (accept its name first).
  - It also refuses a name the edit gives a thing that another block of the graph gives too (already a name).
  - `newNames` finds the names an edit newly writes.
- `store.ts` — replacing or inserting a block in a note, keeping every other byte. `replaceSpan` writes a block already
  found, as the session finds its own.
- `history.ts` — the text's own undo history.

#### Help while typing

- `help.ts` — diagnostics, fixes, completions and the read-back, in the shapes of the Language Server Protocol. A
  diagnostic's `code` is its `Problem.code`, the graph spec reader's stable code (editor spec §42, problem_codes).
- `tokens.ts` — the gql-highlight tokenizer, for colouring.
- `name-suggestions.ts` — a name from a text, in the style of the graph's names and never one of them or a reserved word.
  Also a text from a name, and the ASCII words and slug of a text (`nameWords`, `nameSlug`), as the graph reader's names
  allow.
- `name-book.ts` — a graph's names kept up to date as names are added, its style and the names taken with them. So
  naming thousands of things never freezes the page (spec §9). Each name is the one `nameFromText` gives.
- `add-thing.ts` — adding a thing (add_thing).
  - `suggestName` gives the name for a text, from a `NameBook` of the graph's names, in their style and never one of
    them. The names are from the note as read and the block as typed, written or only mentioned.
  - `addThing` writes the thing after the block's last item: `(name:Kind {name: 'text'})`, under the key the kind's
    other things use.
  - It refuses with the reason when there is no text (it is asked for first).
  - It refuses when the name is not one word, is kept by the language or is taken (an `id` typed in the block counts).
  - It refuses when the kind is a schema label or is not declared by a locked schema. It refuses when the block holds
    only a SET or MATCH.
- `commas.ts` — the comma and the colon added for you.
- `autocomplete.ts` — completing as you type: the one best inline match (a closer, keyword, kind, type, property name or
  value) and the closer stepped over. Nothing is inserted unasked.

#### Properties, lists and schemas

- `inspector.ts` — properties of a thing or link, edited as text.
- `linked-list.ts` — a property held as things linked to this one: made, added to and removed from, as text edits.
- `lists-held.ts` — the lists a thing holds, read from a drawing (`listsOf`, `linkedValues`); `linked-list.ts`
  re-exports them.
- `lock.ts` — Lock the graph: a draft's schema written out, indented as the settings say. `kindLines` and `typeLines`
  are the lines that declare one kind or relationship type, which `declareDeferred` writes the same way.
- `schema-picture.ts` — a block that holds only a schema, a graph's own or a shared one, drawn as the schema itself (§3,
  schema_drawn).
  - `schemaPicture` writes its kinds as boxes and its relationship types as arrows between the kinds the data joins. A
    type not used yet is a box of its own.
  - It writes this as a small graph of GQL, and reads it; never the note's text.
- `standard-schemas.ts` — the standard schemas (§27, standard_schemas): shared schemas named with their version
  (`decision@1`), read for a note that names one. `withStandardSchemas` adds each the vault has none of its name of.
- `schema-names.ts` — `missingSchemas`: a graph naming a shared schema neither the vault nor the standard ones hold. It
  is warned of with the versions there are (schema_named_found). `readNote` asks it only when given the vault's schemas.

### Paths (spec §7; graph spec §22)

- `paths.ts` — walked paths.
  - `PathRecorder` takes the boxes tapped in order. The last step tapped again is ignored; an earlier one is added
    again, as a walk may revisit.
  - `pathBlock` writes the walk at the end of a block as a `Path` node with `STEP` edges numbered 1 to n, comma-joined.
    It has a fresh id in the graph's style.
  - `pathBlock` refuses with a reason when there are no steps or no title, or a step is not a fact in the graph. It also
    refuses when a locked graph does not declare Path and STEP.
  - `pathsOf` gives each path as data: its steps in seq order. Each step is marked `missing` when the thing is not in
    the graph. The path is marked `empty` when it has no steps.
  - The reader leaves a missing STEP out and reports it; `paths.ts` finds it again in the problem's `dropped` text.
  - `PathPlayer` plays one path step by step with a screen-reader sentence for each ("Step 2 of 5: …").
  - A missing step is stopped on and announced as missing. A path with no steps is refused (`PathPlayer.refusal`), never
    played as an empty story.
  - `pathProblems` reports a STEP through something removed, on the STEP's own line with its fix. Where the step sits on
    one line, it also gives the edit that removes it. It reports a path with no steps too.
  - `mergePathProblems` is what `readNote` uses to put them in `NoteReading.problems`. It replaces the reader's own
    report of the same STEP, so the badge counts each once.

#### Playing and exporting a path

- `path-play.ts` — `PathAutoplay`: Play stepping through a path on its own (path_autoplay).
  - It works around a `PathPlayer`, which also says where it is (`index`) and goes back to the first step (`restart`).
  - It goes from the step it is on, one step at the pace set, until the last. The paces are `PATH_PACES` and
    `DEFAULT_PACE`. `paceSaid` says a pace in UK English, as an exported file says it.
  - It can be paused or stopped at any step, and played on from where it paused. A step taken by hand pauses it.
  - The host hands in its timer (`Scheduler`). So the core never waits on a clock, and a host clears it when its card
    goes.
- `path-animation.ts` — a played path exported as an animated SVG (path_animation_export).
  - `pathPlan`: each step's thing, by Graphviz's node number. It adds a dot for each two steps in a row a drawn link
    joins, forwards along the walk.
  - `pathBody`: each step's number on its thing, and the dots' runners.
  - `pathCss`: a heavier outline moving from step to step at the pace, round and round, by `step-end` keyframes. Every
    step is outlined when still. All of it is stopped under reduced motion.
  - `pathSubtitle` says the walk in order, and `pathLegend` what the outlines mean. Both are in UK English: they are
    the file's bytes.
  - `animationFits` refuses one too large for the device (`ANIMATION_LIMITS`: steps, and an estimate of its bytes). It
    says why and what would make it fit, in the reader's language, before anything is laid out (animation_export_fits).
  - `exportWithLayout` gives that refusal back as a `TooLargeToAnimate`.
- `path-edits.ts` — a step taken out numbers the later steps of its path again (`stepsAfter`). These are carried as the
  removing fix's further edits (`Problem.also`), so the path keeps §22's steps 1 to n.

### The style graph (spec §2, §6, §7)

A graph's nudges, the properties it shows and the styling of its views and paths are a graph of their own. It is written
in a style block beside it: `// graph: trip_style · STYLE trip`.

`blocks.ts` knows one by its graph line (`styleOf`), and `dataKind` never takes it for data. So `readNote` never reads or
draws it, and the data reads the same with or without it. A graph line that says STYLE but names no graph is a problem,
never data.

#### Reading and checking a style

- `style-graph.ts` — what a style graph holds once read, and the words it allows.
  - `StyleGraph` holds nudges, shows, looks, and each view's fade or hide. It holds how each view was shown and the View
    menu's switches it was saved with.
  - It also holds the direction, where arrowheads are hidden, and the diagram types chosen. It holds how links move, how
    links are routed and merged, and the pictures on boxes.
  - The words it allows are the four nudge words, the ways a link moves (`FLOW_MOTIONS`) and the routings (`ROUTINGS`).
    They are also the lines, the formats, fade or hide, on or off (`INLINE`), and show or hide (`ARROWHEADS`).
  - The colours are only the locked style's hues by name (`STYLE_HUES`).
  - A Show switches a property on or off inline for a kind, a thing or a relationship type's links. It works in the
    whole graph or one view.
  - An Arrows hides or shows arrowheads for every link or one type's, in the whole graph or one view.
- `style.ts` — `readStyle`: every style block of a graph read with the data's own reader (`readBlocks`, told which blocks
  to read).
  - So what cannot be read is a problem on its line, and the rest is used. It never throws.
  - A style too large to read is not read: the locked style is kept, and why is said.
  - `lookOf` is the look of a thing or link in a view or path: a named hue, a line, a format. The thing's own look wins
    over its kind's.
  - `legendOf` gives every colour used there with what it means.
  - `outsideOf` gives a view's fade or hide, fade when none is written.
- `style-reader.ts` — `reader`: one style thing's properties read as text, a number, a word it allows or a name of the
  graph it styles. Each fault is a problem with its fix. It is shared by `style-checks.ts`, `style-choice-checks.ts` and
  `link-flow.ts`.
- `style-choice-checks.ts` — the choices for how a graph or a view is drawn, each checked: an Arrows, a Diagram, and a
  Links.
  - A Links (§25) has `routing`, one of `ROUTINGS`: curved, straight or right-angled. It has `merge`, on or off. It is
    for the whole graph or a view.
  - `style.ts`'s `linksOf` says how a graph's or a view's links are drawn, a view's own over the whole graph's.

#### Checking the words of a style

- `style-checks.ts` — each style thing checked on its own: its kind, its words, its values, and every name it uses.
  - The names are thing, other, from, to, selected, kind, relationship type, path and property. Each is checked against
    the graph it styles.
  - A name not there is given the nearest (`estimates.ts`'s `nearest`) as its fix.
  - A view's name is not checked: views are query blocks, and a name is the user's own. `style-words.test.js` holds
    that, however odd the name.
  - A thing with a key its kind does not know (`STYLE_KEYS`) is reported and left out.
  - A message quotes a written word as written, `$` and all.
- `style-words.ts` — the words of a style graph checked (style_words_checked).
  - `unknownKeys` gives a problem on each key the kind does not know. It is fixed to the nearest key the thing does not
    already write. With several equally near, each is a fix. With none near, it gives the keys to choose from, no edit.
  - `readFrame` reads a frame as four numbers joined by single commas. Each is an optional sign, digits with a dot
    before or after them, and an optional exponent. It is never hexadecimal, with no space and no stray comma.
  - Stray commas and spaces are a problem whose fix is the list without them, even when that is not four numbers yet. A
    part that is not a number has no edit.
  - A thing with such a key is not also told what it lacks (`RawThing.misspelt`). The rename comes first, then what is
    still absent is said.
- `style-conflicts.ts` — the things checked against each other. The first written is kept, the later left out, each
  with a problem. The conflicts are:
  - two directions, or beside and before on one pair;
  - a thing in two groups, or a loop of befores;
  - a view set to both fade and hide, or saved twice;
  - a colour given two meanings in one view or path;
  - a property switched both on and off, or arrowheads both hidden and shown, for one place in one view.

#### Drawing a style

- `style-source.ts` — nudges applied after the layout source is made (`nudgedSource`), and direction set on the drawing
  (`nudgedDrawing`).
  - Beside is a `rank=same` line. Before is an invisible link after every drawn one. Group is a labelled cluster.
  - With no nudges the source is returned unchanged, byte-identical to the Python library's.
  - The Python library honours nudges the same way (`graph_svg.nudged_source`, its style read by
    `gql_profile.read_style`). It is held to the core byte for byte on `python/graph_spec/tests/nudge_cases.json` by
    `test/layout-parity.test.js` (python_honours_nudges).
  - `styledDrawing` is the drawing as its style draws it in a view or the whole graph. Every host draws a graph, a view
    or an export so.
  - It holds its direction and nudges, and the links it draws without arrowheads. It holds the properties it shows
    inline, and how its links are routed (§25).
  - `render.ts`'s `directions` writes in, last, what the View menu folds and the routing. The folds are `folding`, put
    on the drawing by `ViewState.folded`.
- `arrows.ts` — arrowheads hidden or shown (§15).
  - `arrowsShown`: the most particular choice wins, a view's over the whole graph's, then a type's over every link's.
    They are shown when none is written.
  - `arrowlessLinks`: the links a drawing draws without them, guesses included.
  - `linkTypes`: the type each link is styled by. A guessed type's link is styled by the type it is taken for, for its
    arrowhead and its properties alike.
  - `arrowlessSource`: `dir=none` written on those links.
  - Only the arrowhead changes. So each link keeps its reading when tapped and in the text version
    (direction_never_lost).
- `inline-properties.ts` — properties shown inline (§14).
  - `inlineRows`: each box's and link's rows. Its most particular Show decides, a view's over the whole graph's, then a
    thing's over its kind's.
  - `valueText`: a value said as the reader keeps it.
  - `inlineSource`: the rows below a box's text or a link's reading, at the kind caption's size. They are in the box's
    text colour or the link's label colour. Past `INLINE_ROWS`, it shows whole properties and how many are hidden.
  - The Python library draws both the same way (`graphspec/style/arrows.py`, `inline.py`). It is held to the core byte
    for byte on `python/graph_spec/tests/style_cases.json` by `test/layout-parity.test.js` (arrows_both_renderers).

#### Moving links and pictures

- `link-flow.ts` — links that move (§7).
  - A `Flow` in the style graph is written `(f1:Flow {motion: 'dashes', means: '…'})`. It is for every link or a
    `type`'s, in the whole graph or a `view`.
  - It moves its links as dashes running along them, or a dot travelling along them.
  - `still` takes a wider one back. Every link is still unless a Flow moves it (flow_in_style_graph).
  - `flowOf` checks one. A Flow that moves links must say what it `means` (motion_not_alone).
  - `flowFor` and `flowLinks` choose as `arrows.ts` does: the most particular, the first of two alike.
  - `flowSource` writes each moving link into the source. Its label is opened by its icon (`FLOW_ICONS`).
  - It adds the classes `thoughtknot-flow`, `-dashes` or `-dot` and `-back`. With `-back`, its line is laid out from its
    far end, so it moves backwards along it.
  - Dashes are drawn dashed, so they show when still.
  - `flowLegend` and `flowSaid` say each movement and its meaning in words, for the legend and a screen reader.
    `reversedLinks` says which lines run against their links.
  - The movement itself is a style sheet's: the plugin's `styles.css`, or an export's (`export-motion.ts`). It stops
    under reduced motion (motion_reduced_respected).
  - The Python library writes the same source (`graphspec/style/flow.py`). It is held to the core byte for byte on
    `python/graph_spec/tests/flow_cases.json` by `test/link-flow-parity.test.js`.
- `picture.ts` — a picture on a box (§18, animated_image_shown).
  - A `Picture` in the style graph, `(p1:Picture {property: 'photo', kind: 'Cat'})`, names the property holding a
    thing's image. It is for a kind's things or one thing, in the whole graph or a `view`.
  - `pictureOf` checks one.
  - `pictureFor` picks the most particular: a view's over the whole graph's, a thing's over its kind's, the first of two
    alike.
  - `picturesFor` gives each box whose Picture's property holds text.
  - `pictureSource` keeps room for it in the source. That is a fixed square of `PICTURE_SIZE` points at the top of the
    box's label, filled with `PICTURE_MARK`. A host finds it and fills it with the image.
  - The Python library keeps the same room (`graphspec/style/picture.py`). It is held to the core byte for byte on
    `python/graph_spec/tests/picture_cases.json` by `test/picture-parity.test.js`.

#### Writing a style

- `style-edit.ts` — `styleEdit` writes a choice as text into the graph's style block.
  - The choices are a nudge, a look, a view's fade or hide, or how a view was shown. They are also a property switched
    on or off inline, arrowheads hidden or shown, or the diagram type chosen.
  - The style block is made after the graph's last block when there is none.
  - A view's setting, or a choice of properties, arrowheads or diagram type for one place, is changed in place. It is
    never written twice.
  - A data block is never touched.
  - A styled hue is drawn with `theme.ts`'s `hueColour`, the same blends as a kind's, so it meets the locked contrast.

### Animated images (spec §18, §11, §13)

A thing's image is a file attached in the vault, named by a property's value. The host reads it and draws it with its
own image decoding. The core says what it is and what it may do. No library decodes an image here.

- `image-links.ts` — where an image comes from.
  - `imageLink` reads a value as a link (`[[cat.gif]]`, `![[cat.gif|200]]`). Or it reads a path from the vault's root to
    a file of an image type (`IMAGE_EXTENSIONS`).
  - An address outside the vault (`https:`, `data:`, `//`) is never loaded as a thing's image.
  - In the details, an image from the web is a link. The host offers to load it when asked (remote_images_asked,
    `remoteImagesIn`).
  - A place that could leave the vault is refused, as a source's is (`sources.ts`, `outsideVault`). A link's target is
    refused as a path's is.
  - `imagesOf` lists a thing's images. `neverMoves` knows a JPEG by its name, for an image too large to read.
- `image-facts.ts` — `imageFacts`: an image's format, whether it moves, its frames and its size.
  - These are read from its bytes' header and chunks. That is a GIF's image descriptors, an APNG's `acTL`, or an
    animated WebP's flag and `ANMF` chunks. It is also an AVIF's `avis` brand, or an SVG's animate elements or
    keyframes.
  - It never reads past the bytes there. It never loops on a length that does not move it on.
  - An SVG's start and root are found by `svgScan`, which looks at each character once and counts what it looked at. So
    hostile markup (200 empty comments) costs no more than its length (review of #443).
  - An SVG has no frames to count. It has a pixel size only when its root gives one in pixels. Otherwise its size on
    disk alone holds it to the limits.
  - An AVIF's size is not read either.
- `image-limits.ts` — the limits an animated image moves within (`IMAGE_LIMITS`, said by `limitsSaid`).
  - They are size on disk, pixels a frame, frames, and how many move at once in one drawing.
  - An image over the size on disk is never read, and is not shown, saying why.
  - `startOf` says how an image starts:
    - moving;
    - still under reduced motion, until played (motion_reduced_respected);
    - its first frame, saying why, past a limit, with Play refused (animated_image_limited);
    - still while as many as may move already do.
  - `playRefusal` says why Play is refused.

### Diagram types (spec §15)

A graph is drawn as a network unless its style graph chooses a type: `(d1:Diagram {type: 'tree', relationship:
'MANAGES'})`. The choice is for the whole graph or, with `view`, for one view (type_remembered). Style-graph.ts holds the
seven `DIAGRAM_TYPES`. style-checks.ts and style-conflicts.ts check a Diagram's words and allow one type for each place.

- `types-shape.ts` — the shape a type is judged on, with its first loop and its centre. The shape (`shapeOf`) is the
  things, their kinds and first dates, the links, and the groups the nudges draw.
- `types.ts` — which types fit a drawing's shape, and why each that does not (`typeFits`).
  - A network always fits.
  - A tree fits along one relationship with at most one parent each (a parent linked twice is one) and no loop. With
    none chosen, it uses the relationship with the most links that makes one; of two with as many, the first by name.
  - A flow fits links with no loop.
  - A radial drawing needs three things or more joined to the centre, and no group written. The centre is the thing
    with the most links.
  - Lanes need every thing of one kind and every group of one kind, with two kinds or more. Each group is drawn inside
    its lane and never by the nudges again.
  - A timeline fits any things, dated or not (timeline_fits); its order and what it shows are below.
  - A table fits any things.
  - `suggestType` gives the best fit and why, never drawn unless chosen.
  - `diagramFor` gives the type drawn: the chosen one while it fits, else a network, with why and `nearestType`
    (type_stops_fitting). It also gives the plan Graphviz lays it out by.
  - `diagramOffer` gives all three at once, for a host's card, a tree judged along the relationship chosen for it.
  - `styledDrawing` puts that plan on the drawing. render.ts writes it in first (graph-layout.js `typedSource`). It lays
    a tree out down and the other types across, unless a direction is set.
  - The Python library judges and lays out alike (`graphspec/style/diagram_types.py`). It is held byte for byte on
    `python/graph_spec/tests/type_cases.json` by `test/layout-parity.test.js`.
- `types-table.ts` — the table, which the host draws as a plain table (`tableOf`: Thing, Kind and each property, and each
  link). Also the way in to a graph of more than `LARGE_GRAPH` things (`wayIn`, large_way_in). Also which types scroll
  one way only on a phone (`scrollsOneWay`).

#### A timeline's order and what it shows

A timeline's Diagram may choose `order`, `by` and `show` (timeline_order, timeline_show; `types.ts`, `timelinePlan`):

- `order`: `date` (a rank for each day), `number` (a rank for each number), `written`, or `links` (each thing after the
  things that link to it). With none, or none that any thing carries: by date, else links, else as written.
- `by`: the date or number property it is ordered by. With none, each thing's first date, or the most used number.
- `show`: `all`, `dated` or `undated`. `styledDrawing` leaves the hidden things and their links out (`withoutHidden`).
- Things without the value stand together in a last rank. A timeline is suggested only when every thing has a date.

#### A plug-in's diagram type

A style graph may choose a type a plug-in adds, named under its id, such as `acme.charts.sankey`
(plugin_diagram_type_named; `pluginTypeOf`). Where no plug-in draws it, `diagramFor` gives a network, with `plugin`
saying which plug-in draws it. The Python library reads it alike.

A host that has the plug-in draws it (trust_diagram_type_data; `plugin-diagrams.ts`):

- The plug-in adds a `PluginDiagram` through the `diagrams` point. Its `draw` gets the graph's shape and the space,
  frozen, and no host ability.
- It gives back marks as data: boxes, lines and text, each with where it goes. Never markup.
- The registry's `drawDiagram` checks every mark and draws the SVG itself, escaping every label. A mark outside the
  space, or of an unknown kind, refuses the drawing, and the host keeps the network.
- `diagramContract` holds a diagram type to its promises, as the other points' contracts do.

#### Drawing marks: one picture format for every type

`drawing-marks.ts` is the one format every diagram type will give back, the built-in ones too (plugin_interface). The
built-in types give it too: Graphviz lays them out, and the engine reads that layout as marks (`engine.marks`).

- A mark is a box, a link, a label, an arrowhead or a group. Each has numbers for where it goes and a style token for how
  it looks, such as `thing` or `link.dashed`. Never a colour, CSS or markup.
- Each mark has an id that stays the same between drawings, so a large drawing can change only what changed.
- Text is a label mark of its own, with its size, anchor and widest width.
- A link mark may name the keys of the two things it joins (`from`, `to`). Every number is in CSS pixels at scale 1.
- A mark may name the thing or link it draws (`of`), its group and its order on top (`z`). It may also carry a name and
  role for a screen reader.
- `drawMarksOf` checks and copies marks, refusing any with why. Every id must be its own, and every group named drawn.
- `markBounds` and `marksBounds` give the box marks cover. `drawOrder` sorts by order on top.
- `fromPluginMarks` turns a plug-in's boxes, lines and text into this format.
- A shape may keep the exact `outline` it was laid out with, and any mark its `lineWidth`. A label may name its `font`.

#### Graphviz's layout as marks

- `graphviz-marks.ts` reads Graphviz's layout, as JSON, into marks (`layoutMarks`). It turns points from the bottom into
  CSS pixels from the top, and names each link by the keys it joins and a count. It also keeps how Graphviz's own SVG
  holds them: each part's id, class and title, in the order Graphviz writes them.
- `graphviz-json.ts` holds Graphviz's JSON types, and the style token each stand-in colour stands for (`colourToken`).
- `graphviz-svg.ts` writes the SVG from the marks (`layoutSvg`). It is the one Graphviz writes, part for part. The
  tests hold it so for a drawing of each kind the core makes. So a host that draws marks draws what Graphviz drew.
- The SVG shown is still Graphviz's own (`engine.render`). Reading the layout as JSON costs about twice the work, for
  the same drawing. A host that draws marks itself asks for them.
- When marks cannot give a drawing back exactly, they say so (`layout.lost`). That is a text Graphviz's JSON leaves
  out, or a colour that is no stand-in.

#### The built-in types, through the plug-in interface

- `core-diagrams.ts` adds the seven built-in types through the plug-in interface, as a plug-in adds its own
  (`coreDiagrams(engine)`, plugin_interface). Each is named under the core's id, such as `thoughtknot.diagrams.tree`.
- Each gives drawing marks for a graph's shape. Graphviz lays the shape out as the type, in the direction that fits the
  space best. The marks are shrunk to fit the space (`scaledMarks`), never grown.
- A type the shape does not fit is drawn as a network, as a drawing is. A table is a row for each thing.
- A plug-in's type may give drawing marks too. A list whose first mark has an id is drawing marks (`drawnMarks`).
- The registry's `diagramMarks` gives a type's marks, checked, for a host that draws marks. Its `drawDiagram` still
  gives SVG: drawing marks are written by `layoutSvg` and coloured by the theme.
- The view still shows Graphviz's own SVG. These marks are what the renderer will draw.

### Views (spec §2, §7)

A view is a named query block in the note: `// graph: <graph> · QUERY view <name>`, then the query. The reader already
reads `· QUERY` as a query, and the core draws no query as data. So a view is never drawn as a graph of its own.

#### Finding and reading views

- `views.ts` — `viewsOf` finds the views of a note, each with its graph, its block and its query text.
  - Some blocks are listed with a `fault`, never skipped. That is a block meant as a view with no name, or a name that
    is not one word. It is also a name already used in its graph.
  - `readingOf` says a view in plain language ("everything within 2 steps of Alice"), in the reader's language.
  - `sourceReadingOf` says it in UK English, for what is sent to a model or written into a file.
- `view-profile.ts` — the view profile.
  - `parseView` reads the five shapes of query into a `ViewSpec`. The shapes are a hand-picked set, everything near a
    thing, how one thing reaches another, only some kinds, and a walked path.
  - It refuses anything else with a message that names the five shapes in words. The message shows the nearest one's
    form (`viewName`, `VIEW_FORMS`). Its words come from the catalogue (views-source-words.ts).
  - The queries are ISO GQL that Grafeo runs as written.
  - A thing is named by its `id` property. The reader writes it into every node it gives Grafeo, and the core's world
    keys every node by it.
  - Several kinds are written after `IS` (`(n IS Person|Team)`), because Grafeo does not read `(n:Person|Team)`. A colon
    takes one kind.
  - A name the query gives a thing or a route is never a word `reserved-words.ts` keeps from names. A kind is never one
    it keeps from kinds. `viewQuery` refuses such a kind with a RangeError that says why.
- `reserved-words.ts` — the words a view may not use, in any case.
  - As a name: GQL's reserved and pre-reserved words (ISO/IEC 39075:2024 §21.3) and its truth values (§21.2), as the
    openGQL grammar lists them. Also the words GQL leaves free that Grafeo 0.5.43 refuses as a name, NaN and Inf among
    them (`GRAFEO_REFUSED`).
  - As a kind, which is a label: only the fewer words Grafeo refuses as a label (`GRAFEO_REFUSED_KINDS`). So Path, Match
    and Nothing may still be kinds.
  - The Python library's `test_view_parity.py` holds both Grafeo lists to Grafeo, from a word list of its own.
  - A refusal says only that GQL keeps the word, and suggests another.

#### Writing and evaluating views

- `view-write.ts` — `viewQuery` writes the query for a view built by tapping.
  - It is always one `parseView` reads back to the same view. Steps are held to 1 to 3 near and 1 to 6 reaching. A long
    set of names goes over lines.
  - `viewBlock` writes the whole block.
  - `makeView` makes a view's block (the entry exports it, not those two). It says in words what no query can say.
  - `addView` is the one way a host writes one into a note, after its graph's last block, against the note as it is
    then. It refuses a view of a thing only suggested there ("accept its name first"), and a name another view has.
- `view-evaluate.ts` — `evaluate` puts a view to a graph of a reading, never to a copy of it.
  - It gives its things and its links (indexes into the links the graph draws). When nothing matches, it gives `empty`
    with a sentence saying so and what to change.
  - A route of up to k steps is a walk, as Grafeo takes it (a link may be used again). It is found by two breadth-first
    searches.
  - The things were compared with Grafeo's answers for the same queries on random graphs. They are held to them by one
    table, `python/graph_spec/tests/view_cases.json`.
  - `test/view-parity.test.js` holds the core to that table. The Python library's `test_view_parity.py` holds Grafeo to
    it.

### Graph sources and graph steps (spec §20; §7 view_of_another_note)

A graph may be written somewhere other than the note that draws it, and a step works out a graph from graphs. Neither is
data of the note it is written in.

- `blocks.ts`'s `isSourceBlock` keeps a FROM block out of `dataKind` (the Python reader's `data_kind` does the same).
- A step is a query block, so the note reads the same with them or without.
- Both are known by their graph line alone (`isSourceBlock`, `isStepBlock`), so a long block is never read to decide it.

#### Sources

- `sources.ts` — a block whose graph line says FROM and a place draws its graph from that .gql file or note (`sourceOf`,
  `sourceFor`). The place is written `// graph: trip · FROM Graphs/trip.gql` or `· FROM [[Trip plan]]`.
  - A place that is neither is a fault. So is a block holding lines of its own, so data is never copied in.
  - So is a place that could leave the vault or reach what it hides. That is a leading slash or backslash, a drive
    letter, a `..` part or any part starting with a dot.
  - The host fetches the text (`Fetched`). It is found, unreadable, or missing with any file of the same name
    `elsewhere`. Or it is too large by the size it keeps, and so never read.
  - `readSource` reads it as a note's own blocks are read, by `readNote`. So the same partial reader and limits hold. A
    .gql file is one block, its CRs taken off.
  - Or it refuses in a sentence naming the place: missing, moved, unreadable, no graph line, or no such graph. A note
    that draws it FROM elsewhere itself is named, with where to point instead.
  - `lineInSource` is a problem's line there.

#### Steps

- `steps.ts` — a step is a query block `// graph: <graph> · QUERY step <name>`. Its named points are declared above its
  rule (`// takes <point>: (:Kind), [:TYPE]`).
  - `stepOf` reads one or says what to change. The faults are no name, or longer than `MOST_STEP_CHARACTERS` (refused
    before its rule is read). They are also no point, or a rule matching a kind or type no point takes.
  - `runStep` runs it only when a host asks, on the note as it is.
  - The step's fault, a graph the note does not write, and each input are checked first. Any of them refuses the run.
  - The links its INSERT names for every match are its output graph. Those its graph lacks are a proposal from the step
    (`makeProposal`, `linkChange`, `thingChange` for an end the graph lacks, `basisOf`).
  - Each has id `<step>_<n>`, with the match that found it as its reason.
  - Nothing is written: the host writes the proposal beside the graph (`noteWithProposal`).
- `steps-rule.ts` — the rule, a GQL query over graph data and never code or a named action.
  - It is MATCH one pattern, then INSERT links between things it named. The pattern is things with an optional name,
    kind and properties, joined by up to `MOST_PATTERN_LINKS` links, one way or either.
  - CALL, a function, SET or DELETE and the other writes, RETURN, and anything that reads as code are refused. Each says
    why and shows `RULE_FORM`. The words of steps and paths come from the catalogue (steps-source-words.ts).
  - `ruleTokens` reads a rule once. A text ends at its line, and nothing after the first mark that cannot be read is
    read (spec §9).
- `steps-match.ts` — every match of the pattern, as GQL matches a path. Each link is used once in a match, and a name
  used twice is the same thing.
  - It is bounded by `MOST_MATCHES` and `MOST_TRIES` (every thing and link looked at, fitting or not). Past them it stops
    and says so (spec §9).
#### What a step is given

- `steps-input.ts` — what is given at a point: a graph of the note, whole, or a view of one (a queried path among them).
  - It is put to the reading as `evaluate` puts it, never a copy.
  - `givenLabel` names what is given in the reader's language. Each input's `read` names it in UK English, as the
    change set records it.
  - `inputFaults` checks each against its point before the step runs: every kind and type it takes held, something
    given.
  - `together` reads the inputs as one graph, a thing by id.

### Export (spec §16)

The host does what needs a canvas, the file system or a dialog; the core decides everything else.

- An image is exported as SVG or PNG (`EXPORT_FORMATS`), of the whole diagram or of a view. It uses the fixed light or
  dark colours chosen.
- The data is exported as a GQL block, CSV or GraphML (`DATA_FORMATS`). Each is read back into the very things and links
  exported.

#### What an export holds and how it looks

- `export-scope.ts` — `exportScope`: what an export holds.
  - The whole diagram is the graph as drawn.
  - A view is put to the graph as `evaluate` puts it. It holds only its things and the links between them, in the
    graph's order.
  - Each link says which written link it is (`edge`, so its properties are its own). A guess (an estimated link) is
    still a guess at its new place.
  - With the faded context asked for, it holds the whole graph. It lists what is outside the view (`faded`: things by
    key, links by edge number).
  - An empty graph or view is `empty`, with `why`.
- `export-marks.ts` — fading and looks written into the SVG (`marked`).
  - Each faded thing and link gets an opacity in the style attribute of its group (the pane's 0.35).
  - Each look's border, text, line and format become style declarations in the locked blend of its hue, as the pane's
    stylesheet draws them. This is because an image cannot take the stylesheet.
  - Groups are found by Graphviz's numbering (`node1`, `edge1`…) in a single pass.
- `look-tags.ts` — a numbered tag for each colour a view's looks use (`lookTag`, `lookTags`). Each box or link of that
  colour carries the tag, and so does the legend. So no look is told by colour alone (§44, colour_never_alone).
- `shortcuts.ts` — every keyboard shortcut in one list (`SHORTCUTS`, by `SHORTCUT_PLACES`), with its words in
  `shortcut-source-words.ts`. The drawing's commands are marked, for a host to offer (§44, shortcuts_listed).
- `first-run.ts` — a first graph from an example (`withExample`), and the steps of its short tour (`TOUR_STEPS`), with
  their words in `first-run-source-words.ts` (§44, first_run_help).
- `export-frame.ts` — the frame (`framed`).
  - It holds the image's own background, a title, the reading of a view, and the legend. It also holds a footer with
    the note and the day (`saidDate`, `11 Oct 2026`).
  - It uses the locked style's font and sizes and the palette's fixed colours.
  - The drawing is nested inside at natural size. Text widths are estimated, so long lines wrap early.

#### Laying out and writing the image

- `export.ts` — `exportWithLayout` lays the scope out through the layout the host hands in (`ExportLayout`).
  - That is the one its drawings use, apart from the interface and under the same size and time limits. So a huge or
    hostile graph never holds the page for an export.
  - It lays out in `PALETTES.light` or `dark`, marks it, frames it, and gives `{ svg, width, height }`. No colour holds
    a theme variable or `color-mix` (it throws if one is left).
  - A layout over a limit, or timed out, is given back whole as its `Refusal`. The host says why and writes nothing. It
    gives null when the layout is no longer wanted.
  - An empty scope is refused before any layout is asked for. An engine failure is raised.
  - `exportSvg` is the same with an engine run on the calling thread under no limit. It is for tests and tools, never a
    host that draws apart from its interface.
  - With `ExportInfo.walk` the image plays that path (path-animation.ts). It is refused first when too large for
    `ExportInfo.device`.
  - With `ExportInfo.motion` it moves the links its style moves (export-motion.ts).
  - `pngSize` is the PNG's pixel size, never under `PNG_MIN_SCALE` (twice natural size) and rounded up.
  - A view's looks are drawn and put in the legend with what they mean.

#### Movement, pictures and pages

- `export-motion.ts` — movement in an exported SVG, by CSS in the file itself (no encoder, nothing loaded).
  - It needs `ExportInfo.motion` and an SVG; a PNG is drawn still.
  - The links a style moves run their dashes, or a dot travels a copy of each one's line (`withRunners`).
  - `withStyleSheet` puts the style sheet first in the image.
  - Every animation stops under `@media (prefers-reduced-motion: reduce)`, leaving the dashes, the icons and the
    legend's words.
  - Every rule is written under the class the image's root carries (`IMAGE_CLASS`, `inImage`). So an SVG put inline in
    a page styles nothing of the page's own.
- `export-pictures.ts` — the pictures on boxes in an exported image (§16, export_animation_stated; §18).
  - With `ExportInfo.pictures`, the host's loader, each image is embedded as a data address. So the file loads nothing.
  - An SVG keeps an animated one moving within `IMAGE_LIMITS`. Its first frame sits beside it, shown instead under
    reduced motion by the image's own style sheet, scoped under `IMAGE_CLASS`.
  - A PNG, or one past a limit, is reduced to its first frame.
  - One that cannot be had, or was never read (`UnreadImage`, over the size limit: left out), is drawn as a dashed frame.
  - Only an image type of a fixed list is written before the bytes, which must be base64. An image is never put inline.
  - `ExportImage.animation` says what was done with each animated image, a line each, in the reader's language. The
    frame says it too, in UK English, as it is the file's bytes (`animationSaid` with `sourceWord`).
- `export-pages.ts` — `pngPages`: an image too large for one sharp PNG on the device, split into a grid of pages.
  - Each page is at twice natural size or more, within the device's pixels, and no side over `PNG_MOST_SIDE` (32,767
    device pixels).
  - There are as few pages as the pixels allow, then evened out, so a row is never whole pages and a sliver. They are
    in reading order.
  - It gives null when the pages would be too small (`PNG_PAGE_LEAST`) or too many (`PNG_MOST_PAGES`).
  - `pageSvg` cuts the SVG to a page by its root's size and view box.

#### Exporting the data

- `export-data.ts` — `exportedData`: the things a scope draws and the links written between them.
  - It keeps every kind and property as read, never a schema's own thing or a guess. `ExportScope.linksAt` finds a
    view's links as written.
  - A view holds only its own, unless its faded context is asked for. Then it holds the whole graph, with what is
    outside the view in `faded`, which each format marks.
  - Each thing's and link's `///` note, as `notes.ts` put it on the drawing, is in `notes` (§24, note_standard). A
    format with comments keeps it; CSV, which has none, leaves it out.
  - `dataText` writes it in one of `DATA_FORMATS`. These are the built-in exports `CORE_EXPORTS` adds through the
    plug-in interface.
  - No layout is asked for.

#### The reader's words and formats

- `locale-formats.ts` — what is shown, in the reader's locale (editor spec §42, locale_formats, locale_sorting).
  - `formatCount`, `formatSize`, `formatDay`, `formatInstant`, `formatList` and `sortedForReader` work through the
    platform's Intl.
  - They use the locale `setLocale` was given. Until then, and for a tag the platform does not know, that is UK English.
  - They are never used for what is written into a note, an export's data or the layout source
    (locale_never_changes_bytes). So an order written into text, as `github-review-items.ts` writes its groups, keeps
    one collation.
  - `hosts/refusal-words.ts` imports only types from the core, as a host-side module must. So the host hands in
    `word`, `formatCount` and `formatSize` (its `Say`), and the refusals are said in the reader's language.
- `words.ts` and `source-words.ts` — the words the person reads, by key (editor spec §42, words_catalogue,
  language_follows_host, translations_as_files).
  - `word(key, values)` says one in the current language. Its `{name}` placeholders are filled, and its plural form is
    picked for `count` by `Intl.PluralRules`.
  - `SOURCE_WORDS` is UK English.
  - A translation is checked by `translationProblems` and added by `addTranslation`.
  - `setLanguage`, called by `installHost` with the host's `language()`, picks it, or its base language's, else UK
    English.
  - A word a translation lacks is said in UK English, never as its key.
  - Places move their words into `source-words.ts` one at a time.
  - Some words sit apart, each spread into `SOURCE_WORDS`:
    - the settings options' words in `settings-source-words.ts`;
    - the browser page's own in `page-source-words.ts`;
    - editing's (properties, adding a thing, Edit, kept drafts) in `edit-source-words.ts`;
    - the AI dialog's and AI models' in `ai-source-words.ts`;
    - Import's in `db-source-words.ts`;
    - the drawing's (diagram types, layout refusals, animated images, links leaving the vault, completeness) in
      `drawing-source-words.ts`;
    - and the plug-ins' calls that fail in `plugins-source-words.ts`.
  - Every word a person reads in the core and the hosts comes from here. words-in-code.test.js checks every file, and
    lists the few strings kept in the code, each with why (words-in-code-areas.js, words-in-code-kept.js).

#### The plug-in interface

- `plugins.ts` — the plug-in interface (editor spec §43, plugin_interface, plugin_manifest_limits).
  - `pluginRegistry` is where a `ThoughtKnotPlugin` is installed once its manifest is accepted. The manifest holds `id`,
    `version`, `api` of `PLUGIN_API`, and the `uses` it names of `EXTENSION_POINTS`.
  - A plug-in is given only the points it names.
  - A refused plug-in leaves nothing behind. A call into one that throws is caught and named (`PluginResult`).
  - Its first point is the data exports (`DataExporter`).
  - Its second, `theme`, hands a plug-in the core's tokens and adds its own (theme-tokens.ts). Each is refused, saying
    why, when it misses its name or the locked contrast. They are listed by `themeTokens()`.
  - Its third, `storage`, adds a place notes are kept (`StorageBackend`), opened by `openStorage`. The core's own,
    `CORE_STORAGE` in core-storage.ts, keeps notes in memory.
  - Its fourth, `commands`, adds a command (`PluginCommand`), named under the plug-in's id and run by `runCommand`.
  - Its fifth, `panels`, adds a panel (`PluginPanel`), drawn by `showPanel` into an element the host gives.
  - A manifest also names the host's abilities it uses (`HOST_ABILITIES`): a notice, its own settings, its own secrets
    and the notes. It is given those alone, as `points.host`. One the host does not offer (`HostOffer`) is refused.
  - Its secrets are only those named under its id, such as `acme.one.token`. Any other name gives null, so it never
    reads an AI model's key or another plug-in's (TRUST-15).
  - A call that runs longer than `PLUGIN_TIME_LIMIT` is named and its answer dropped. Its plug-in is then stopped, and
    `stopped()` lists it. A host may set its own limit and clock (`RegistryOptions`). The time is read after the call
    returns, so a call that never returns is not stopped here. A plug-in run apart is (TRUST-14, below).

#### Versions of the interface and its points

`plugin-versions.ts` holds `PLUGIN_API` and `POINT_VERSIONS`, each major.minor (plugin_point_versions, API-10):

- A plug-in built for the same major and a minor no higher loads (`versionFits`).
- A manifest may name each point with its version, `diagrams@1.0`. One with none counts as `@1.0`.
- A point that moves to a new major refuses only the plug-ins that use it, naming that point. A host may set its own
  point versions (`RegistryOptions.pointVersions`).
- The sample plug-in outside the packages, `examples/sample-plugin`, runs in a worker in CI and passes each contract
  (`test/sample-plugin.test.js`).

#### A plug-in run apart, in a worker

A host loads a plug-in it did not ship only in a worker (trust_plugin_isolated, TRUST-14). The core holds both sides
and is handed the port between them, as for layouts:

- `plugin-serve.ts` is the worker's side. `lockDown` takes the network and lasting storage away first. Then
  `servePlugin` registers the plug-in and says, as data, what it added. `import()` cannot be taken away by name, so
  the host starts the worker under a content security policy with no network.
- `plugin-isolated.ts` is the host's side. `isolatedPlugin` makes from that a plug-in the registry installs as any
  other. Each call goes over the port, timed by the host's clock.
- A call that loops or never answers ends the worker, and every later call fails at once, naming the plug-in.
- The worker asks the host for an ability its manifest names, and the registry's checks still apply.
- It may add to `ISOLATED_POINTS` only. A panel needs the page; a data export and an AI provider answer at once.

#### A plug-in from its file

`plugin-outside.ts` is how a host loads a plug-in it did not ship, from its file (plugin_outside_file, API-10):

- The host reads the file as text. `outsideProblem` refuses a file that holds the word `import`, exports more than
  its default, or is too long. Such a file never starts a worker.
- The worker's script is the host's own start and then `outsideBody`, the file itself. Nothing is imported or
  evaluated to run it, so the plug-in store's rules hold.
- The start calls `sealOutside`. It runs `lockDown` and then `sealCode`, which takes away `eval`, `Function`, the
  maker each kind of function reaches, and timers given text. If anything stays, it throws, and the file never runs.
- `outsidePlugin` checks the file, starts the worker and hands its port to `isolatedPlugin`.

#### What plug-ins add, and what they reach

- `plugin-points.ts` — what a plug-in adds through each point, the host's abilities, and why each is refused.
- `plugin-files.ts` — the files ability through the note gate (TRUST-16). `gatedFiles` lists and reads only notes at
  or below the ceiling the person set for the plug-in. A change it makes waits as a proposal (`CHANGE_WAITS`).
- `core-storage.ts` — `CORE_STORAGE`, the core's memory storage as a plug-in.
- `plugin-calls.ts` — every call into a plug-in, timed, caught and named. `awaited` times a call whose answer comes
  later, until it comes.
- `plugin-sources.ts` — what a graph source or step gives back, held as a `JoinedGraph` (trust_source_joined). It
  carries its origins. A source's graph starts untrusted; a step's keeps the lowest trust it was given. An unlabelled
  graph counts as the strictest class, and a step's keeps the strictest class it was given. One past the read limits
  is refused. The registry reads them with `readGraph` and `runStep`.
- `plugin-ai.ts` — AI providers (trust_ai_provider_bounded). A provider only shapes the body (`shape`) and reads the
  reply (`read`). It names where the key goes (`key`), and the host puts it there. `aiProvider` gives one with each
  call timed and named; `prepareSend` takes it as `provider` for a model whose `provider` names it.

#### The contract suites

- `plugins-contract.ts` — the contract suite of each extension point (plugin_contract_suites).
  - `exporterContract`: the checks a data export is held to on `sampleExports`, which the built-ins pass.
  - `themeTokenContract`: those a theme token is held to: its name, its colours and its contrast in each theme.
  - `storageBackendContract`: the note storage contract, run on a store the backend opens afresh for each check.
  - `commandContract`: a command's id, its title on one line, and that it can be run.
  - `sourceContract` and `stepContract`: a graph source or step gives back a graph's text within the read limits. A
    step is tried on `SAMPLE_GRAPH` and must give the same graph each time.
  - `providerContract`: an AI provider shapes text holding what it was asked, the same each time, and reads any reply.
  - Each title is checked for right-to-left too (plugin_rtl). It must force no direction of its own, so it reads in
    the host's.

#### The data formats

- `export-data-model.ts` — the data's types, and the five kinds of value the profile reads, each said so it reads back.
- `export-data-gql.ts` — a GQL block: the graph line, a comment saying where it came from, a thing or link to a line.
  - A thing is written under its id. Where its id cannot be a name, it is under `thing_<n>` with its id written in full.
  - A thing or link of a view's faded context owns a `//@ faded: outside view <name>` line (§27), a comment to the
    reader.
  - A note is the `///` lines directly above its thing or link.
- `export-data-csv.ts` — CSV as RFC 4180 writes it, with no byte order mark.
  - So a spreadsheet that assumes another encoding without one may show non-ASCII text wrongly.
  - It has a header naming each property with the kind of its values.
  - It has a row for each thing then each link, of kind `faded thing` or `faded link` outside a view.
  - An empty text is quoted, so it is told from a missing one.
  - A text a spreadsheet would run as a formula is guarded by an apostrophe. The readers take it off, but a spreadsheet
    such as Excel shows it.
  - CSV has no comments, so a note is left out, never made a column.

#### GraphML and XML comments

- `export-data-graphml.ts` — GraphML that keeps to its schema.
  - A node is named by its place. The thing's id, kinds and a link's type are data.
  - There is a key for each property and kind. A day or an instant is said by the key's own description, `gn:date` or
    `gn:datetime`.
  - A view's faded context is marked by `:faded`. XML's marks are escaped.
  - A character XML cannot hold is refused, naming where it is.
  - No GraphML schema is on this machine to validate against, and none is downloaded. The output was checked
    well-formed with xmllint, and it writes no attribute GraphML does not name.
  - A note is an XML comment on the line directly before its node or edge. It is a comment and never a key, as GQL's
    engines take it.
- `xml-comment.ts` — `noteComment`: a note as the XML comment that holds it.
  - Its text is escaped: `\\`, `\-` for a hyphen after a hyphen, `\r`, and `\u{…}` for a character XML cannot hold.
  - So it holds no `--`, never ends with `-`, can never end the comment, and reads back exactly.
  - The Python library's SCXML export writes the same comment (`note_comment`). Both are held to
    `python/graph_spec/tests/note_comment_cases.json`.
  - `notXml` is XML 1.0's characters.
  - `commentPieces` gives the escaped text a piece for each character, keeping only the last character written. So the
    work is linear in the note (a run of hyphens among them). It is counted in `test/xml-comment.test.js`, never timed.

#### Planning and writing the files

- `export-plan.ts` — `exportPlan`, the one decision before anything is written.
  - It gives `{ nothing }` for an empty scope.
  - It gives `{ ask }` for a note classified above the configured level, naming both. A classification not in the list
    counts as above every level. The host asks again with `confirmed` once the user says yes.
  - Or it gives `{ go }` with the file's name and place and, as configured, the companion note's.
  - A name is made from the note, the graph or view and the day, safe on every platform.
  - A folder setting that could leave the vault is not used.
  - The data gets its companion note as an image does. A PNG on pages gets each page's name (`pages`).
- `export-note.ts` — `companionNote`: the Markdown that links the export and the source note. It names the graph or
  view, the day and the scope.
  - An image's note shows the image, or each page, with nothing of the data beyond what the image shows.
  - The data's note links its file and shows nothing. It says how many things and links it holds, and how many of them
    are a view's faded context.
- `export-write.ts` — `writeSafely`: the bytes go to a temporary file given by the host's `write`, then `rename` into
  place. On any failure the temporary file is `remove`d and the target is never touched. The result says why in a
  sentence.

### Proposals (spec §17)

A proposal is changes to a graph that somebody other than the person reading proposes. It may be an AI's answer (§19), a
graph step's output (§20), or anyone's. It is data, whatever its source; nothing here knows where it came from. It is
shown over the graph and never written until a person accepts a change. Then it is written as an ordinary edit.

#### The proposal as data

- `proposals.ts` — the data.
  - `makeProposal` checks a proposal: who proposed it, the state of the graph it was made against, and at least one
    change. Each change must be written as a block writes it.
  - It gives each change its derived id and a group. The id comes from its statement and is never written by a source,
    so one change proposed twice is refused.
  - `Provenance`: who, when, what it read, the basis.
  - A change is an addition (one item of GQL), a change of a property (`set`), or a removal of a thing or a link.
  - `thingChange` and `linkChange` build additions from parts, for a source whose answer is data.
  - `groupsOf` and `provenanceLines`.
  - `BIG_PROPOSAL`: above it, a proposal is reviewed in groups.
- `proposals-basis.ts` — `basisOf`: the state of a graph as graph-spec's change sets name it (`against`). `staleness`
  says whether the graph has moved since.
- `proposals-statements.ts` — a change as the statement a change set holds.
  - That is an addition's item, a `SET thing.key = value`, or a `DELETE` of one link. Or it is a `DELETE` of one thing
    (`DETACH DELETE`, which lists the links it takes).
  - `statementOf` writes it. `readStatement` reads it with graph-spec's own `readChange`.
  - `changeIdOf` gives the id the library derives (`changeId`, the one `checkChangeset` reports). An addition's is a
    hash of its tokens.
- `proposals-text.ts` — a proposal as graph-spec's change set (§24).
  - It starts with the header: the graph, the id, `against`, and `by`, the only place either is said.
  - Then come `// proposed:` and `// read:` comments its readers pass over, and the additions. Then comes a statement
    for each other change.
  - So every tool that reads GQL reads it, and `checkChangeset` passes it.
  - An optional `//@ reason:` line sits directly above a change. A `//@ group:` line sits above it when the group is not
    the one its kind gives.
  - Nothing a person decided is in it.
  - `changeSetText` writes it. `readChangeSet` reads it as the check does (`splitChangeset`).
  - `readChangeSet` refuses a statement of more than one target. It also refuses the editor's old form (removals, ids
    and decisions as comments), which it does not read.

#### Decisions and checks

- `proposals-judgement.ts` — what was decided, kept in the note (cs-rejected-out, decider_named).
  - There is a `Decision` for each change in the note's judgement graph. That is a block whose graph is `judgements`
    (or ends `_judgements`). It is reused when the note has one, and added after the change set when not.
  - It holds the statement, who proposed it (`proposed_by`), who decided and when, and the place the change had. Who
    decided is `decided_by`: plain text exactly as set, or "you" (`deciderName`).
  - It also writes the W3C PROV attributions (the graph spec's req:24.prov-attributed).
  - The Decision is `WAS_ATTRIBUTED_TO` the proposer: a Model for a model, a Person for a person or a step. It names
    none when the kind is not known. It is also attributed to the person who decided (a Person).
  - Each is an agent of the judgement graph, named for its kind and exact name, and written once.
  - `decidedIn` reads them back. `withDecisions` and `withoutDecisions` write and take them back.
- `proposals-record.ts` — recording a decision in the note, and taking it back.
  - The change set is written again with only the changes still waiting. After an accept, it is `against` the graph's
    new state.
  - The Decisions are written in the judgement graph.

#### Checking a proposal and its author

- `proposals-check.ts` — `checkProposal`: graph-spec's own `checkChangeset` run on the change set as the note holds it.
  - It runs against the note's other graphs, and every line of its answer is kept (proposals_checked).
  - `proposerKind` says what the note's graphs say the proposer is: a Model, a Person or a Step.
  - An accept is refused while the check fails on the change set the note holds. The "moved" line is set aside once the
    stale notice is seen.
  - `noteWithProposal` writes a proposal only if the check passes it.
  - A plain `DELETE` stays plain (refused for a thing that has links), and the kinds a MATCH names are held to.
  - Only a data block is a judgement block.
- `proposals-author.ts` — the proposer, declared by the editor in the proposal itself.
  - `withProposer` puts the declaration first among the additions when a proposal is written, unless the note declares
    it. The declaration is a Model for an AI model, or a Person that is a Step for a step.
  - It is a change on the card like the others. It is written with the first change accepted (`acceptedWith`) and
    removed with the last rejected (`rejectedWith`).
  - A model's answer can never add a Person, a Model or a Step (`ai-request.ts`). So only the editor's declaration can
    make an author known to the check. The check accepts an author the set declares itself.
- `proposals-needs.ts` — what a change needs of the others. A link needs the things it joins before it is accepted. A
  change that adds what another needs is not rejected alone.

#### Applying and reviewing

- `proposals-apply.ts` — one change written as text on the blocks' texts.
  - An addition goes after the graph's last block of data. A property is changed where it is written. A removal takes
    out the item that wrote the thing or link.
  - `notTaken`: a change read back to see it took effect.
  - `newProblems`: what a change leaves wrong that was not before.
  - It is not exported by the entry: only a review writes a change.
- `proposals-marks.ts` — which boxes and links each change adds, changes or removes. `markWord` says it in words, never
  by colour alone. Each change is read back in plain language as the text pane reads a line (`readBack`).
- `proposals-review.ts` — `ProposalReview`.
  - `show`: the proposal laid over the graph, with rows, groups, marks, provenance, and whether the graph has moved. It
    writes nothing.
  - `accept` and `reject`: a person, by name, decides one change, some, a group or all.
  - Accepted changes are written through `PaneSession`, so they are checked as any edit is, then read back. They are
    refused whole if one does not take effect or leaves a new problem.
  - A graph that has moved is refused until its notice is seen.
  - `undo`.
  - It works on the note's text and hands the new text back; the host writes it.
  - `show` also carries the graph spec's check of the change set (`checked`).
  - A decision is recorded in the note's judgement graph, and the change leaves the change set. It is decided in memory
    only when the note holds no change set.
  - `fromChangeSet(block, note)` reads a proposal with what the note says was decided of it and who the proposer is.
- `proposals-shown.ts` — the shapes a review hands a host: `ProposalShown` and its `ChangeRow`s. Also who decides
  (`Person`), which changes (`Which`) and what came of it (`Reviewed`).

### The changes view (spec §41)

- `changes-view.ts` — `changesView(before, after, graph)`: two versions of a note drawn as one graph.
  - The two may be the text as it is now and the last commit or a branch.
  - It draws every thing and link of the newer, then what the older held that the newer has not.
  - It is laid out as a plain network, so every change is in sight. Every link is still, nothing is folded or nudged,
    and no near miss is guessed.
  - Each thing and link added, removed or changed is marked (the proposals' `Marks`). It is listed as a `ChangeLine`:
    its sentence and each property changed.
  - `changesText` is the list as text, `NO_CHANGES` when the two are the same.
  - A thing is matched by its key, a link by its ends and type, the first written first.
  - `markedChanges` writes the marks into the drawn SVG in a palette's fixed colours by `CHANGE_LOOKS`. Added is a heavy
    line, changed is dashed, and removed is dotted with its text in italics. So the line tells them apart without
    colour, in either theme.
  - The host gives the older text however it reads it; nothing is written (changes_view).
- `github-review-items.ts` — pull requests, merges and commits as items to review (github_review_items).
  - `ReviewItems` works over a `ReviewSource` the host hands in. The host reads GitHub with its own sign-in; the core
    reaches no network.
  - The source is asked nothing until `list` or `review` is called. Each read is kept once it succeeds.
  - `reviewLevels` gives an item's changed files at every level, highest first (`REVIEW_LEVELS`):
    - a summary by section (a thing's `section`, named by its Section);
    - by workstream (`workstreamsFrom`, the repository's `workstreams.json`);
    - each Requirement changed;
    - each graph's changes, ready for the changes view;
    - and every line.
  - `asNote` reads a `.gql` file as the one block it is.
- `line-diff.ts` — `lineDiff`: every line kept, added or removed, by Myers' shortest edit script. Each is numbered in the
  text it is in. Past `DIFF_LIMIT` edits it gives null, so a host says it is too large rather than comparing without end.

### Open numbers (spec §41)

- `thresholds.ts` — `THRESHOLDS` (thresholds_named): every number a rule leaves open, by name.
  - Each has its default, the least and most it may be, its unit and what it governs. Each names the requirement that
    leaves it open (`busy_hub`, `path_pace`, `reread_budget`, `diff_limit`).
  - `thresholdValue` takes a value handed in only inside its range, else the default.
  - The code's own names (`BUSY_HUB`, `DEFAULT_PACE`, `REREAD_BUDGET`, `DIFF_LIMIT`) read their defaults from here.
  - A rule of a later slice adds its entry as it is built (type_suggestion_bundle, centroid_cycle_guard). So the test
    stays partial.

### Working with an AI (spec §19)

The core reaches no network. A send goes only through the transport a host hands in. It goes only once the user has
seen exactly what goes and said yes to it. Its answer comes back as a proposal (§17), never an edit.

#### The send

- `ai.ts` — the send.
  - `prepareSend` makes the exact request for what the user chose, or refuses. It refuses when AI is off, there is no
    such model, or the address cannot be used. It also refuses above the model's ceiling, at the highest
    classification, or for a text holding a credential.
  - `confirmSend` is the user's yes to exactly that request, good for one send.
  - `sendPrepared` sends it through the host's `Transport`. It puts the key from the host's secret store in its header
    only as it goes. It takes the key out of anything said before it is cut short.
  - It gives back a proposal or why there is none, with a `SendRecord` of the send either way.
  - The record never holds the text sent. It holds only its SHA-256 digest and size, and its scope (the kind of choice
    and the counts). It also holds the model's name and address, the time and the outcome.
  - The model is copied as it is prepared, so what is sent is what was shown.
  - The address and the whole message are looked over for credentials before they are put in the request.
- `ai-digest.ts` — `sha256` and `utf8Size`, written here, as the core has no host's library. A lone surrogate is taken as
  U+FFFD, as a UTF-8 encoder sends it.

#### Which AI may be asked, and with what

- `ai-choice.ts` — which AI may be asked.
  - `aiReady`: off until `aiUse` is on and a model has a name, a model and a usable address.
  - `endpointProblem`: a host is written in letters, digits, dots, hyphens, colons and brackets only, so it cannot be
    told apart from another. It has no user name, password, query string or fragment.
  - Plain http is allowed only to localhost, 127.x.x.x or [::1] exactly, read with the runtime's own URL. Any other
    goes by https.
  - `modelChoices`: the host's own AI first, where it has one; then the models set up for the purpose; then the rest.
    There are none while AI is off.
  - `AI_PURPOSES` are the spec's purposes.
- `ai-ceiling.ts` — `clearance`, and the credentials a text holds.
  - A note with no classification counts as `aiUnlabelled`, the most sensitive level until the user chooses another
    (unclassified_strictest). So by default it goes to no model.
  - The refusal says to give it a classification, or to choose a lower level under Unlabelled notes count as.
  - A note above a model's ceiling is not sent to it, saying why and naming the models cleared for it.
  - Nothing at the highest classification set goes to any model. An unknown classification counts above every ceiling.
  - `credentialsIn` names, by common patterns, the kinds of credential a text holds, never the text. The kinds are:
    - a private key, an access key, an API key, or a token;
    - a password or secret by its name, even at the end of a snake_case or camelCase one. A bare `key` is an ordinary
      word, and only a name ending in `_key` or `Key` is a secret's;
    - a card number, or the key of any model set up.

#### The destination matrix

- `ai-matrix.ts` — a model's row of the destination matrix (model_ceiling).
  - The host reads the matrix note and hands the core plain `MatrixRow`s. Each has a mark for each class: yes,
    conditional or no. So the core never reads the note's layout.
  - A model's `matrixRow` is picked by the user, never guessed from its name or address. The model may receive exactly
    the classes the row marks yes.
  - It may receive each conditional class only once its name is in the model's `matrixOn`.
  - A no is never allowed, and the highest classification never goes to any model.
  - `matchClass` matches a class to a classification by name, else through `aiClassMap`. One matched by neither is
    flagged (`unmatchedClasses`), never guessed, and never allowed.
  - `matrixGrants` lists a row's classes for the settings page, with the condition to show beside each switch.
  - `clearance` takes the matrix as its last argument. For a model with a row, it uses it in place of the ceiling; with
    no row the ceiling stands.
  - `classMapFrom` and `classMapText` keep the mapping table as text.
  - Nothing fails open:
    - a row named twice, or two columns standing for one classification, refuses (`matrixProblems` flags them);
    - a switch (`matrixOn`) keeps the condition it was turned on under. It is dropped when the note's words change or
      the cell is no longer conditional;
    - a cell not exactly ✅, ⚠️ or ❌ is `unknown` and refuses;
    - names are compared exactly, so a compatibility character never matches;
    - a table that disagrees with itself or with a name matches nothing (`classMapProblems`).
- `src/hosts/` — host-side code, kept apart from the core proper.
  - `hosts/matrix-table.ts` is reached as `@thoughtknot/core/hosts/matrix-table` (not from the entry). It is imported
    by no gate or other core module (`hosts-boundary.test.js`).
  - `matrixRows` is the one reader of the matrix note's table, for the hosts that read the note (Obsidian and the
    Claude Code mod). The gates are only ever handed its rows.
  - `matrixRowsFrom` checks rows handed over as data. It takes none at all if anything in them is not a row.
- `settings-matrix.ts` — the two options of the matrix, the note that holds it and the table of class names
  (`MATRIX_OPTIONS`).
#### Databases

- `db-import.ts` — importing from a database (spec §20, §21). The database is a SQLite file in the vault.
  - `isDbFile` says which vault files are databases: those ending .sqlite, .sqlite3 or .db.
  - `importedBlock` writes the rows as a GQL block. Each things row is a thing, by its `id` and `kind` columns. Each
    links row is a link, by `from`, `type` and `to`. Its comment names the file. It keeps no live link. A blob is left
    out.
  - A row it cannot write refuses the whole import, with the reason. `withImport` puts the block at the note's end.

#### The Claude gate

- `claude-gate.ts` — `claudeGate` (spec §26, cc_classified_asks, cc_credential_never): whether a note may open in the
  browser editor's pane, which Claude can read.
  - It gives `{ open }`.
  - It gives `{ ask }` for a note above Claude's ceiling. That is the ceiling of the AI model named Claude, else the
    lowest classification.
  - It gives `{ refuse }` for one at the highest classification, or one with a classification not among those set. It
    also refuses one with none when `aiUnlabelled` is the highest (the default), and one holding a credential at any
    classification.
  - The words name kinds and levels, never the note's label or text.
  - A third argument, the SHA-256 of a text, is the user's yes to that text alone.
  - `classificationOf` reads the one unindented top-level front matter `classification:` key. These are `unknown`,
    which refuses: several, a list, mapping, block, anchor, tag, open quote, or an empty value with child lines.
  - `noteClassification` gives the label or null.
  - The ceiling of the model named Claude is cleared by its matrix row when one is picked (the host hands the rows as
    `matrix`). Else it is cleared by its ceiling.

#### What is sent and what comes back

- `ai-scope.ts` — `aiScope`: what is sent of a note, as the user chose (the whole graph, a view, or things by name).
  - It is written out again as GQL from the graph as read. That is each thing with its kinds and properties, and the
    links between the things chosen.
  - Nothing else of the note goes: no prose, no other graph, no comment.
- `ai-request.ts` — the request body, in the chat completions shape local servers and most services take.
  - It holds the instructions that ask for changes as JSON (`INSTRUCTIONS`). They say the graph is data from the note,
    never instructions (risk AI-3).
  - `askedText` puts what was chosen in one fence named `graph-data`, the question after it. The fence is longer than
    any run of backticks in the note, so no text of the note can close it.
  - `readReply` and `changesIn` read an answer back. The whole answer is refused if one change cannot be read.
  - A model's reason is kept as plain text, each Markdown and HTML mark escaped. So it never renders as an image, a
    link or HTML where `///` notes are rendered.
- `ai-answer.ts` — `proposalFrom`: the changes made into a proposal from the model. It is against the state of the graph
  that was sent, naming the send's record. `noteWithProposal` gives the note with its change set written after the
  graph's last block, the graph untouched.

### Settings (spec §21)

- `strictness.ts` — the three departures from standard GQL the reader reads as meant. Each problem says which, in
  `Problem.departure`.
  - It says what Standard, Forgiving and Simplified make of them.
  - It converts a note back to standard GQL, checked before it is written.
  - It gives the standard text an engine or an export is given, whatever the level.
- `settings.ts` — every option with its name, sentence, choices and default (`OPTIONS`, `DEFAULT_SETTINGS`).
  - Saved settings are read back with anything unknown, out of range or secret left out (`settingsFrom`).
  - AI is off until `aiUse` is turned on.
  - `aiUnlabelled` is the level a note with no classification counts as. It is one of `classifications`, the most
    sensitive until chosen.
  - An AI model keeps the name of its key in the host's secret store (`keyName`), never the key.
  - The Export section holds the export theme (light or dark), and whether an export saved in the vault gets a
    companion note.
  - It also holds the folder exports go to. `vaultFolder`, in `vault-folder.ts`, keeps it inside the vault; empty is
    next to the note.
  - It also holds the classification above which an export asks first. That is one of `classifications`, the lowest
    until chosen.
  - The Drawing section also holds how far focus reaches from a selected thing. That is `focusDepth`: `one`, the
    default, or `two`; `depthOf` reads it.
  - It also holds the default of each View menu switch: `labelsByZoom` and `foldHubs` on, `foldGroups` and `mergeLinks`
    off (view_switch_defaults).
  - The Proposals section holds `decider`, the name recorded when you accept or reject a change. It is as typed on one
    line (decider_named).

## The shared display layer, `src/display/`

The DOM half of the viewer (editor spec §26, cc_core_only). It is shared by the Obsidian plugin and the Claude Code
browser editor's page. It holds the drawn card (`src/display/graph-view/`), the details and the forms it opens.

### How the layer is kept apart

- It is not part of the host-free entry: `index.ts` exports none of it.
- It is reached by the subpath `@thoughtknot/core/display/<module>` (`package.json` `exports`). So a host that draws
  nothing, like the Claude Code mod's hooks, never bundles it.
- It is DOM code, so it has a `tsconfig.json` of its own with the DOM library (`tsc -p packages/core/src/display`). The
  core's own type check leaves it out.
- It is bundled, never run by Node on its own, so it is not held to erasable TypeScript. `host.ts`, `host-contract.ts`,
  `panel-contract.ts`, `lifecycle.ts` and `dom-helpers.ts` are, because their tests load them directly.
- It imports no host. `test/imports.test.js` holds it to the layer, the core by its name and the graph library.
- The host's part comes in through `host.ts`.

### The modules

- `host.ts` — `DisplayHost`, what the layer asks of its host.
  - It asks for an icon, whether the screen is a phone's, a notice, and a menu.
  - It also asks for `noInlineStyle`, set where the host's content security policy forbids inline styles, as the
    browser editor's page's does. Then `graph-view/drawing-svg.ts` renames each style attribute of a drawing in its
    text before the parser sees it. It sets the same declarations through the CSSOM, which the policy allows.
  - `installHost` is called once before anything is drawn.
  - `displayHost` is for the layer's own use. It throws `NO_HOST` rather than draw a blank.
- `panel-contract.ts` — `panelContract`, the checks a plug-in's panel is held to (plugin_contract_suites, plugin_rtl).
  - It draws the panel into an element set to read right to left, in a page, as a host would.
  - The panel must keep that direction, force none but `auto`, and style with logical sides only.
- `host-contract.ts` — `hostContract`, the one contract every host's adapter is held to (editor spec §43,
  hosts_pass_contract).
  - Its checks use no test framework, each throwing with what was wanted.
  - They run against a fresh host and the `HostProbe` through which it shows what it drew.
  - `HOST_CONTRACT_VERSION` is the last entry of `HOST_CONTRACT_VERSIONS`. Each entry pairs a version with a digest
    of how `public-api.json` declares `host.ts`. A change to `DisplayHost` fails a test until a new version is added.
### Banners and waits

- `refusal-banner.ts` — why a graph is shown as text instead of drawn, in the core's words, with an icon.
- `progress.ts` — a long wait shown (§44, progress_shown). After a second it shows a bar and the seconds taken. After
  ten it offers Stop (`waitShown`). A drawing laid out and an export wait through it.
- `shortcuts-list.ts` — the list of every keyboard shortcut (`listShortcuts`), and the card's own copy that ? shows
  (`toggleShortcuts`). `graph-view/card-in-use.ts` keeps the card used last, for a host's commands (`cardInUse`).
- `tour.ts` — the short tour of a first graph, a step at a time, in the card (`showTour`). It can be skipped.
- `plugin-tokens.ts` — a plug-in's own colours on the page (§44, plugin_theme_tokens). `adoptTokens` adds them as one
  style sheet made in code, which follows the theme by itself, and gives back what takes it off.

### The edit pane and the rest

- `src/display/editor/` — the edit pane (spec §4, §9; editor spec §26, C9). It is the same one in the Obsidian pane and
  on the browser editor's page.
  - `block-editor.ts` holds `BlockEditor`, a `Lifecycle`. It is the text field over its coloured picture, the problems
    with fixes, suggestions, and the drawing beside it. It also holds Undo, Redo, Lock the graph, the picker and the
    draft banner.
  - It works over a note it asks for through one interface, `editor-note.ts` (`EditorNote`, `Refused`, `KeptDraft`).
    That is the vault in Obsidian, and the editor server's store on the page.
  - The writes are the core's session's alone, so the same edit writes the same bytes in either.
  - `lock-text.ts` is the text of Lock the graph, which both hosts take.
  - Its other modules are its parts: the layout, the typing and its waits and keys, the field's kept focus, and the
    history. They are also the text's help, picture, problems and suggestions, the picker, and the draft banner.
  - The last part is the pane's own drawing (`pane-drawing.ts`). It holds `directed`, the direction rule both hosts lay
    out by.

### Lifecycle, code and the card's folders

- `lifecycle.ts` — `Lifecycle`, what a card is owned by: load, unload, children, registered clean-ups and listeners. It
  does them as an Obsidian component does, with no host in it. The Obsidian plugin wraps one (`adopt`) where it needs
  its own kind of component.
- `code.ts` — a block that is not a graph, as coloured code with a copy button.
- `fix-changes.ts` — `withFix`: a fix's edits applied to text; no DOM.
- `src/display/graph-view/` — the drawn card: `graph-view.ts` (`GraphView`, a `Lifecycle`).
  - It also holds its bar, zoom, selection, details panel and sheet, untangle, paths, View menu, mini-map, quick info
    and the rest.
  - `view-options.ts` is what a card is given.
  - Each module's purpose is its opening comment, and the Obsidian guide describes them by feature.
- `src/display/properties/` — the inspector's property rows, type menu (through the host) and list chips.
- `src/display/proposals/` — the proposal strip and the marks on the drawing.
- `src/display/export/` — the Export form (`export-form.ts`) and the types it and the host share (`export-types.ts`).
- `src/display/links/` — the details' links and attachments, the marks on the drawing, and the host's side of links
  (`link-types.ts`).
- `src/display/images/` — an image's first frame (`still-frame.ts`) and the host's side of images (`image-source.ts`).
- `dom-helpers.ts` — `installDomHelpers(window)`: `createDiv`, `createEl`, `setText`, `empty`, `addClass`,
  `activeWindow` and the rest. They are written as Obsidian's pages are, and put on a plain browser window where
  missing. `dom-globals.d.ts` types them for the layer's own type check.

## Command-line tools, `bin/`

- `bin/layout-source-node.mjs` — writes the layout source of every graph in a set of notes, for the vault's conformance
  check. `esbuild.layout.mjs` bundles it into `dist/`.

## Tests, `test/`

Each test file is named after the module it tests (`zoom.test.js` tests `zoom.ts`; `layout-parity.test.js` tests
`layout.ts`). When it spans modules, it is listed in `CONTRIBUTING.md` instead. Run one with `node --test test/<file>`,
or all with `npm test` from the repository root.

### Work, never time

A test asserts the work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026).

- Some of what is held is work: a text never read, a block read again only within its budget, or drawing instructions
  never written. The test counts it with `test/reader-work.js`.
- Each count is paired with a control that shows the same count sees the work when it is done. A count is the same on
  every machine, under load and under coverage.
- What the core's work costs is counted in CPU instructions by the benchmarks in `scripts/benchmarks/`. They are run
  under Cachegrind on every release (`scripts/instruction-counts.mjs`), never timed in a test.
- The costs counted are 50 things drawn, the worst reads at the size limits, the refusals, and naming thousands of
  things. They also include a keystroke reaching the note, and each ratio between two sizes or two cases of the same
  work.
- `scripts/timed-assertions.mjs` finds any assertion on elapsed time, and `test/timed-assertions.test.js` fails on one.

### Reading exports back

A data export is proved by reading it back (export_lossless).

- `test/export-data-readers.js` reads a GQL block with the graph-spec reader. It reads CSV and GraphML with strict
  readers of its own, as RFC 4180 and XML read them. So an escape the writer leaves out shows.
- The Obsidian package's tests read its exports back with them too.
- They read the notes back too (`readNotes`; note_standard). A GQL block's notes are read with the library's `notes`. A
  GraphML comment's escapes are read by a strict reader of their own (`commentNote`).
- `test/notes-export.test.js` holds each format to the rule.
