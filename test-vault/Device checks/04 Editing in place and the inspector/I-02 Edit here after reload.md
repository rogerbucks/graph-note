# I-02 Edit here after reload

**You should see:** straight after the app starts or reloads, and on a card far down a long note scrolled to only then, Edit here opening the editor in that card. Done closes it with what was typed kept in the note. Edit here never does nothing without saying why.

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

1. Put this block far down a long note: the vault's Long note has room, or add many blank lines above this block.
2. Reload the app (the command palette's Reload app without saving), open the note and scroll straight to this block.
3. Press Edit here at once and check the editor opens in the card. Type a word and press Done.
4. Check what you typed is in the note. If Edit here did nothing, it must have said why.

**Checklist line:**

> **I-02** Straight after the app starts or reloads, and on a card far down a long note scrolled to only then: Edit here opens the editor in that card, and Done closes it with what was typed in the note. Edit here never does nothing without saying why.

**Back to the checklist:** [I-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-02 in its list.
