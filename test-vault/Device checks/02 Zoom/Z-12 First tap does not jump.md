# Z-12 First tap does not jump

**You should see:** the first tap on a card's bar doing what it says, and the page staying where it is. Before, the first tap on Zoom in after opening a note in Live Preview jumped the page to the top, as the editor took the tap.

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

1. On the phone, open this note in Live Preview, without tapping the text, and scroll so the drawing is near the bottom of the screen.
2. Tap Zoom in once. The drawing zooms, and the page does not move.
3. Close the note, open it again the same way, and tap Find a thing. Its box opens, and the page does not jump to the top.

**Checklist line:**

> **Z-12** Phone, Live Preview, the note just opened and scrolled down: the first tap on Zoom in zooms. The page does not jump to the top. Nor does it jump on the first tap on Find, which opens its box.

**Back to the checklist:** [Z-12 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-12 in its list.
