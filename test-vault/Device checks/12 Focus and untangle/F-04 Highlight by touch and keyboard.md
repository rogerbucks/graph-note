# F-04 Highlight by touch and keyboard

**You should see:** Nothing depends on a pointer. On the phone, a tap that selects a box gives it the same glow and underline as pointing does, and they stay until something else is chosen or the selection is cleared. On a keyboard, pressing Tab to a box or a link gives the same highlight, and for a link the two boxes it joins; it goes when the focus moves on. A box clicked with a mouse does not keep the highlight after the pointer leaves it.

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

1. On the phone, tap Lamp. Check it has a glow and an underlined name, and that they stay when you lift your finger.
2. Tap Chair and check the highlight moves to it. Tap empty space and check it goes.
3. On a keyboard, click into the drawing, then press Tab until a box has the focus. Check it is highlighted as pointing at it would.
4. Press Tab to a link and check the link and its two boxes are highlighted.
5. Click a box with the mouse, move the pointer away, and check the box is not left highlighted.
6. Click outside the drawing, then Tab back into it, and check the box that gets the focus is highlighted.

**Checklist line:**

> **F-04** Without a pointer: on the phone, a tap that selects a box gives it the same glow and underline, and they stay until something else is chosen; on a keyboard, Tab to a box or a link gives them too.

**Back to the checklist:** [F-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-04 in its list.
