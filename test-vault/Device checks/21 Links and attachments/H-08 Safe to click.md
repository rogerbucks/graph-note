# H-08 Safe to click

**You should see:** Tapping the web address in Plan's details opens a dialog, Leave Obsidian?, saying plainly that the link leaves Obsidian and opens that address in your web browser. Cancel closes it and opens nothing; Open hands the address to the browser. The javascript link written in the same box is shown as plain, muted text saying it is not opened, never as a link, and tapping it does nothing at all.

**Test diagram:**

```gql
// graph: safe_to_click · SOURCE
(plan:Doc {name: 'Plan', web: 'https://example.com/rooms', bad: '[run](javascript:alert(1))'})
```

<!-- expect: clean -->

**Do this:**

1. Turn aeroplane mode off for this check, and on again after it.
2. Tap Plan, then tap https://example.com/rooms under Links: the dialog says the link leaves Obsidian and what it opens.
3. Press Cancel: nothing opens. Tap the address again and press Open: the browser opens it.
4. Find bad under Links: it is muted text saying it is not opened. Tap it: nothing happens.

**Checklist line:**

> **H-08** Tap a web address in the details: a dialog says the link leaves Obsidian and what it opens; Cancel opens
> nothing, and Open hands it to the browser. A link to a javascript address is shown as text, never as a link, and
> tapping it does nothing.

**Back to the checklist:** [H-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-08 in its list.
