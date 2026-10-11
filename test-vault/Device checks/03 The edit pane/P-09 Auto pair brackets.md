# P-09 Auto pair brackets

**You should see:** the same result with Obsidian's "Auto pair brackets" on and off. Typing ( at the start of a new pattern writes the comma on the line before, and typing ] after `-[favours`, or stepping over a ] that auto-pairing wrote, writes the colon and the type.

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

1. In Settings, Editor, switch "Auto pair brackets" on.
2. In this note's own text, below the last line of the block, type a new line starting with `(` and check the comma appears at the end of the line before.
3. Type `(eyes)-[favours` then `]` (or press the right arrow over an auto-paired ]) and check the colon and type are written.
4. Switch "Auto pair brackets" off and repeat.

**Checklist line:**

> **P-09** In the note itself, with Obsidian's "Auto pair brackets" on (Settings → Editor), and again with it off: the comma comes when ( is typed, and the colon when ] is typed or stepped over.

**Back to the checklist:** [P-09 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-09 in its list.
