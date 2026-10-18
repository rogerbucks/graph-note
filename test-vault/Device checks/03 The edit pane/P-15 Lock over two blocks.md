# P-15 Lock over two blocks

**You should see:** locking from the first block writing a schema that declares every kind and relationship type of both blocks, including Reason and FAVOURS, which only the second block uses. The graph then shows no problems.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

The reasons, in a second block of the same graph.

```gql
// graph: reader · SOURCE
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(small)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit on the first drawing (not the second).
2. Press Lock the graph.
3. Read the schema that is written: it should declare Question, Option, Reason, ANSWERS and FAVOURS.
4. Check the badge on both drawings says no problems.

**Checklist line:**

> **P-15** Lock a graph built over two blocks, from its first block. The schema declares every kind and relationship of both blocks, and the graph then shows no problems.

**Back to the checklist:** [P-15 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-15 in its list.
