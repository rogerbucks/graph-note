# P-04 Suggestions while typing

**You should see:** as you start a new line in the pane, the names, kinds and relationship types already in the graph offered as suggestions. On the desktop, Tab takes the first suggestion.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit, put the cursor at the end of the last line, type a comma and a new line, then type `(eyes)-[:`.
2. Check the relationship types ANSWERS (and others in use) are suggested.
3. Type `]->(` and check the thing names are suggested.
4. On the desktop, press Tab and check it takes the first suggestion.

**Checklist line:**

> **P-04** Names, kinds and relationships already in the graph are suggested while typing. On the desktop, Tab takes the first.

**Back to the checklist:** [P-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-04 in its list.
