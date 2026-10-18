# F-07 Shortest path

**You should see:** From the details of Rug, pressing Shortest path to another thing and then tapping Desk brings the shortest route forward: Rug, Chair, then one of Oak, Lamp or Northwood (the routes are equally short), then Desk, joined by their links, the rest faded, and a banner reading "The shortest path from Rug to Desk is 3 steps:" followed by those four names. Doing the same from Shed says "There is no path between Shed and Desk." and brings nothing forward. Clear the path puts the focus back. Holding Shift while tapping a second box does the same at once.

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

1. Tap Rug to open its details and press Shortest path to another thing. Read the banner asking for a second thing.
2. Tap Desk. Check the path, its links and the banner: three steps, through Chair and one of Oak, Lamp or Northwood.
3. Press Clear the path and check the focus on Rug is back.
4. Tap Shed, press Shortest path to another thing, and tap Desk. Check the banner says there is no path.
5. On a Mac, select Rug, then Shift-tap Desk, and check the path is found without the button.
6. Press Escape while the banner asks for a second thing and check the question goes.

**Checklist line:**

> **F-07** Open a box's details, press Shortest path to another thing, then tap a second box. The path stays at full strength, and the banner reads out the boxes along it. With a box that has no route to it, the banner says there is none. Clear the path puts the focus back.

**Back to the checklist:** [F-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-07 in its list.
