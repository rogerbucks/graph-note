# M-07 Switches keep the selection

**You should see:** with Ann selected, each switch turned redraws the drawing at once while Ann stays selected, her details stay open, and Cy, Bob and the Toolbox stay in focus with the rest faded. The note's text never changes, in Live Preview or in reading view. In the view below, Save as shown writes a Shown into the style block with labels, hubs, groups and merge each on or off; after the note is closed and opened again, the view's View menu and drawing are as they were saved.

**Test diagram:**

```gql
// graph: kit · SOURCE
(box:Box {name: 'Toolbox'}),
(t1:Tool {name: 'Hammer'}), (t2:Tool {name: 'Saw'}), (t3:Tool {name: 'Drill'}), (t4:Tool {name: 'Level'}),
(t5:Tool {name: 'Tape'}), (t6:Tool {name: 'Chisel'}), (t7:Tool {name: 'Plane'}), (t8:Tool {name: 'File'}),
(t9:Tool {name: 'Clamp'}), (t10:Tool {name: 'Square'}), (t11:Tool {name: 'Knife'}), (t12:Tool {name: 'Pliers'}),
(t13:Tool {name: 'Wrench'}),
(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}), (dee:Person {name: 'Dee'}),
(box)-[:HOLDS]->(t1), (box)-[:HOLDS]->(t2), (box)-[:HOLDS]->(t3), (box)-[:HOLDS]->(t4), (box)-[:HOLDS]->(t5),
(box)-[:HOLDS]->(t6), (box)-[:HOLDS]->(t7), (box)-[:HOLDS]->(t8), (box)-[:HOLDS]->(t9), (box)-[:HOLDS]->(t10),
(box)-[:HOLDS]->(t11), (box)-[:HOLDS]->(t12), (box)-[:HOLDS]->(t13),
(ann)-[:ASKS]->(cy), (bob)-[:ASKS]->(dee), (ann)-[:USES]->(box), (ann)-[:HELPS]->(bob)
```

```gql
// graph: kit_style · STYLE kit
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})
```

```gql
// graph: kit · QUERY view people
MATCH (n:Person) RETURN n
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the blocks: Save as shown writes into the note, which reading view never changes.
1. On the kit graph, tap Ann. Press View and turn Parallel links merged on, then Busy hubs folded off, then on again.
2. After each, check Ann is still selected, her details are open, and Cy, Bob and the Toolbox are still in focus.
3. Switch to reading view and turn the same switches: the drawing changes and the note's text does not.
4. Back in Live Preview, on the people view, press View, turn Groups folded on, then press Save as shown. Check the style block has a Shown with the switches.
5. Close the note and open it again: the people view opens with Groups folded on and its groups folded.
6. Delete the Shown from the style block, to leave the note as it was.

**Checklist line:**

> **M-07** Select a box, then turn each switch in turn. The drawing redraws at once, the box stays selected, its details stay open and its neighbours stay in focus. Nothing in the note changes, in reading view too. In a view, Save as shown writes the switches into the style block. Close the note and open it again: the view opens with them.

**Back to the checklist:** [M-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-07 in its list.
