# Z-07 No text highlight

**You should see:** double-clicking the drawing to zoom, or dragging across it, never highlighting the words of its boxes and links. The text stays unselected.

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

1. Double-click or double-tap on a box's words and on a link's words.
2. Press and drag across several boxes.
3. Check no words are highlighted, on the desktop and on the phone.

**Checklist line:**

> **Z-07** Double-clicking the drawing to zoom, or dragging across it, never highlights the words of its boxes and links.

**Back to the checklist:** [Z-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-07 in its list.
