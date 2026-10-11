# I-14 Properties after Done

**You should see:** after Done (or the book icon), the open properties staying open but read-only, as a tap shows them outside edit mode: no fields, no Add property, no x on a chip and no add box. Pressing Edit here again and tapping the box brings the editable properties back. Details that were closed before Done stay closed.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4}),
(large:Option {name: 'Large reader', rating: 5}),
(quiet:Tag {name: 'quiet'}),
(small)-[:ANSWERS]->(question),
(large)-[:ANSWERS]->(question),
(small)-[:HAS_TAG]->(quiet)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box so its properties show with their fields.
2. Press Done (or the book icon).
3. Check the properties stay open but have no fields, no Add property, no x on the chip and no add box.
4. Press Edit here again and tap the box: the editable properties return.
5. Close the Large reader's details before pressing Done and check they stay closed.

**Checklist line:**

> **I-14** Tap a box so its properties show, then press Done (or the book icon). The properties stay open but read-only, as a tap shows them outside edit mode: no fields, no Add property, no x on a chip and no add box. Pressing Edit here again, and tapping the box, brings the editable properties back. Details closed before Done stay closed.

**Back to the checklist:** [I-14 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-14 in its list.
