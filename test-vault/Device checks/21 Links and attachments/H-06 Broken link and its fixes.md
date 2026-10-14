# H-06 Broken link and its fixes

**You should see:** The Plan box's words hold a misspelt link to the sample note, drawn dashed in the colour Obsidian gives a link to a note that is not there. Plan's details mark it "names nothing", and the problems badge lists that it names no note or file in the vault, with the fix: create the note, or change it to the sample note. Change it to the note it meant writes the right name into the block; a link to Rename me offers Create the note, which makes that note.

**Test diagram:**

```gql
// graph: broken_links · SOURCE
(plan:Doc {name: 'Plan [[Sampel graph note]]', see: '[[Sampel graph note]]', later: '[[Rename me]]'})
```

<!-- expect: clean -->

**Do this:**

1. Look at the Plan box: its link is dashed. Open the problems badge: it lists the link with its fix.
2. Tap Plan: under Links, see is marked "names nothing", with Change it to [[Sample graph note]]. Press it: the block now reads Sample graph note there.
3. Tap Plan again: later is marked "names nothing", with Create the note Rename me. Press it: Obsidian makes the note Rename me, and the mark goes.

**Checklist line:**

> **H-06** A link to a note the vault does not hold is dashed in its box and marked "names nothing" in the details,
> and the problems badge lists that it names no note or file, with its fix. Change it to the note it most likely
> meant: the block is written with the right name. Create the note: the note is made, and the link is no longer
> broken.

**Back to the checklist:** [H-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-06 in its list.
