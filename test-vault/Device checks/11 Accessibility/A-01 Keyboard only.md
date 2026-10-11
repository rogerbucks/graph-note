# A-01 Keyboard only

**You should see:** on the desktop, with only the keyboard, Tab reaching every bar button, the drawing, each box and the one estimated link. Enter opens a box's details, or the reason for the estimate.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(easy_on_eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question),
(easy_on_eyes)-[:FAVOURS]->(large),
(easy_on_eyes)-[:FAVOURS]->(small_reeder)
```

<!-- expect: problem "small_reeder is not in graph reader" -->

**Do this:**

1. Without the mouse, press Tab from the text above the drawing and keep pressing it.
2. Check focus visits each button in the bar, the drawing, each box, and the estimated link to Small reader.
3. Press Enter on a box and read its details; press Enter on the estimated link and read the reason.

**Checklist line:**

> **A-01** Desktop, keyboard only: Tab reaches every button, the drawing, each box and each estimated link. Enter opens a box's details or an estimate's reason.

**Back to the checklist:** [A-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for A-01 in its list.
