# E-02 Same look in every type

**You should see:** the same graph drawn as a network, a tree, a flow, a radial drawing, lanes, a timeline and a table, one after the other. In every one, each Person box has the same colour, the Team box its own and the Plan box its own; each link keeps its reading's colour; the words in the boxes, their kind captions and the link labels are the same sizes; and everything reads as clearly as in the network, in light and in dark. Lanes draw a thin outlined box for each kind, labelled in the caption's grey. The table's words are the theme's own text colours.

**Test diagram:**

```gql
// graph: team · SOURCE
(ada:Person {name: 'Ada', on: DATE '2026-01-01'}),
(bea:Person {name: 'Bea', on: DATE '2026-02-01'}),
(ops:Team {name: 'Ops', on: DATE '2026-03-01'}),
(plan:Plan {name: 'The plan', on: DATE '2026-04-01'}),
(ada)-[:LEADS]->(bea),
(bea)-[:JOINS]->(ops),
(ops)-[:OWNS]->(plan)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block: a type is chosen by writing it into the note.
1. Look at the network in light mode and note each box's colour.
2. Press Diagram type, then Tree; compare the colours, sizes and how clearly it reads. Do the same for Flow, Radial, Lanes, Timeline and Table.
3. Switch Obsidian to dark mode and go through the types again.
4. Delete the style block that was written, to leave the note as it was.

**Checklist line:**

> **E-02** Press each type in turn, in light and dark: every box keeps its kind's colour and every link its reading's, the words are the same sizes, and all read as clearly as in the network; a table's rows read the same way.

**Back to the checklist:** [E-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-02 in its list.
