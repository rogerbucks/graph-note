# Z-05 Zoom limits and sharp text

**You should see:** zooming in stopping at four times natural size, and zooming out stopping where the whole drawing fits the view, or at natural size when the drawing is small enough to fit larger (in full screen, say). Resize the window, or enter or leave full screen, and zooming out stops at the new fit. At every level in between, and at both ends, the words in boxes and on links stay sharp, never blurred.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Zoom in repeatedly until it stops, and look at the words.
2. Press Zoom out repeatedly until it stops, and look at the words.
3. Stop at two or three levels between and check the text is sharp.

**Checklist line:**

> **Z-05** Zoom stops at four times natural size and, going out, where the whole drawing fits (natural size when it fits larger), and text stays sharp at every level.

**Back to the checklist:** [Z-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-05 in its list.
