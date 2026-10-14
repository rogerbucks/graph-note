# M-03 Busy hub folded into a stub

**You should see:** the Toolbox drawn with one dashed stub beside it saying "14 links", and none of the thirteen tools; Ann is still drawn, with her link to Cy. Tapping the stub brings the tools and their links back at once. In the Toolbox's details, Fold its 14 links folds them into the stub again, and Open its 14 links opens them.

**Test diagram:**

```gql
// graph: kit · SOURCE
(box:Box {name: 'Toolbox'}),
(t1:Tool {name: 'Hammer'}), (t2:Tool {name: 'Saw'}), (t3:Tool {name: 'Drill'}), (t4:Tool {name: 'Level'}),
(t5:Tool {name: 'Tape'}), (t6:Tool {name: 'Chisel'}), (t7:Tool {name: 'Plane'}), (t8:Tool {name: 'File'}),
(t9:Tool {name: 'Clamp'}), (t10:Tool {name: 'Square'}), (t11:Tool {name: 'Knife'}), (t12:Tool {name: 'Pliers'}),
(t13:Tool {name: 'Wrench'}),
(ann:Person {name: 'Ann'}), (cy:Person {name: 'Cy'}),
(box)-[:HOLDS]->(t1), (box)-[:HOLDS]->(t2), (box)-[:HOLDS]->(t3), (box)-[:HOLDS]->(t4), (box)-[:HOLDS]->(t5),
(box)-[:HOLDS]->(t6), (box)-[:HOLDS]->(t7), (box)-[:HOLDS]->(t8), (box)-[:HOLDS]->(t9), (box)-[:HOLDS]->(t10),
(box)-[:HOLDS]->(t11), (box)-[:HOLDS]->(t12), (box)-[:HOLDS]->(t13),
(ann)-[:USES]->(box), (ann)-[:ASKS]->(cy)
```

<!-- expect: clean -->

**Do this:**

1. Look at the drawing: the Toolbox, its dashed stub saying 14 links, Ann and Cy, and no tools.
2. Tap the stub. Check the thirteen tools and their links are drawn at once.
3. Tap the Toolbox and press Fold its 14 links in its details. Check the stub is back and the tools are gone.
4. Press Open its 14 links. Check the tools are back.
5. With VoiceOver on, move to the stub and check it is read as a button that opens the Toolbox's 14 links.

**Checklist line:**

> **M-03** A thing with 13 links or more is drawn with its links folded into one dashed stub saying how many. Tap the stub: the links and the things on them come back, the drawing redrawn at once. Tap the thing and press Fold its 14 links in its details: they fold again; Open its 14 links opens them.

**Back to the checklist:** [M-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-03 in its list.
