# M-02 Labels by zoom

**You should see:** on the phone the long chain is fitted to the width of the note, so small that no link's label is shown: the boxes and lines only. Zoomed in with a pinch, the labels "comes before" appear once they are large enough to read. With a box selected, its two links keep their labels at any zoom; on the Mac a link under the pointer keeps its label too. With Labels by zoom turned off in the View menu, every label shows however far out the drawing is zoomed.

**Test diagram:**

```gql
// graph: steps · SOURCE
(s1:Step {name: 'Gather the wood'}),
(s2:Step {name: 'Measure each board'}),
(s3:Step {name: 'Mark the cuts'}),
(s4:Step {name: 'Cut the boards'}),
(s5:Step {name: 'Sand every edge'}),
(s6:Step {name: 'Join the frame'}),
(s7:Step {name: 'Fit the panels'}),
(s8:Step {name: 'Oil the wood'}),
(s1)-[:COMES_BEFORE]->(s2),
(s2)-[:COMES_BEFORE]->(s3),
(s3)-[:COMES_BEFORE]->(s4),
(s4)-[:COMES_BEFORE]->(s5),
(s5)-[:COMES_BEFORE]->(s6),
(s6)-[:COMES_BEFORE]->(s7),
(s7)-[:COMES_BEFORE]->(s8)
```

<!-- expect: clean -->

**Do this:**

1. On the phone, look at the drawing as the note shows it: boxes and lines, and no link labels.
2. Pinch to zoom in until the labels appear, and check they appear only once they can be read.
3. Press Fit, then tap Cut the boards: its two links show their labels, the rest do not.
4. On the Mac, point at a link while zoomed out: its label shows while the pointer is on it.
5. Press View and turn Labels by zoom off: every label shows. Turn it on again.

**Checklist line:**

> **M-02** On the phone, a wide graph fitted to the note shows its boxes but no link labels. Pinch to zoom in, and the labels appear once they can be read. Tap a box: its own links keep their labels at any zoom, as does a link under the pointer on the Mac. Turn Labels by zoom off: every label shows at any zoom.

**Back to the checklist:** [M-02 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-02 in its list.
