# I-08 Properties look native

**You should see:** in edit mode, tapping the Small reader box showing its properties, its name, rating, stock and tags, looking as a note's Properties panel looks in this theme: the same rows, icons, spacing, type and colours, in both light and dark.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4, in_stock: true, released: DATE '2026-03-01'}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. Press Edit here, then tap the Small reader box.
2. Put a note's own Properties panel beside it (open any note with properties) and compare rows, icons, spacing, type and colours.
3. Switch between the light and dark themes and compare again.
4. Tap a link and check its properties look the same.

**Checklist line:**

> **I-08** In edit mode, tapping a box or a link shows its properties, looking as a note's Properties panel looks in this theme: the same rows, icons, spacing, type and colours, in both the light and dark themes.

**Back to the checklist:** [I-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-08 in its list.
