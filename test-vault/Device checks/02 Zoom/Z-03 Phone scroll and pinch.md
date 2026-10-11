# Z-03 Phone scroll and pinch

**You should see:** one finger on a fitted drawing scrolling the note, not the drawing. A two-finger pinch zooms about the point between the fingers, a little ahead of them: spreading the fingers to twice as far apart makes the drawing about 2.6 times the size, not twice, within the quarter and four times limits. Once zoomed in, one finger pans the drawing.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(pages:Reason {title: 'A4 pages need a screen of about 10 inches or more'}),
(eyes:Reason {title: 'E-ink is easier on the eyes over long sessions'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question),
(pages)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(small)
```

<!-- expect: clean -->

**Do this:**

1. On the phone, drag one finger up the drawing and watch the note scroll.
2. Pinch on a box, out and in, and watch the drawing zoom about your fingers, a little quicker than they move.
3. Now drag one finger on the zoomed drawing and watch it pan.

**Checklist line:**

> **Z-03** Phone: one finger on a fitted drawing scrolls the note. A pinch zooms about the fingers, and once zoomed in, one finger pans.

**Back to the checklist:** [Z-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-03 in its list.
