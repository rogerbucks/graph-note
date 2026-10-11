# Z-06 Full screen

**You should see:** Full screen covering the whole window, and on a phone staying inside the notch and the home bar. Escape or Close leaves it. While it is on, the mouse wheel alone zooms the drawing rather than scrolling the note, about a third for each notch: a little quicker than before, as a trackpad pinch is.

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

1. Press Full screen in the bar.
2. On a phone, check no part of the drawing or the Close button sits under the notch or the home bar.
3. Turn the mouse wheel alone and check the drawing zooms.
4. Press Escape (or Close) and check it leaves.

**Checklist line:**

> **Z-06** Full screen covers the window, inside the phone's notch and home bar. Escape or Close leaves it. In full screen the wheel alone zooms.

**Back to the checklist:** [Z-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-06 in its list.
