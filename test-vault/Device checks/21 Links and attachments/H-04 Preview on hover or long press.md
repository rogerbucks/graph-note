# H-04 Preview on hover or long press

**You should see:** On the Mac, holding Command and pointing at the link to the sample note in Plan's details shows Obsidian's own page preview of that note, the same pop-up a link in a note's text gives. On the iPhone, pressing and holding the same link shows the preview instead, and lifting the finger afterwards opens nothing.

**Test diagram:**

```gql
// graph: link_preview · SOURCE
(plan:Doc {name: 'Plan', see: '[[Sample graph note]]'})
```

<!-- expect: clean -->

**Do this:**

1. Make sure the Page preview core plugin is on, in Settings › Core plugins.
2. On the Mac, tap Plan, hold Command and point at Sample graph note under Links: the preview shows.
3. On the iPhone, tap Plan, then press and hold Sample graph note: the preview shows. Lift the finger: nothing opens.

**Checklist line:**

> **H-04** On the Mac, hold Command and point at a link to a note in the details: Obsidian's own preview of the note
> shows, as for a link in a note. On the iPhone, press and hold the link: the preview shows, and lifting the finger
> opens nothing.

**Back to the checklist:** [H-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-04 in its list.
