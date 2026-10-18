# C-05 Indent and direction

**You should see:** with the indent set to Two spaces, Lock the graph on this draft writing a schema whose later lines start with two spaces. With the direction set to Top to bottom, every drawing running top to bottom. Best fit restores the earlier choice.

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
1. In Settings, ThoughtKnot, Formatting, set Indent to Two spaces.
2. Press Edit here on the draft above, then Lock the graph. In the schema block, check the lines inside each `({…})` start with two spaces.
3. Undo the lock. In Drawing, set Direction to Top to bottom and check every drawing in the note runs top to bottom.
4. Set Direction to Best fit and check the earlier choice returns.

**Checklist line:**

> **C-05** Indent "Two spaces", then Lock the graph on a draft: the schema's later lines start with two spaces. Direction "Top to bottom": every drawing runs top to bottom; "Best fit" restores the old choice.

**Back to the checklist:** [C-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-05 in its list.
