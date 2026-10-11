# P-14 Lock the graph

**You should see:** a draft graph (no schema yet) offering Lock the graph. Pressing it writes the graph's schema as a new block after the graph, declaring Option, Question, Reason and the relationship types, each with its reading both ways.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit and find Lock the graph.
2. Press it.
3. Check a new block with the schema is written after this one, and the graph shows no problems.

**Checklist line:**

> **P-14** A draft graph offers Lock the graph. Locking writes its schema as a new block after the graph.

**Back to the checklist:** [P-14 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-14 in its list.
