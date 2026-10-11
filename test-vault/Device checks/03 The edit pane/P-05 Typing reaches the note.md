# P-05 Typing reaches the note

**You should see:** what you type in the pane written into this note within about a third of a second, and the drawing in the note redrawing to follow it.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit and, in the pane, change the name 'Large reader' to 'Large e-ink reader'.
2. Watch the block in the note: its text should change within about a third of a second, and its drawing follow.

**Checklist line:**

> **P-05** What is typed reaches the note within about a third of a second, and the drawing follows.

**Back to the checklist:** [P-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-05 in its list.
