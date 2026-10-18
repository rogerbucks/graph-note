# F-06 Legend brings forward and hides

**You should see:** Pressing Filter by kind or link in the bar opens a row of buttons, one for each kind and each relationship type in the drawing, with how many of each: Item · 5, Maker · 1, Material · 2, then made of · 3, makes · 2 and near · 3. Choosing Material brings Oak and Steel forward and fades the rest, and its button says "in front". Choosing it again hides Oak and Steel and the links to them, strikes the button through and says "hidden". Once more puts them back. Nothing is saved in the note.

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

1. Press Filter by kind or link and read the buttons and their counts.
2. Choose Material. Check Oak and Steel stay filled and the other boxes fade, and the button says "in front".
3. Choose Material again. Check Oak and Steel and the links to them are gone, and the button is struck through and says "hidden".
4. Choose it once more and check everything is back.
5. Choose the relationship type near: its links and the boxes they join come forward. Choose it again and its links are hidden.
6. With VoiceOver on, check each button is read with its state, and close the drawing and open the note again to check the choices were not kept.

**Checklist line:**

> **F-06** Press Filter by kind or link: each kind and relationship type is a button with its count. Choose one: it comes forward, the rest fade, and the button says "in front". Choose it again: it is hidden, struck through, and says "hidden". Once more: it is back.

**Back to the checklist:** [F-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-06 in its list.
