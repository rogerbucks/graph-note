# P-06 Same block edited twice

**You should see:** after you edit the block in the note while you have typed in the pane, the pane reloading the block from the note, saying that what was typed is kept as a draft, and a Restore draft button that brings the typed text back.

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
1. Press Edit to open the pane and type a new line at the end of the block in the pane.
2. Without closing the pane, click in the block in the note and change the word 'Small' to 'Little'.
3. Check the pane reloads the block and says what you typed is kept as a draft.
4. Press Restore draft and check the typed text comes back.

**Checklist line:**

> **P-06** Editing the same block in the note while typing in the pane: the pane reloads the block. It says what was typed is kept as a draft, and Restore draft brings it back.

**Back to the checklist:** [P-06 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-06 in its list.
