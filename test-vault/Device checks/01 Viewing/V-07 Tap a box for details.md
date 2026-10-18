# V-07 Tap a box for details

**You should see:** first, the graph drawn down the page, Reason above Option above Question, with the link words `favours` and `answers` each beside their line and a small gap between the line and the first letter, never touching it. Then, after tapping the Large reader box, a panel headed by its text, `Large reader`, with its kind, `Option`. Under the heading Links out, one line for the link going out, in words, with the question's name underlined as a choice: `Links out: answers Which device should I read on?`. Under the heading Links in, one line for the link coming in, read the other way round: `Links in: is favoured by A4 pages need a big screen`.

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
<!-- expect: detail "large | Links out: answers Which device should I read on?" -->
<!-- expect: detail "large | Links in: is favoured by A4 pages need a big screen" -->

**Do this:**

1. Look at the drawing before you tap: the words `favours` and `answers` start a little way to the right of their lines, not on them. Zoom in to see the gap.
2. Tap the Large reader box.
3. Read the panel: its text, its kind, and its links out and in as above.
4. Tap the question box and check the panel changes: it has links in only.

**Checklist line:**

> **V-07** Tapping a box shows its text, its kind, and its links in and out.

**Back to the checklist:** [V-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for V-07 in its list.
