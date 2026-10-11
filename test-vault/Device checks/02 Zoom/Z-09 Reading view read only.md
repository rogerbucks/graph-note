# Z-09 Reading view read only

**You should see:** in reading view, a bar that offers Source and no Edit. Source swaps the drawing for the block's text, coloured, in the same place, and pressing it again brings the drawing back. A hover preview of this note, or an embed of it in another, is read-only in the same way.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in reading view (not Live Preview): reading view is the one that hides the Edit button.
1. Switch to reading view and look at the bar: Source, and no Edit.
2. Press Source, then press it again.
3. Hover over a link to this note, or embed it in another note, and check the drawing there has no Edit.

**Checklist line:**

> **Z-09** Reading view is read-only: the bar offers Source and no Edit. Source shows the block's text, coloured, in place of the drawing, and pressed again brings the drawing back. A hover preview or an embed is read-only too.

**Back to the checklist:** [Z-09 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-09 in its list.
