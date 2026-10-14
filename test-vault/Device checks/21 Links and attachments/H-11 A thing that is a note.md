# H-11 A thing that is a note

**You should see:** The box The sample, whose id is the global note id note:Sample graph note, stands for that note. Tapping it opens its details with the note itself shown inside them, rendered from its own text, and a link reading Open Sample graph note beside it. Tapping Open opens the note in this tab. The box Old sample, whose id is a link to the same note, does the same. The Plan box, whose id is a plain name, shows no note.

**Test diagram:**

```gql
// graph: thing_is_note · SOURCE
(sample:Doc {id: 'note:Sample graph note', name: 'The sample'}),
(old:Doc {id: '[[Sample graph note]]', name: 'Old sample'}),
(plan:Doc {name: 'Plan'}),
(plan)-[:CITES]->(sample),
(plan)-[:CITES]->(old)
```

<!-- expect: clean -->

**Do this:**

1. Tap the box reading The sample: its details show the sample note rendered, with Open Sample graph note.
2. Tap Open Sample graph note: the note opens. Go back.
3. Tap Old sample: its details show the same note, with the same Open.
4. Tap Plan: its details show no note.

**Checklist line:**

> **H-11** A thing whose id is a global note id, note: and the note's name, shows that note in its details,
> rendered, with Open beside it; Open opens the note. A thing whose id is a link to the note does the same.

**Back to the checklist:** [H-11 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-11 in its list.
