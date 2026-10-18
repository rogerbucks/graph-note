# V-02 Each step draws so far

**You should see:** three drawings of one graph, each showing the graph as built up to its own block. The first shows the question and its options, the second adds the reasons, the third adds the costs. The later drawings contain everything the earlier ones do.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

Then the reasons.

```gql
// graph: reader · SOURCE
(pages:Reason {title: 'A4 pages need a big screen'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(pages)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(small)
```

Then what each option costs.

```gql
// graph: reader · SOURCE
(large_cost:Cost {title: 'The large reader costs more'}),
(large_cost)-[:COUNTS_AGAINST]->(large)
```

<!-- expect: clean -->

**Do this:**

1. Look at the three drawings in order, in reading view.
2. Compare what each shows with the block above it.

**Checklist line:**

> **V-02** Each step of the example draws the graph as built so far.

**Back to the checklist:** [V-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-02 in its list.
