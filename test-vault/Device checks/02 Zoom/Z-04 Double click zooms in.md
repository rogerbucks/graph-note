# Z-04 Double click zooms in

**You should see:** a double-click or double-tap on empty space zooming in at that spot. Fit then returns the whole drawing to view. A double-click on or near a box or a link does not zoom: it only chooses it, and shows its details.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Double-click (or double-tap) empty space in the drawing, away from any box.
2. Check it zooms in there, about the spot you clicked.
3. Press Fit in the bar.
4. Double-click a box, then a link. Check each is chosen, with its details, and the drawing does not zoom.

**Checklist line:**

> **Z-04** Double-clicking or double-tapping empty space zooms in there; on or near a box or a link it only chooses, and never zooms. Fit returns to the whole drawing.

**Back to the checklist:** [Z-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-04 in its list.
