# M-05 Links merged into a trunk

**You should see:** with Parallel links merged on, the three links from the Makers to the Helpers leave their boxes as short lines, meet, run together as one thick trunk across the gap, and part again to reach Cy and Dee, each still with its own label. Tapping any part of Ann's link, before or after the trunk, opens its details reading "Ann asks Cy". The second graph, whose style block says merge: 'on', starts merged.

**Test diagram:**

```gql
// graph: crew · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ann)-[:ASKS]->(cy),
(bob)-[:ASKS]->(dee),
(ann)-[:TELLS]->(dee),
(ann)-[:HELPS]->(bob)
```

```gql
// graph: crew_style · STYLE crew
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})
```

```gql
// graph: team · SOURCE
(lee:Person {name: 'Lee'}),
(max:Person {name: 'Max'}),
(ned:Person {name: 'Ned'}),
(oli:Person {name: 'Oli'}),
(lee)-[:ASKS]->(ned),
(max)-[:ASKS]->(oli)
```

```gql
// graph: team_style · STYLE team
(n1:Nudge {word: 'group', thing: 'lee', group: 'Front'}),
(n2:Nudge {word: 'group', thing: 'max', group: 'Front'}),
(n3:Nudge {word: 'group', thing: 'ned', group: 'Back'}),
(n4:Nudge {word: 'group', thing: 'oli', group: 'Back'}),
(r1:Links {merge: 'on'})
```

<!-- expect: clean -->

**Do this:**

1. On the crew graph, press View and turn Parallel links merged on. Check the three links share one thick trunk.
2. Tap Ann's link near Ann, then near Cy. Check both open the details of Ann asks Cy.
3. With VoiceOver on, move to Ann's link and check it is read as "Link: Ann asks Cy".
4. Look at the team graph: its View menu says Parallel links merged is on, and its two links share a trunk.
5. Turn the crew graph's Parallel links merged off, to leave it as it was.

**Checklist line:**

> **M-05** Turn Parallel links merged on: the links running from one group to the other share one thick trunk. Tap a link at either end: its details open, reading as before, and VoiceOver reads it as the same link. In the style block, merge: 'on' starts the graph merged.

**Back to the checklist:** [M-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-05 in its list.
