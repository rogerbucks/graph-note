# Z-02 Desktop drag and keys

**You should see:** once zoomed in, dragging empty space moves the drawing about inside its card. With the drawing focused, plus zooms in, minus zooms out, and zero returns to the whole drawing.

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

1. Zoom in with Ctrl or Command and the wheel.
2. Press on empty space and drag; the drawing should pan.
3. Click the drawing so it has focus, then press plus, minus and zero.

**Checklist line:**

> **Z-02** Desktop: dragging empty space pans once zoomed in. Plus, minus and zero work when the drawing has focus.

**Back to the checklist:** [Z-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-02 in its list.
