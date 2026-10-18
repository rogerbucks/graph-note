# F-03 Hover highlight with a pointer

**You should see:** On a Mac, pointing at a box gives it a glow round its outline and underlines its words; pointing at a link gives the link and the two boxes it joins the same. With Desk selected, pointing at a faded box brings it forward from the fade for as long as the pointer stays, and it fades again when the pointer leaves, with the focus on Desk unchanged. Nothing in the drawing shifts, grows or is laid out again while this happens.

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

1. With nothing selected, point at Rug. Check for a glow round it and an underline on its words, and for nothing else.
2. Move the pointer away and check both go.
3. Point at the link from Chair to Rug. Check the link, Chair and Rug are highlighted.
4. Tap Desk, then point at Shed, which is faded. Check Shed comes forward, and fades again when you move off.
5. Throughout, check that no box or link moves or changes size.
6. Try it in the other theme.

**Checklist line:**

> **F-03** Mac, pointer: point at a box, and it gets a glow round its outline and its words are underlined. Point at a link, and the link and its two boxes do. Point at a faded box while one thing is selected, and it comes forward until the pointer leaves. Nothing in the drawing shifts or changes size.

**Back to the checklist:** [F-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-03 in its list.
