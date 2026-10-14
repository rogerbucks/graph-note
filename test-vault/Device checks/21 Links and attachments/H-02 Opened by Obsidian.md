# H-02 Opened by Obsidian

**You should see:** Tapping the link to the sample note in the Plan box's details opens Sample graph note in the same tab, exactly as tapping a link in a note's text does. On the Mac, Command-click on the same link leaves this note where it is and opens the sample note in a new tab beside it, as Obsidian does for any link.

**Test diagram:**

```gql
// graph: host_opens · SOURCE
(plan:Doc {name: 'Plan', see: '[[Sample graph note]]'})
```

<!-- expect: clean -->

**Do this:**

1. Tap Plan, then tap Sample graph note under Links: the note opens in this tab.
2. Go back to this note.
3. On the Mac, tap Plan again and Command-click Sample graph note: it opens in a new tab, and this one stays.

**Checklist line:**

> **H-02** Tap a link to a note in the details: Obsidian opens the note in the same tab. On the Mac, Command-click it:
> it opens in a new tab, as a link in a note does.

**Back to the checklist:** [H-02 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-02 in its list.
