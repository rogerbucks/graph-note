# P-01 Edit opens the pane

**You should see:** Edit opening a pane beside the note, showing the text of the block that was tapped. This note holds two graphs, so the pane also offers a picker to move between them.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

A second graph, so there is something to pick between.

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit on the second drawing (the trip).
2. Check the pane opens beside the note on that block's text.
3. Use the picker to switch to the first graph.

**Checklist line:**

> **P-01** Edit opens a pane beside the note, on the block that was tapped. A note with several graphs offers a picker.

**Back to the checklist:** [P-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-01 in its list.
