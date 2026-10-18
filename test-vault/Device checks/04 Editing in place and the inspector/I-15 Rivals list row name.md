# I-15 Rivals list row name

**You should see:** after adding a property named `rivals` and choosing List, a form saying in one sentence that the values become things linked by the relationship and that the row is named after it. After Make list the row reads `rivals · HAS_RIVAL` while the editor stays open, and `HAS_RIVAL` alone after Done and a reload. A value typed as `Reading tablet` is written as `reading_tablet`, because the graph's names are snake case, with the words kept as its name.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit here and tap the Small reader box. Press Add property and name it `rivals`.
2. Choose List from its menu and read the sentence in the form.
3. Type `Reading tablet` as a value and press Make list.
4. Check the row reads `rivals · HAS_RIVAL`, and that the text now has a thing called `reading_tablet` with the name 'Reading tablet'.
5. Press Done, reload the app, and check the row reads `HAS_RIVAL` alone.

**Checklist line:**

> **I-15** Add a property named `rivals` and choose List. The form says, in one sentence, that the values become things linked by the relationship and that the row is named after it. After Make list the row reads `rivals · HAS_RIVAL` for as long as the editor stays open, and `HAS_RIVAL` alone after Done and a reload. A value typed in as `Reading tablet` is written as `reading_tablet` when the graph's names are snake case, with the words kept as its name.

**Back to the checklist:** [I-15 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-15 in its list.
