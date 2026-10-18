# M-04 Groups folded into boxes

**You should see:** with Groups folded on, Makers is one box saying "2 things" and Helpers another, with the links from Ann and Bob to Cy and Dee drawn from box to box, and Eve on her own with her link to the Helpers' box. Tapping the Makers box, or moving to it with Tab and pressing Enter, opens it: Ann and Bob are drawn again, the Helpers still folded. Finding Dee with Find a thing opens the Helpers and selects her.

**Test diagram:**

```gql
// graph: crew · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(eve:Person {name: 'Eve'}),
(ann)-[:ASKS]->(cy),
(bob)-[:ASKS]->(dee),
(ann)-[:HELPS]->(bob),
(dee)-[:TELLS]->(eve)
```

```gql
// graph: crew_style · STYLE crew
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})
```

<!-- expect: clean -->

**Do this:**

1. Press View and turn Groups folded on. Check each group is one box with its name and 2 things.
2. Tap the Makers box. Check Ann and Bob are drawn again and the Helpers box stays.
3. Turn Groups folded off and on again, then press Tab until the Makers box has the focus, and press Enter: it opens.
4. Press Find a thing and choose Dee. Check the Helpers open and Dee is selected, with her details open.
5. Turn Groups folded off, to leave it as it was.

**Checklist line:**

> **M-04** Turn Groups folded on: each group is one box with its name and how many things it holds, and the links to its things run to the box. Tap a box, or press Enter on it: that group opens and the other stays folded. Find a thing inside a folded group: its group opens and it is selected.

**Back to the checklist:** [M-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-04 in its list.
