# I-11 Property icon menu

**You should see:** tapping a property's icon opening a menu to change its type or remove it. Add property adds a new row in place, with its name suggested from the names already used in the graph, such as rating or in_stock.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4}),
(large:Option {name: 'Large reader', rating: 5, in_stock: true}),
(small)-[:ANSWERS]->(question),
(large)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box.
2. Tap the icon beside rating and check the menu offers to change its type and to remove it.
3. Press Add property and check a new row appears with a name suggested from names used elsewhere (in_stock is used on the other option).

**Checklist line:**

> **I-11** Tapping a property's icon opens a menu to change its type or remove it. Add property adds a row in place, its name suggested from the names already used.

**Back to the checklist:** [I-11 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-11 in its list.
