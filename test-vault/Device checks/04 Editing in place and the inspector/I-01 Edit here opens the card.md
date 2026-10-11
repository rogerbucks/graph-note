# I-01 Edit here opens the card

**You should see:** Edit here opening the block's text inside the drawing's own card, and every change you type redrawing the drawing at once, with the caret staying where it was.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit here on the drawing.
2. Type a new option, for example change 'Small reader' to 'Pocket reader'.
3. Watch the drawing redraw as you type, and check the caret has not moved.

**Checklist line:**

> **I-01** Edit here opens the text inside the drawing's card, and typing there redraws the drawing without losing the place.

**Back to the checklist:** [I-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-01 in its list.
