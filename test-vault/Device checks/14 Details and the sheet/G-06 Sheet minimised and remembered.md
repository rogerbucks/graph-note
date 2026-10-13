# G-06 Sheet minimised and remembered

**You should see:** The sheet's header holds the box's name and kind, an arrow button and an x. Pressing the arrow shrinks the sheet to that bar alone, and the drawing settles back down. Pressing it again brings the full details back; when they are long they scroll inside the sheet, which never takes more than about half the screen, so the box and some of the drawing stay in sight above it. Once minimised, every sheet opened after, in this card or another, opens minimised, until Obsidian is restarted.

**Test diagram:**

```gql
// graph: shop · SOURCE
(desk:Item {name: 'Desk', price: 250, colour: 'oak', width: 140, depth: 70, height: 75, drawers: 2}),
(lamp:Item {name: 'Lamp', price: 40}),
(chair:Item {name: 'Chair', price: 120}),
(rug:Item {name: 'Rug', price: 80}),
(oak:Material {name: 'Oak'}),
(steel:Material {name: 'Steel'}),
(desk)-[:MADE_OF]->(oak),
(chair)-[:MADE_OF]->(oak),
(lamp)-[:MADE_OF]->(steel),
(desk)-[:NEAR]->(lamp),
(desk)-[:NEAR]->(chair),
(desk)-[:NEAR]->(rug)
```

<!-- expect: clean -->

**Do this:**

1. Tap Desk. Check the sheet shows its links and properties, scrolling inside the sheet, and covers no more than about half the screen.
2. Press the arrow in the header. Check the sheet is now a bar with Desk and ITEM, and the drawing moves back down.
3. Press the x, then tap Lamp. Check its sheet opens as a bar.
4. Press the arrow again: the full details return. Tap Rug: its sheet opens in full.

**Checklist line:**

> **G-06** Press the arrow in the sheet's header: it shrinks to a bar with the box's name and kind, and the drawing
> settles; press it again and the full details return, scrolling inside the sheet, which never covers more than
> about half the screen. Minimise it, close it and tap another box, in this card or another: it opens minimised.

**Back to the checklist:** [G-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-06 in its list.
