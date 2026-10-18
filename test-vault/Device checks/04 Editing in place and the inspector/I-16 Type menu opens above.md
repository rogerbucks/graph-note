# I-16 Type menu opens above

**You should see:** with the properties low on the screen, so the icon is near the bottom of the window, the property type menu opening above the icon and showing every item down to Remove, Checkbox included. With room below it opens under the icon as before. On the phone, where the rows are taller, it also fits.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4, released: DATE '2026-03-01', in_stock: true, colour: 'grey', weight: 180}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box.
2. Scroll the note until the properties are at the bottom of the window, and tap the icon of the last property. Check the menu opens above the icon and every item, down to Remove and Checkbox, is visible.
3. Scroll so there is room below and open the menu again: it should open under the icon.
4. Repeat on the phone.

**Checklist line:**

> **I-16** Phone and desktop: put the properties lower down the screen, so the icon is near the bottom of the window. The property type menu opens above the icon and shows every item down to Remove, Checkbox included. With room below, it opens under the icon as before. On the phone, where the rows are taller, it also fits.

**Back to the checklist:** [I-16 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-16 in its list.
