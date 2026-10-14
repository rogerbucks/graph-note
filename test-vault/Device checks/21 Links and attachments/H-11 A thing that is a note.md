# H-11 A thing that is a note

**You should see:** The box The sample, whose id is a link to Sample graph note, stands for that note. Tapping it opens its details with the note itself shown inside them, rendered as Obsidian embeds a note, and a link reading Open Sample graph note beside it. Tapping Open opens the note in this tab. The Plan box, whose id is a plain name, shows no note.

**Test diagram:**

```gql
// graph: thing_is_note · SOURCE
(sample:Doc {id: '[[Sample graph note]]', name: 'The sample'}),
(plan:Doc {name: 'Plan'}),
(plan)-[:CITES]->(sample)
```

<!-- expect: clean -->

**Do this:**

1. Tap the box reading The sample: its details show the sample note rendered, with Open Sample graph note.
2. Tap Open Sample graph note: the note opens. Go back.
3. Tap Plan: its details show no note.

**Checklist line:**

> **H-11** A thing whose id is a link to a note shows that note in its details, rendered as an embed, with Open
> beside it; Open opens the note.

**Back to the checklist:** [H-11 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-11 in its list.
