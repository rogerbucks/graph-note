# V-07 Tap a box for details

**You should see:** after tapping the Large reader box, its text ("Large reader"), its kind (Option), and its links: one going out (answers the question) and one coming in (favoured by the reason).

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(reason:Reason {title: 'A4 pages need a big screen'}),
(large)-[:ANSWERS]->(question),
(reason)-[:FAVOURS]->(large)
```

<!-- expect: clean -->

**Do this:**

1. Tap the Large reader box.
2. Read its text, kind and links in and out.
3. Tap another box and check the details change.

**Checklist line:**

> **V-07** Tapping a box shows its text, its kind, and its links in and out.

**Back to the checklist:** [V-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-07 in its list.
