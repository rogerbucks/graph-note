# F-01 Focus on a thing

**You should see:** Tapping Desk keeps Desk, its links and the boxes at their other ends (Oak, Lamp and Northwood) filled and outlined heavier, with every other box left as an empty outline and its words still easy to read in both themes. Nothing moves, shrinks or disappears. Tapping empty space, or pressing Escape, puts everything back as it was and closes the details. The same on the desktop and the phone.

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

1. Tap Desk. Check that Desk, Oak, Lamp and Northwood, and the links between Desk and them, are filled with a heavier outline, and that the other boxes are empty outlines.
2. Read the words in an empty outline and check they are as easy to read as before.
3. Check that no box has moved or changed size.
4. Tap Shed, which has no links: only Shed stays at full strength.
5. Tap empty space and check everything is back as it was and the details have closed.
6. Tap Desk again and press Escape on a keyboard: the same.
7. Repeat on the phone and in the other theme.

**Checklist line:**

> **F-01** Tap a box: it, its links and the boxes at their other ends stay filled, with the heavier outline; every other box becomes an empty outline and its words stay as easy to read; nothing moves or disappears. Tap empty space, or press Escape: everything is back as it was. Desktop and phone, light and dark.

**Back to the checklist:** [F-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-01 in its list.
