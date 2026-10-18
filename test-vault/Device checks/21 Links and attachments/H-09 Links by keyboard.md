# H-09 Links by keyboard

**You should see:** With only the keyboard on the Mac, the drawing takes the focus, Tab reaches the Plan box and Return opens its details. Pressing Tab again moves through the details, reaching each link under Links in turn, each with a visible focus ring, and Return on the one reached opens it exactly as a click would.

**Test diagram:**

```gql
// graph: links_keyboard · SOURCE
(plan:Doc {name: 'Plan', see: '[[Sample graph note]] and [[Long note]]'})
```

<!-- expect: clean -->

**Do this:**

1. On the Mac, click just above this note's drawing, then press Tab until the Plan box has the focus, and press Return.
2. Press Tab: the focus moves through the details and reaches Sample graph note, then Long note.
3. Press Return on Long note: it opens.

**Checklist line:**

> **H-09** On the Mac, open a box's details from the keyboard and press Tab: each link is reached in turn. Return opens the one reached.

**Back to the checklist:** [H-09 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-09 in its list.
