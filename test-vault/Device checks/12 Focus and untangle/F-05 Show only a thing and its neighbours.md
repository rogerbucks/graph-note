# F-05 Show only a thing and its neighbours

**You should see:** Pressing Show only this and its neighbours in the details of Desk hides every box more than one link from Desk, and the links to them, leaving Desk, Oak, Lamp and Northwood and the links among them. Those left glide together and fill the card, which keeps its height, and the button now says Show the whole graph. A banner under the bar says "Showing only Desk and the things within 1 step of it." with the buttons Show the whole graph and Widen to 2 steps. Under the button, a − and + with "1 step out" change the steps too, up to 3. Widening shows Chair and Steel too and the banner says 2 steps. Pressing the button again brings everything back as it was drawn, at the zoom it had, and the note's text is untouched.

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

1. Zoom in a little. Tap Desk to open its details, and press Show only this and its neighbours.
2. Check Desk, Oak, Lamp and Northwood remain, drawn close together, and the other boxes and their links are gone.
3. Read the banner and check it names Desk and one step. With VoiceOver on, check the banner is read out.
4. Press + under the button and check Chair and Steel appear and the banner says 2 steps; press − to go back.
5. Press Show the whole graph in the details and check every box and link is drawn again where it was, at the zoom you had.
6. Check the note's text is exactly as it was.

**Checklist line:**

> **F-05** Zoom in, open a box's details and press Show only this and its neighbours. The rest disappears, and those left glide together. A banner names the box and the steps; the button says Show the whole graph. The − and + under it change the steps, up to 3. Press the button again: all comes back as drawn, at your zoom.

**Back to the checklist:** [F-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-05 in its list.
