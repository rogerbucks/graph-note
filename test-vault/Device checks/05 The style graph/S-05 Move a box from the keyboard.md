# S-05 Move a box from the keyboard

**You should see:** a box moved without a mouse. M on a box picks it up: a line at the top of the drawing says "Put … (1 of …)" and the box it would go by is outlined. The arrow keys step through every place it can go; Enter writes that nudge into the style block and says "Moved: …"; Escape puts it down and writes nothing. Move… in a box's details does the same.

**Test diagram:**

```gql
// graph: team · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(ann)-[:ASKS]->(bob),
(bob)-[:ASKS]->(cy)
```

<!-- expect: clean -->

**Do this:**

1. On a desktop, press Tab until Ann's box has the focus, then press M. Read the line at the top of the drawing.
2. Press the right arrow a few times, then the left arrow, and watch the line and the outlined box change.
3. Press Enter. Read the notice, then open the note's source: a style block with the nudge has been added.
4. Tab to Bob, press M, then Escape: nothing is written.
5. Open Cy's details and press Move…, then Enter.
6. Open the note in reading view and open a box's details: there is no Move….
7. Run `scripts/reset-test-vault.mjs` afterwards, to take the nudges out again.

**Checklist line:**

> **S-05** Keyboard: Tab to a box and press M. The line at the top says "Put … (1 of …)" and the box it would go by is outlined. The arrow keys step through the places; Enter writes the nudge and says "Moved: …"; Escape writes nothing. Move… in a box's details does the same. In reading view there is no Move….

**Back to the checklist:** [S-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-05 in its list.
