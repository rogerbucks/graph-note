# H-01 Links shown as links

**You should see:** The Plan box's own words end in a link to the sample note, drawn in the theme's link colour and underlined, unlike the Site box beside it. Tapping Plan opens its details, where a Links list names each link by its property — name, then see — each one underlined. In the editor in place the same list shows below the inspector, and in the text the links inside their quotes are underlined.

**Test diagram:**

```gql
// graph: links_shown · SOURCE
(plan:Doc {name: 'Plan [[Sample graph note]]', see: '[[Sample graph note]] and [[Long note|the long note]]'}),
(site:Place {name: 'Site'}),
(plan)-[:NEAR]->(site)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview, with the cursor outside the block.
1. Look at the Plan box: the link at the end of its words is in the link colour and underlined.
2. Tap Plan: under Links, the details list name and see, each link underlined.
3. Press Edit here, then tap Plan again: the inspector's rows are there, and the Links list below them too.
4. Look at the text of the block in the editor: each link inside its quotes is underlined.

**Checklist line:**

> **H-01** A box whose name holds a link draws it in the link colour, underlined. Tap the box: its details list each link it holds under Links, by property, each underlined. Press Edit here and tap the box again: the inspector lists them too. In the text, the link inside its quotes is underlined.

**Back to the checklist:** [H-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for H-01 in its list.
