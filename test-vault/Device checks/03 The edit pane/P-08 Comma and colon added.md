# P-08 Comma and colon added

**You should see:** typing ( to start the next pattern on a new line adding the comma at the end of the line before. Typing ] after a link type written without its colon, such as `-[favours`, adding the colon and the type as the graph spells it, `[:FAVOURS]`. One undo takes either back. Both happen in the pane, in the card's text, and in the note itself.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)
```

<!-- expect: clean -->

**Do this:**

1. In the pane, end the last line with no comma, press Enter, and type `(`. The comma should appear on the line before.
2. Press undo once and check the comma goes.
3. On a new line type `(eyes)-[favours` and then `]`. The text should become `[:FAVOURS]`. Press undo once.
4. Repeat in the card (Edit here) and in the note's own text.

**Checklist line:**

> **P-08** Typing ( to start the next pattern on a new line adds the comma to the line before; typing ] after a link type written without its colon, such as -[favours, adds the colon and the type as the graph spells it, [:FAVOURS]. One undo takes either back. Both work in the pane, in place and in the note itself.

**Back to the checklist:** [P-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-08 in its list.
