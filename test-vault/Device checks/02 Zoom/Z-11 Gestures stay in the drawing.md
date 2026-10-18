# Z-11 Gestures stay in the drawing

**You should see:** a drawing that keeps the touches it uses. Zoomed in, one finger pans the drawing and a pinch zooms it, and Obsidian's left and right panels never slide in, nor does the window move. A box held and dragged stays in the drawing too. On a drawing that is only fitted in the note, a sideways swipe still opens the panels, as anywhere else in the note.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

1. On the phone, press Zoom in twice, then drag one finger left and right across the drawing. It pans; no panel slides in.
2. Pinch out and in on the drawing. It zooms; no panel slides in and the window stays put.
3. Hold a finger on a box until it lifts, then drag it sideways. The box moves; no panel slides in.
4. Press Fit, then swipe sideways on the drawing. Now the panel slides in, as it does on the rest of the note.

**Checklist line:**

> **Z-11** Phone: zoomed in, one finger pans the drawing and a pinch zooms it, and neither slides Obsidian's side panels in nor moves the window; a box held and dragged does not either. On a fitted drawing a sideways swipe still opens them.

**Back to the checklist:** [Z-11 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-11 in its list.
