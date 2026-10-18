# S-03 Drag a box to move it

**You should see:** a box dragged with the mouse follows the pointer, the box it would land by is outlined, and a line at the top of the drawing says "Put … beside …". Letting go writes a beside nudge into the style block and says "Moved: …". Escape puts the box back and writes nothing.

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

1. On a desktop, press on Ann's box and drag it to just below Cy's box. Read the line at the top of the drawing.
2. Let go. Read the notice, then open the note's source: a style block with a beside nudge has been added under the graph.
3. Drag Bob's box away from every box and read the line again, then press Escape: Bob goes back and nothing is written.
4. Click a box without moving: its details open as before.
5. Run `scripts/reset-test-vault.mjs` afterwards, to take the nudge out again.

**Checklist line:**

> **S-03** Desktop: drag a box with the mouse to just below another box. It follows the pointer, the other box is outlined, and a line at the top says "Put … beside …". Let go: a notice says "Moved: …", the style block gains a beside nudge and the two are drawn side by side. Drag again and press Escape: the box goes back and nothing is written. A short click still opens the box.

**Back to the checklist:** [S-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-03 in its list.
