# D-01 Park for later

**You should see:** after pressing Park it, a Deferred written into the block. When the card redraws, the Small reader box is dashed with "⏳ later" at its top right, readable in light and dark, and the badge says "No problems, 1 parked". The graph below starts with nothing parked. On a box drawn under a suggested name, Park it is refused with "accept its name first", and nothing is written.

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

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box.
2. Press Park for later. In the form, type "say what the small reader answers" for what is needed and "waiting for the trial" for why.
3. Press Park it.
4. Check a Deferred and a DEFERS link are written at the end of the block.
5. Check the box is dashed with "⏳ later" at its top right, in light and dark, and the badge says "No problems, 1 parked".
6. A box drawn under a suggested name cannot be parked until its name is written: try it on the diagram of I-19, and check Park it says "accept its name first" and the text is unchanged.

**Checklist line:**

> **D-01** Edit here on a card, tap a box, press Park for later, fill what is needed and why, press Park it: a Deferred is written into the block; when the card redraws, the box is dashed with "⏳ later" at its top right, readable in light and dark, and the badge says "No problems, 1 parked". On a box drawn under a suggested name (I-19), Park it is refused with "accept its name first", and nothing is written.

**Back to the checklist:** [D-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for D-01 in its list.
