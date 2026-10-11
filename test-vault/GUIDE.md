# The test vault

Each build is tried here, in Obsidian on the Mac, before it is promoted: open this folder as a vault. The notes are
dummies, written to exercise the editor, and hold nothing else.

**Start and end every session clean:** `node scripts/reset-test-vault.mjs` restores the notes and settings to what is
committed, removes everything a session added, and links the plugin build (`main.js`, `manifest.json`, `styles.css` at
the repository root) into `.obsidian/plugins/graph-note/`. Run `npm run build` first. What is typed here is never
committed: only the notes at this folder's root, the notes in `Device checks/` (below), `.obsidian/app.json` and
`.obsidian/community-plugins.json` are.

## The notes, and what each exercises

- `Sample graph note.md` — the graph guide's example: a graph built over two blocks, a link with a misspelt name, a query block and an empty graph block. Requirements: drawn_where_written, drawing_bar, draws_despite_problems, tap_for_details, tap_link_for_details, estimate_near_name, estimate_explains, empty_block_start, reading_view_read_only, edit_in_place, inspector, inspector_native, tap_cycles_near, select_moves_text.
- `Long note.md` — a note long enough to scroll, with a graph built over two blocks far apart. Requirements: page_stays_still, typing_keeps_focus, note_still_scrolls, bar_and_details_belong, comma_added_for_you, colon_added_for_you.

## The device checks

`Device checks/` holds one note for each item of the device checklist (`packages/obsidian/test/device-checklist.md`)
after Before, so each check can be tried on a graph made for it. Open the folder's index, Device checks, which lists
them all in order. They sit in one folder for each section of the checklist, in its order (`01 Viewing`, `02 Zoom`...), and
each is named by the item's number and a short title (`V-03 Query block as code`). A number is the checklist's own and
never changes. Each note opens with its number, then **You should see**, the **Test diagram** (the graph blocks to try it
on), **Do this**, the checklist line word for word and a link back to the checklist on GitHub, where the number is found
in the list. A line `<!-- expect: … -->` after the diagram says what the blocks read as (clean, or the problem they
give), and `test/device-check-notes.test.js` holds each to it with the repository's own reader and checker, and the notes
to the checklist, so a changed item fails there until its note follows. The notes carry no front matter and are Public;
a check that needs a classification (the export check, X-04) says to add one by hand and not to commit it.
