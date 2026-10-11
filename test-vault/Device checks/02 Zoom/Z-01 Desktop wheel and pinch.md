# Z-01 Desktop wheel and pinch

**You should see:** the mouse wheel alone scrolling the note, not the drawing. With Ctrl or Command held, the wheel zooms the drawing about the pointer, and a trackpad pinch does the same.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(pages:Reason {title: 'A4 pages need a screen of about 10 inches or more'}),
(eyes:Reason {title: 'E-ink is easier on the eyes over long sessions'}),
(free:Reason {title: 'The tablet costs nothing extra'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question),
(pages)-[:FAVOURS]->(large),
(pages)-[:COUNTS_AGAINST]->(small),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(small),
(free)-[:FAVOURS]->(tablet)
```

<!-- expect: clean -->

**Do this:**

1. With the pointer over the drawing, turn the mouse wheel alone and watch the note scroll.
2. Hold Ctrl or Command and turn the wheel over a box, and watch the drawing zoom about the pointer.
3. On a trackpad, pinch over a box.

**Checklist line:**

> **Z-01** Desktop: the mouse wheel alone scrolls the note. With Ctrl or Command it zooms about the pointer, and so does a trackpad pinch.

**Back to the checklist:** [Z-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-01 in its list.
