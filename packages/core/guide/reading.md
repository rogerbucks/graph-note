# Reading a note

Purpose: the modules that read a note's graph blocks, find its problems, name things, hold notes and deferred things, and build the drawing (`readNote`). Part of the [core guide](../GUIDE.md).

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
- `note-lines.ts` — the `///` note lines and `//@` tag lines a thing or link owns, as the reader reads them (`NOTE`, `TAG`,
  `ownedAbove`, `runStart`): the one definition, used by `notes.ts` and by every edit that takes an item out.
- `note-edit.ts` — `setNote` (note_add): a thing's or link's note added, changed or removed as text, the `///` lines above
  it, refused unless the reader reads back the note written on that thing alone. Every edit that takes an item out
  (`withoutItem`, so proposals' removals and lists, and `removal` for a path's step) takes the note and tags above it too,
  so no other thing takes them up; every other edit leaves them where they are (note_kept_by_edits,
  `test/notes-edits.test.js` sweeps the entry points).
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
