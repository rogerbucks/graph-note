# S-01 Style block folds

**You should see:** the style block shown as one folded line, "Style of graph reader: 2 nudges", that opens to its text. The graph runs top to bottom (the direction nudge TB), with the Large reader and the Small reader side by side (the beside nudge).

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

The style of the graph above, in its own block.

```gql
// graph: reader_style · STYLE reader
(direction:Nudge {word: 'direction', direction: 'TB'}),
(side_by_side:Nudge {word: 'beside', thing: 'large', other: 'small'})
```

<!-- expect: clean -->

**Do this:**

1. Look for the folded line under the graph and read it.
2. Open it and read the style text.
3. Look at the drawing: top to bottom, with Large reader and Small reader on one level.

**Checklist line:**

> **S-01** A note with a graph and its style block (`// graph: reader_style · STYLE reader`, with a direction nudge TB and a beside nudge). The style block shows as one folded line, "Style of graph reader: 2 nudges", opening to its text. The graph runs top to bottom with the two things side by side.

**Back to the checklist:** [S-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for S-01 in its list.
