# I-04 Page stays still

**You should see:** in Live Preview, typing in a card never moving the page. With the card's top above the view, or the note scrolled to its end, the box stays where it is on screen and the note's other text stays with it.

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

1. In Live Preview, scroll so this card's top is above the top of the view, and press Edit here.
2. Type several lines and check the box and the text around it do not jump.
3. Scroll the note to its very end and type again.

**Checklist line:**

> **I-04** Live Preview: typing in a card, with the card's top above the view or the note scrolled to its end, never moves the page: the box stays where it is on screen, and the note's other text with it.

**Back to the checklist:** [I-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-04 in its list.
