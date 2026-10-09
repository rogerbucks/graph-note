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

- `blocks.ts` — where each gql block of a note is, and what its graph line says.
- `block-items.ts` — a block's top-level items (paths, SET, MATCH), so a bad one can be left out.
- `partial-read.ts` — reading the blocks as far as they can be read, with a problem for each part left out.
- `schema-checks.ts` — the warnings for types a schema does not declare.
- `note-reading.ts` — the types reading gives: `NoteReading`, `GraphDrawing`, `Problem`, `Block`, `Box`, `Link`.
- `drawing.ts` — `readNote`: what a note's graph blocks draw, built from the modules above.
- `estimates.ts` — near misses drawn as guesses.
- `completeness.ts` — the completeness report behind the problems badge.

**Drawing**

- `layout.ts` — the Graphviz layout source, byte-identical to the Python library's.
- `render.ts` — laying out with the bundled engine, and what a box's or link's details are.
- `theme.ts` — the drawing's colours and size, from the theme.
- `hits.ts` — what a tap lands on or near.
- `zoom.ts` — zoom, pan and full screen.

**Editing**

- `pane.ts` — the edit session: what is typed, written back to the note safely.
- `store.ts` — replacing or inserting a block in a note, keeping every other byte.
- `history.ts` — the text's own undo history.
- `help.ts` — diagnostics, fixes, completions and the read-back, in the shapes of the Language Server Protocol.
- `tokens.ts` — the gql-highlight tokenizer, for colouring.
- `commas.ts` — the comma and the colon added for you.
- `inspector.ts` — properties of a thing or link, edited as text.
- `linked-list.ts` — a property held as things linked to this one: made, added to and removed from, as text edits.
- `lock.ts` — Lock the graph: a draft's schema written out.

## Command-line tools, `bin/`

- `bin/layout-source-node.mjs` — writes the layout source of every graph in a set of notes, for the vault's
  conformance check. `esbuild.layout.mjs` bundles it into `dist/`.

## Tests, `test/`

Each test file is named after the module it tests (`zoom.test.js` tests `zoom.ts`; `layout-parity.test.js` tests
`layout.ts`), or, when it spans modules, is listed in `CONTRIBUTING.md`. Run one with `node --test test/<file>`, or all
with `npm test` from the repository root.
