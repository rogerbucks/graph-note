# Editing

Purpose: the edit session and what it writes back safely (undo, following a block, name checks), plus adding things, completing, the inspector, lists and Lock. Part of the [core guide](../GUIDE.md).

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
