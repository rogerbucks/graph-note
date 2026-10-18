# S-04 Hold a box to move it

**You should see:** on a phone, a finger held on a box for a moment lifts it (a shadow) and opens its tooltip; dragging it then moves it, without the page scrolling, and letting go writes a beside nudge. A swipe begun at once still scrolls the note.

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

1. On the phone, hold a finger on Ann's box until it lifts and its tooltip opens.
2. Without lifting, drag it to just below Cy's box. The page stays still; read the line at the top of the drawing.
3. Let go, and read the notice. Open the note's source: a style block with a beside nudge has been added.
4. Swipe up across Bob's box straight away: the note scrolls, and nothing moves.
5. Hold Bob's box and lift without moving: its tooltip stays, and no details open.
6. Run `scripts/reset-test-vault.mjs` afterwards, to take the nudge out again.

**Checklist line:**

> **S-04** Phone: hold a finger on a box for a moment. It lifts (a shadow) and its tooltip opens. Drag it to just below another box: the page does not scroll, the line says "Put … beside …", and letting go writes the nudge. A swipe begun at once still scrolls the note, and a hold lifted without moving opens no details.

**Back to the checklist:** [S-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-04 in its list.
