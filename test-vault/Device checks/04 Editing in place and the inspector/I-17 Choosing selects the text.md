# I-17 Choosing selects the text

**You should see:** while editing, in the card or the pane, choosing a box selecting the pattern that writes it in the text, such as `(small:Option {name: 'Small reader'})`. Choosing a link selects its brackets and arrow, `-[:ANSWERS]->`.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(large:Option {name: 'Large reader'}),
(small)-[:ANSWERS]->(question),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit here.
2. Tap the Small reader box and check its pattern is selected in the text.
3. Tap the link from Small reader to the question and check its brackets and arrow are selected.
4. Repeat in the pane (Edit in pane).

**Checklist line:**

> **I-17** While editing, in the card or the pane, choosing a box selects the pattern that writes it in the text, and choosing a link selects its brackets and arrow (slice 2).

**Back to the checklist:** [I-17 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-17 in its list.
