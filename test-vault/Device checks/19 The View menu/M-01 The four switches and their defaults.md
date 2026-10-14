# M-01 The four switches and their defaults

**You should see:** a View button on the drawing's bar. Pressing it opens a row of four switches under the bar: Labels by zoom — on, Busy hubs folded — on, Groups folded — off and Parallel links merged — off. VoiceOver reads each as a switch, on or off. After Groups folded is set to On in the settings and the note is opened again, the two groups are drawn folded, each as one box saying how many things it holds, and its switch says on.

**Test diagram:**

```gql
// graph: studio · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ann)-[:ASKS]->(cy),
(bob)-[:ASKS]->(dee),
(ann)-[:HELPS]->(bob)
```

```gql
// graph: studio_style · STYLE studio
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})
```

<!-- expect: clean -->

**Do this:**

1. Press View on the drawing's bar and read the four switches and whether each is on or off.
2. With VoiceOver on, move through the switches and check each is read as a switch with its state.
3. Open Settings › Graph Note and, under Drawing, set Groups folded to On.
4. Close this note and open it again. Check the groups are drawn folded and the View menu's Groups folded says on.
5. Set Groups folded back to Off in the settings, to leave them as they were.

**Checklist line:**

> **M-01** Press View on a graph's bar: four switches, Labels by zoom, Busy hubs folded, Groups folded and Parallel links merged, each saying on or off; labels and hubs are on, groups and merging off. In Settings › Graph Note, change a switch's default under Drawing, then open the note again: its graphs start as the settings now say.

**Back to the checklist:** [M-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-01 in its list.
