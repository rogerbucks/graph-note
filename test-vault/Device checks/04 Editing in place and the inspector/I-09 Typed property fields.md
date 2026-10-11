# I-09 Typed property fields

**You should see:** a number property, rating, with a number field; a date property, released, that opens the date picker; and a true-or-false property, in_stock, shown as a checkbox.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4, released: DATE '2026-03-01', in_stock: true}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box.
2. Check rating has a number field, released opens a date picker when pressed, and in_stock is a checkbox.
3. Try each: change the rating, pick another date, and untick the box.

**Checklist line:**

> **I-09** A number has a number field, a date opens the date picker, and true or false is a checkbox.

**Back to the checklist:** [I-09 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-09 in its list.
