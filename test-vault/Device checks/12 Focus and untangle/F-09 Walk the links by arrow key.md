# F-09 Walk the links by arrow key

**You should see:** With Lamp selected, each arrow key moves the selection along one of its links to the neighbouring box that lies in that direction on the screen, whichever way the link points, and takes the keyboard focus and the details with it; a direction with no neighbour does nothing. Every neighbour of a box can be reached by some arrow, so the whole graph can be walked without a pointer. A link selected, or nothing selected, does not respond to the arrows. The note is not changed by any of it.

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

1. Tap Lamp, or Tab to it and press Enter, to select it.
2. Press an arrow key and check the selection moves to a box that Lamp links to, in the direction pressed.
3. Press the arrow back the other way and check you return along the link.
4. From Lamp try all four arrows in turn and check Desk, Chair and Steel are each reached by one of them.
5. Walk from Rug to Northwood using only the arrow keys.
6. Check the note's text is exactly as it was.

**Checklist line:**

> **F-09** Select a box, then press the arrow keys: the selection moves along a link to the neighbouring box in that direction, and every neighbour can be reached by some arrow. Nothing in the note changes in any of this.

**Back to the checklist:** [F-09 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-09 in its list.
