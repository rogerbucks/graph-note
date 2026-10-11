# V-01 Every graph is drawn

**You should see:** both graph blocks below drawn as pictures, never as text, in reading view and in Live Preview with the cursor outside the blocks. The first has two options answering one question; the second a short walk between three places. Neither shows a problem.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

A second graph, so a note holds more than one.

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake)
```

<!-- expect: clean -->

**Do this:**

1. Open this note in reading view and look at both blocks.
2. Switch to Live Preview and put the cursor in the text above the blocks, then below them.
3. Move the cursor into a block and out again.

**Checklist line:**

> **V-01** Every graph block is drawn in reading view, and in Live Preview with the cursor outside the block.

**Back to the checklist:** [V-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-01 in its list.
