# F-05 Show only a thing and its neighbours

**You should see:** Pressing Show only this and its neighbours in the details of Desk hides every box more than one link from Desk, and the links to them, leaving Desk, Oak, Lamp and Northwood and the links among them. A banner under the bar says "Showing only Desk and the things within 1 step of it." with the buttons Show the whole graph and Widen to two steps. Widening shows Chair and Steel too and the banner says 2 steps. Show the whole graph brings everything back, and the note's text is untouched.

**Test diagram:**

```gql
// graph: shop · SOURCE
(desk:Item {name: 'Desk', price: 250}),
(lamp:Item {name: 'Lamp', price: 40}),
(chair:Item {name: 'Chair', price: 120}),
(rug:Item {name: 'Rug', price: 80}),
(shed:Item {name: 'Shed', price: 900}),
(oak:Material {name: 'Oak'}),
(steel:Material {name: 'Steel'}),
(maker:Maker {name: 'Northwood'}),
(desk)-[:MADE_OF]->(oak),
(chair)-[:MADE_OF]->(oak),
(lamp)-[:MADE_OF]->(steel),
(desk)-[:NEAR]->(lamp),
(lamp)-[:NEAR]->(chair),
(chair)-[:NEAR]->(rug),
(maker)-[:MAKES]->(desk),
(maker)-[:MAKES]->(chair)
```

<!-- expect: clean -->

**Do this:**

1. Tap Desk to open its details, and press Show only this and its neighbours.
2. Check Desk, Oak, Lamp and Northwood remain and the other boxes and their links are gone.
3. Read the banner and check it names Desk and one step. With VoiceOver on, check the banner is read out.
4. Press Widen to two steps and check Chair and Steel appear and the banner says 2 steps; press Narrow to one step to go back.
5. Press Show the whole graph and check every box and link is drawn again.
6. Check the note's text is exactly as it was.

**Checklist line:**

> **F-05** Open a box's details and press Show only this and its neighbours: the other boxes and their links disappear, and a banner names the box and the steps. Widen to two steps and Narrow to one step change it; Show the whole graph brings everything back.

**Back to the checklist:** [F-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-05 in its list.
