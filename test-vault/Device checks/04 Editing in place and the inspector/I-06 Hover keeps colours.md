# I-06 Hover keeps colours

**You should see:** on the desktop, the mouse over the box in the card, and clicking into it, never turning the box grey or hiding its coloured text, and no tooltip over it.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here on the desktop.
2. Move the mouse over the box and rest it there for a few seconds.
3. Click into the box.
4. Check the text keeps its colours, the box does not go grey, and no tooltip appears.

**Checklist line:**

> **I-06** Desktop: hovering the mouse over the box in the card, and clicking into it, never turns it grey or hides its coloured text, and no tooltip appears over it.

**Back to the checklist:** [I-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-06 in its list.
