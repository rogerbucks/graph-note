# The test vault

Each build is tried here, in Obsidian on the Mac, before it is promoted: open this folder as a vault. The notes are
dummies, written to exercise the editor, and hold nothing else.

**Start and end every session clean:** `node scripts/test-vault.mjs fresh` restores the notes and settings to what is
committed, removes everything a session added, and links the plugin build (`main.js`, `manifest.json`, `styles.css` at
the repository root) into `.obsidian/plugins/graph-note/`. Run `npm run build` first. What is typed here is never
committed: only the notes at this folder's root, `.obsidian/app.json` and `.obsidian/community-plugins.json` are.

## The notes, and what each exercises

- `Sample graph note.md` — the graph guide's example: a graph built over two blocks, a link with a misspelt name, a query block and an empty graph block. Requirements: drawn_where_written, drawing_bar, draws_despite_problems, tap_for_details, tap_link_for_details, estimate_near_name, estimate_explains, empty_block_start, reading_view_read_only, edit_in_place, inspector, inspector_native, tap_cycles_near, select_moves_text.
- `Long note.md` — a note long enough to scroll, with a graph built over two blocks far apart. Requirements: page_stays_still, typing_keeps_focus, note_still_scrolls, bar_and_details_belong, comma_added_for_you, colon_added_for_you.
