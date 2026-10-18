# F-02 Focus on a link and its reach

**You should see:** Tapping the link from Desk to Lamp keeps that link and the two boxes it joins, Desk and Lamp, at full strength, and fades everything else. After the setting Focus reaches is changed to Two steps, tapping Desk keeps the boxes two links away as well, such as Chair and Steel, and the links that lead to them; tapping a link is not changed by the setting. With the setting back on One step, a tap on Desk reaches only its own links again.

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

1. Tap the link from Desk to Lamp, or its label "near". Check that only that link, Desk and Lamp stay filled with the heavier outline.
2. Tap empty space to clear it.
3. Open Settings, then ThoughtKnot, and under Drawing set Focus reaches to Two steps.
4. Tap Desk. Check that Oak, Lamp, Northwood, Chair and Steel are at full strength too, and Rug and Shed are not.
5. Tap the same link again and check the setting makes no difference to it.
6. Set Focus reaches back to One step and tap Desk: only its own links and their other ends stay at full strength.

**Checklist line:**

> **F-02** Tap a link: it and the two boxes it joins stay at full strength and the rest fade. Set Settings › ThoughtKnot › Focus reaches to Two steps. Tap a box: the boxes two links away stay at full strength too.

**Back to the checklist:** [F-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for F-02 in its list.
