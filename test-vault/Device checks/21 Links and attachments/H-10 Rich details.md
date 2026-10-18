# H-10 Rich details

**You should see:** The Plan box's details show its words as a note shows them: its name with the word plan in italics, its sum with the maths set as an equation and the word total in bold, and its see as a link. The chart written as a picture from a web address appears only as a link named chart, with no picture loaded, and the HTML written in raw appears as its text, angle brackets and all.

**Test diagram:**

```gql
// graph: rich_details · SOURCE
(plan:Doc {name: 'The *plan*', sum: 'Costs $E = mc^2$ in **total**', see: '[[Sample graph note]]', chart: '![chart](https://example.com/chart.png)', raw: '<b>bold</b>'})
```

<!-- expect: clean -->

**Do this:**

1. Tap the box: its details open.
2. Read them: plan is in italics, the equation is set as maths, total is bold and Sample graph note is a link.
3. Find chart: it is a link named chart, and no picture is shown. Find raw: it reads with its angle brackets, not in bold.

**Checklist line:**

> **H-10** A thing's details show its words as Obsidian shows them in a note: emphasis, maths and a link rendered,
> not as marks. An image from outside the vault is shown as a link only, and HTML written in a property as text.

**Back to the checklist:** [H-10 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-10 in its list.
