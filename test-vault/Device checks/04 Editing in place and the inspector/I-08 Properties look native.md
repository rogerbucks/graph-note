# I-08 Properties look native

**You should see:** in edit mode, tapping the Small reader box showing its four properties, name, rating, in_stock and released, looking as a note's Properties panel looks in this theme: the same rows, icons, spacing, type and colours, in both light and dark. Tapping a link shows its properties the same way.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4, in_stock: true, released: DATE '2026-03-01'}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. To have a Properties panel to compare with, add this front matter at the very top of this note (do not commit it; the vault reset removes it):

   ```yaml
   ---
   name: Small reader
   rating: 4
   in_stock: true
   released: 2026-03-01
   ---
   ```

2. Press Edit here, then tap the Small reader box. Its four properties should show as rows.
3. Put the note's own Properties panel beside them and compare rows, icons, spacing, type and colours.
4. Switch between the light and dark themes and compare again.
5. Tap the link from Small reader to the question and check its properties look the same.

**Checklist line:**

> **I-08** In edit mode, tapping a box or a link shows its properties, looking as a note's Properties panel looks in this theme: the same rows, icons, spacing, type and colours, in both the light and dark themes.

**Back to the checklist:** [I-08 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-08 in its list.
