# P-07 Undo and redo

**You should see:** Undo taking back each change the pane made to the note, and Redo putting each back, so the block returns step by step to this text and forward again.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit and make three changes in the pane, such as renaming the option, adding a reason and adding a link.
2. Press Undo three times and watch the note's block return to this text, step by step.
3. Press Redo three times and watch the changes come back.

**Checklist line:**

> **P-07** Undo and Redo take back and put back each change in the note.

**Back to the checklist:** [P-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-07 in its list.
