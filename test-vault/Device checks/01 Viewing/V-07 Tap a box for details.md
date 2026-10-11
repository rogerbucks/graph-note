# V-07 Tap a box for details

**You should see:** after tapping the Large reader box, a panel headed by its text, `Large reader`, with its kind, `Option`. Under the heading Links out, one line for the link going out: `Links out: answers → Which device should I read on?`. Under the heading Links in, one line for the link coming in: `Links in: A4 pages need a big screen favours this`.

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
<!-- expect: detail "large | Links out: answers → Which device should I read on?" -->
<!-- expect: detail "large | Links in: A4 pages need a big screen favours this" -->

**Do this:**

1. Tap the Large reader box.
2. Read the panel: its text, its kind, and its links out and in as above.
3. Tap the question box and check the panel changes: it has links in only.

**Checklist line:**

> **V-07** Tapping a box shows its text, its kind, and its links in and out.

**Back to the checklist:** [V-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-07 in its list.
