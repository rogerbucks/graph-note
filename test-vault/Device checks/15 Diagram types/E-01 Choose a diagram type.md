# E-01 Choose a diagram type

**You should see:** a line under the drawing's bar saying "Drawn as a network", and a Diagram type button beside it. Pressing it lists Network, Tree, Flow, Radial, Lanes, Timeline and Table. Lanes and Timeline are greyed, each with why beside it (every thing here is a Person; no thing carries a date). Tree says "suggested: each thing has at most one parent along MANAGES". Pressing Tree writes a Diagram into a new style block below the graph, never into the graph itself, and the drawing redraws from top to bottom, Ada at the top.

**Test diagram:**

```gql
// graph: org · SOURCE
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy),
(bea)-[:MANAGES]->(dee)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block: the type is written into the note, which reading view never changes.
1. Read the line under the bar: "Drawn as a network".
2. Press Diagram type and read the list: which can be pressed, which are greyed and why, and which is suggested.
3. Press Tree. Watch the style block appear below the graph with a Diagram in it, and the drawing redraw top to bottom.
4. Delete the new style block, to leave the note as it was.

**Checklist line:**

> **E-01** Diagram type on a card lists Network, Tree, Flow, Radial, Lanes, Timeline and Table. Each that fits can be pressed, and each that does not is greyed with why beside it. One says "suggested". The card says "Drawn as a network" until a type is pressed.
>
> - Press Tree: a Diagram is written into the style block, never the data. The card redraws top to bottom.

**Back to the checklist:** [E-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-01 in its list.
