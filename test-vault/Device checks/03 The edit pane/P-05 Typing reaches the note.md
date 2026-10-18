# P-05 Typing reaches the note

**You should see:** what you type in the pane written into this note within about a third of a second, and the drawing in the note redrawing to follow it. Renamed or moved while you type, the note still gets what you type next. Deleted while you type, what you typed is kept as a draft, and the pane says so; the command Recover kept drafts into a new note gets it back.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit and, in the pane, change the name 'Large reader' to 'Large e-ink reader'.
2. Watch the block in the note: its text should change within about a third of a second, and its drawing follow.
3. Make a copy of this note (the file explorer's Make a copy) and do the rest on the copy, so this note stays. Press Edit on the copy's drawing, rename the copy (its title, or the file explorer), then type in the pane: check the renamed note gets what you typed, and no note comes back under the old name.
4. Type a word in the pane, and straight away delete the copy. Check the pane says the note was deleted and what you typed is kept as a draft. Type a little more, and check nothing new appears in the vault.
5. Run Recover kept drafts into a new note from the command palette. Check a note named Kept drafts appears at the vault's top level, holding what you typed, as plain text, under the copy's name.

**Checklist line:**

> **P-05** What is typed reaches the note within about a third of a second, and the drawing follows. Renaming or moving the note while typing changes nothing: what is typed next still reaches it. Deleting the note while typing keeps what was typed as a draft, and the pane says so; the command Recover kept drafts into a new note writes it into a note.

**Back to the checklist:** [P-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-05 in its list.
