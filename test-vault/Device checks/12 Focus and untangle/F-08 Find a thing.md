# F-08 Find a thing

**You should see:** Pressing Find a thing in the bar opens a search box. Typing "lamp", or "40", which is the price of the Lamp, lists the matches by name first and then by property, each with its kind, and a line below the box says how many were found. Choosing one selects it, opens its details and, when the drawing is zoomed in, scrolls it into view. Pressing Escape in the box closes it and puts the focus back on the Find a thing button. A word nothing matches says "No thing matches."

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

1. Zoom in until Shed is out of sight, then press Find a thing.
2. Type "shed" and check the match is listed with its kind and the line below says 1 thing found.
3. Choose it. Check its details open and the drawing moves so Shed is in view.
4. Type "40" and check Lamp is listed with "price: 40".
5. Type "zzzz" and check the line says "No thing matches."
6. Press Enter with a match listed and check the first is chosen; press Escape and check the box closes with the focus on its button.

**Checklist line:**

> **F-08** Zoom in far, press Find a thing and type part of a name or of a property's value: the matches are listed with their kind. Choose one: its details open and it is brought into view. Escape closes the search and returns to its button.

**Back to the checklist:** [F-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-08 in its list.
