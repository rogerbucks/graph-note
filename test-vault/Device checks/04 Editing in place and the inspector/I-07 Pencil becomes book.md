# I-07 Pencil becomes book

**You should see:** while the card is being edited, its pencil shown as a book (view) icon. Pressing the book writes what was typed and closes the box, as Done does, and the pencil comes back.

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
1. Press Edit here and look at the icon in the card's corner: it should be a book.
2. Type a word into the text, then press the book.
3. Check what you typed is in the note, the box is closed, and the pencil is back.

**Checklist line:**

> **I-07** While the card is being edited, its pencil shows as a book (view) icon. Pressing it writes what was typed and closes the box, as Done does, and the pencil comes back.

**Back to the checklist:** [I-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-07 in its list.
