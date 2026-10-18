# V-04 Empty block prompt

**You should see:** a graph drawn from the first block, and for the empty block under it a prompt to start with a thing, with an Edit button. The empty block is not blank, and it is not drawn as a graph.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(question)
```

An empty graph.

```gql
// graph: fresh
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Look at the block under "An empty graph".
2. Read the prompt and press Edit.

**Checklist line:**

> **V-04** The empty block shows a prompt to start with a thing, and an Edit button.

**Back to the checklist:** [V-04 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-04 in its list.
