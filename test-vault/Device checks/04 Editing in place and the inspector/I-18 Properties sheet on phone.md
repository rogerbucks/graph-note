# I-18 Properties sheet on phone

**You should see:** on the phone, the properties opening as a sheet at the bottom of the screen, with every field and icon easy to hit with a thumb.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader', rating: 4, in_stock: true}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. On the phone, press Edit here and tap the Small reader box.
2. Check the properties open as a sheet at the bottom of the screen.
3. Touch each field, icon and the Add property button, and check each is easy to hit.

**Checklist line:**

> **I-18** Phone: the properties open as a sheet at the bottom of the screen, and every field and icon is easy to hit.

**Back to the checklist:** [I-18 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for I-18 in its list.
