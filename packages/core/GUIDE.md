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
- `written-things.ts` — the things written in a block, found by their parentheses: name, kinds, properties, where they are.
- `name-gaps.ts` — the things of a block that lack a name or a text, with the suggestion and a fix that writes it. No name:
  a warning, and the thing is read as if the suggested name were there, in a copy, never in the note. No text: a hint
  (severity `hint`: offered in place, never counted as a problem), unless a SET or the thing written elsewhere gives it text.
  The warning carries the name (`suggested`), and the box drawn under it carries where its ( is (`Box.suggested`), so it
  is drawn dashed and labelled as suggested, selected by `spanOf` and fixed from its details. The Python library suggests
  the same names (`graphspec/reader/name_gaps.py`); `python/graph_spec/tests/name_cases.json` holds both to one table.
- `schema-checks.ts` — the warnings for types a schema does not declare.
- `note-reading.ts` — the types reading gives: `NoteReading`, `GraphDrawing`, `Problem`, `Block`, `Box`, `Link`.
- `drawing.ts` — `readNote`: what a note's graph blocks draw, built from the modules above.
- `estimates.ts` — near misses drawn as guesses.
- `completeness.ts` — the completeness report behind the problems badge.
- `deferred.ts` — deferred things (§5, §8): `parkForLater` writes a Deferred (what, why, an optional revisit day and rule)
  as a block's last items, with the comma GQL needs and a fresh `later_<thing>` id, and refuses an empty what or why;
  `parked` says which things some Deferred defers and which are overdue (every Deferred on the thing is past its
  `revisit_by`, as `completeness.js` counts), and `parkedCount` how many of each, apart from the problems. `readNote`
  sets `Box.deferred` on each such box (it takes the day as its fifth argument, the current day by default); the layout
  source is untouched, so the host draws the dashing and the later mark on the finished drawing. `Deferred` and `DEFERS`
  are built in, so a locked graph never warns that its schema does not declare them.

**Drawing**

- `layout.ts` — the Graphviz layout source, byte-identical to the Python library's, a box drawn under a suggested name
  dashed and labelled so in both.
- `engine.ts` — starting the bundled Graphviz engine, WebAssembly: the one module that imports it, and only the entry
  imports this one, so the rest of the core runs in a host with no WebAssembly, such as a Claude Code mod.
- `render.ts` — laying out with the engine it is handed, and what a box's or link's details are.
- `layout-limits.ts` — how large a graph may be before it is shown as text (spec §9, layout_contained), each limit with
  its reason: the note's text, measured before it is read (`READ_LIMITS`, `textTooLarge`, which `readNote` applies to the
  graph blocks and shared schemas, never to a query or an excerpt); the things, links, longest word and drawing
  instructions, before any layout (`LAYOUT_LIMITS`, `tooLarge`); and the tighter ones on the page's own thread
  (`PAGE_LIMITS`). `READ_LIMITS` are the plugin's alone, a known exception to drawing as the Python reader does
  (drawn_in_part): over them the plugin reads and draws nothing, so there is nothing to compare.
- `layout-worker.ts` — the layout kept apart from the interface: both sides of the talk with a worker, through a port the
  host gives it — the worker's (`serveLayouts`: its engine started at once, and "ready" said) and the page's
  (`LayoutRunner`: one worker reused; each layout timed from "ready"; a fresh worker after one overruns, none after three
  in a row; the page's thread only when the first worker cannot start; a layout superseded before it starts dropped).
- `theme.ts` — the drawing's colours and size, from the theme.
- `hits.ts` — what a tap lands on or near.
- `zoom.ts` — zoom, pan and full screen.

**Editing**

- `pane.ts` — the edit session: what is typed, written back to the note safely.
- `store.ts` — replacing or inserting a block in a note, keeping every other byte.
- `history.ts` — the text's own undo history.
- `help.ts` — diagnostics, fixes, completions and the read-back, in the shapes of the Language Server Protocol.
- `tokens.ts` — the gql-highlight tokenizer, for colouring.
- `name-suggestions.ts` — a name from a text, in the style of the graph's names and never one of them or a reserved
  word; a text from a name; and the ASCII words and slug of a text (`nameWords`, `nameSlug`), as the graph reader's names allow.
- `name-book.ts` — a graph's names kept up to date as names are added, its style and the names taken with them, so
  naming thousands of things never freezes the page (spec §9); each name the one `nameFromText` gives.
- `commas.ts` — the comma and the colon added for you.
- `autocomplete.ts` — completing as you type: the one best inline match (a closer, keyword, kind, type, property name or
  value) and the closer stepped over; nothing is inserted unasked.
- `inspector.ts` — properties of a thing or link, edited as text.
- `linked-list.ts` — a property held as things linked to this one: made, added to and removed from, as text edits.
- `lock.ts` — Lock the graph: a draft's schema written out, indented as the settings say.

**Settings (spec §21)**

- `strictness.ts` — the three departures from standard GQL the reader reads as meant (each problem says which, in
  `Problem.departure`), what Standard, Forgiving and Simplified make of them, converting a note back to standard GQL,
  checked before it is written, and the standard text an engine or an export is given whatever the level.
- `settings.ts` — every option with its name, sentence, choices and default (`OPTIONS`, `DEFAULT_SETTINGS`), and saved
  settings read back with anything unknown, out of range or secret left out (`settingsFrom`). An AI model keeps the
  name of its key in the host's secret store (`keyName`), never the key.

## Command-line tools, `bin/`

- `bin/layout-source-node.mjs` — writes the layout source of every graph in a set of notes, for the vault's
  conformance check. `esbuild.layout.mjs` bundles it into `dist/`.

## Tests, `test/`

Each test file is named after the module it tests (`zoom.test.js` tests `zoom.ts`; `layout-parity.test.js` tests
`layout.ts`), or, when it spans modules, is listed in `CONTRIBUTING.md`. Run one with `node --test test/<file>`, or all
with `npm test` from the repository root.

A speed test times by processor time with `test/processor-time.js`, never by the clock, which runs on while a busy
machine runs something else. It holds a step to a baseline measured beside it in the same run, and to its old number of
milliseconds, now in processor time, as a backstop.
