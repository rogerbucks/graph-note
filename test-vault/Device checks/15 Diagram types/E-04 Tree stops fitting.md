# E-04 Tree stops fitting

**You should see:** at first, a tree from top to bottom, Ada at the top. Once Dee is given a second manager, a banner under the bar says "This graph no longer fits a tree: along MANAGES, Dee has two parents, Bea and Cy. It is drawn as a network until another type is chosen.", the graph is drawn as a network, never as a wrong tree, and the banner offers Use flow. Pressing it changes the Diagram in the style block to flow, in place, and the drawing runs left to right.

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

The graph's type, a tree along MANAGES, in its own block.

```gql
// graph: org_style · STYLE org
(d1:Diagram {type: 'tree', relationship: 'MANAGES'})
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks: Use flow writes into the note.
1. See the tree, top to bottom.
2. Press Edit here and add a last line to the graph: `(cy)-[:MANAGES]->(dee)` (with a comma after the line before it). Press the book icon to finish.
3. Read the banner, and see the graph drawn as a network.
4. Press Use flow: the style block now says type 'flow', and the drawing runs left to right.
5. Remove the added line and set the style block back to type 'tree', relationship 'MANAGES', to leave the note as it was.

**Checklist line:**

> **E-04** On the tree, give a thing a second parent: the card says the graph no longer fits a tree and why, draws it as a network, and offers Use flow; press it, and the style block now says flow.

**Back to the checklist:** [E-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-04 in its list.
