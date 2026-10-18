# H-07 Renames follow

**You should see:** Renaming the note Rename me in the file explorer changes the link to it inside this note's graph block at once, keeping its alias, so the box still says the same words and nothing is drawn broken. The sentence below the block is Obsidian's own to update, as for any link in a note. With this note open while renaming, Command-Z in the note takes the change back.

**Test diagram:**

```gql
// graph: renames_follow · SOURCE
(plan:Doc {name: 'Plan', see: '[[Rename me|the note to rename]]'})
```

<!-- expect: clean -->

**Do this:**

1. If there is no note named Rename me, make one: the H-06 note's Create the note makes it.
2. Keep this note open in Live Preview, and rename Rename me to Renamed in the file explorer.
3. Look at the block's text: the link reads [[Renamed|the note to rename]].
4. Click in this note and press Command-Z: the link reads Rename me again. Rename Renamed back to Rename me afterwards.

**Checklist line:**

> **H-07** Rename a note that a graph block links to, in the file explorer: the link inside the block changes to the
> new name at once, its alias kept. With the note open in Live Preview while renaming, Command-Z takes the change
> back.

**Back to the checklist:** [H-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-07 in its list.
