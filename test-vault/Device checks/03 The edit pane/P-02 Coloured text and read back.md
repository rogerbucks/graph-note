# P-02 Coloured text and read back

**You should see:** in the pane, the block's text coloured as the gql-highlight plugin colours it (kinds, link types, strings and keywords each in their own colour), and beside each line a plain-English reading of it, such as "Large reader answers Which device should I read on?".

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

1. Press Edit to open the pane.
2. Compare the colours with those in a plain code block in gql-highlight.
3. Read the sentence beside each line.

**Checklist line:**

> **P-02** The text is coloured as gql-highlight colours it, and each line is read back in plain English beside it.

**Back to the checklist:** [P-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-02 in its list.
