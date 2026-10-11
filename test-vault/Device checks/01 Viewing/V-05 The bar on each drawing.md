# V-05 The bar on each drawing

**You should see:** a bar over the drawing with a problems badge, Fit, Zoom out, Zoom in, Full screen and Edit. The badge shows an icon and counts in words, here "1 problem", because one link is misspelt.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(large)-[:RIVALS]->(smal)
```

<!-- expect: problem "smal is not in graph reader" -->

**Do this:**

1. Look along the bar over the drawing and name each control.
2. Read the badge: an icon, and a count in words.

**Checklist line:**

> **V-05** Each drawing has a bar: problems badge, Fit, Zoom out, Zoom in, Full screen, Edit. The badge counts in words and shows an icon.

**Back to the checklist:** [V-05 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-05 in its list.
