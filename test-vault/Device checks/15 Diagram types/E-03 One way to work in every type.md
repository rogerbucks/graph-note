# E-03 One way to work in every type

**You should see:** every type worked the same way. Tapping a box, or a row of the table, opens its details below the drawing with the box or row marked; Edit here opens the text in the card, and the details become the inspector, where a property can be changed and the drawing redraws with it; the zoom buttons, a pinch on the phone, Fit and Full screen do in every type what they do in the network.

**Test diagram:**

```gql
// graph: team · SOURCE
(ada:Person {name: 'Ada', role: 'lead', on: DATE '2026-01-01'}),
(bea:Person {name: 'Bea', role: 'maker', on: DATE '2026-02-01'}),
(ops:Team {name: 'Ops', on: DATE '2026-03-01'}),
(plan:Plan {name: 'The plan', on: DATE '2026-04-01'}),
(ada)-[:LEADS]->(bea),
(bea)-[:JOINS]->(ops),
(ops)-[:OWNS]->(plan)
```

The type the drawing starts as, in its own block: change it by Diagram type to try each in turn.

```gql
// graph: team_style · STYLE team
(d1:Diagram {type: 'table'})
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks: Edit here and Diagram type write into the note.
1. In the table, tap Bea's row: her details open below, and the row is marked. Tap a link's row: its details open.
2. Press Edit here, tap Bea's row again, and change role to "lead" in the inspector: the table shows the change. Press the book icon to finish.
3. Press Zoom in, Zoom out and Fit; pinch on the phone; open Full screen and close it.
4. Press Diagram type and choose Tree, then Flow, Radial, Lanes and Timeline, doing steps 1 to 3 on boxes each time.
5. Set the style block back to type 'table' and role back to 'maker', to leave the note as it was.

**Checklist line:**

> **E-03** In each type, the table among them: tap a box or a row for its details; Edit here, then change a property in the inspector; zoom in and out with the buttons and a pinch, Fit, and Full screen. Each works as in the network.

**Back to the checklist:** [E-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-03 in its list.
