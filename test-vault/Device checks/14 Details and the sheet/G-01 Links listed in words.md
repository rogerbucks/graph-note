# G-01 Links listed in words

**You should see:** Tapping the Which device? box opens its details with one group under the heading Links in, reading `Links in: is answered by Kindle and Tablet (2)`: the two links of one type that come in are one line, read the other way round, with their count. Kindle and Tablet are each underlined, with a small link button beside each. Tapping Tablet makes it the selection: its box gets the heavy outline, its details open in place of the question's, and the drawing glides so Tablet is in view, at the same zoom. Zoomed right out, choosing a thing brings the drawing up to a size where its words can be read.

**Test diagram:**

```gql
// graph: devices · SOURCE
(q:Question {title: 'Which device?'}),
(kindle:Option {name: 'Kindle'}),
(tablet:Option {name: 'Tablet'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(price:Reason {title: 'Low price'}),
(kindle)-[:ANSWERS]->(q),
(tablet)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(kindle),
(price)-[:FAVOURS]->(kindle),
(price)-[:FAVOURS]->(tablet)
```

<!-- expect: clean -->
<!-- expect: detail "q | Links in: is answered by Kindle and Tablet (2)" -->

**Do this:**

1. Tap the Which device? box and read its details: one line under Links in, with the count (2).
2. Tap the Low price box: under Links out, one line reads favours Kindle and Tablet (2).
3. Zoom in until Tablet is out of sight, open Which device? again, and tap Tablet in its details. Check the drawing glides to Tablet and the zoom stays as it was.
4. Zoom right out with the minus button, open Which device? again and tap Kindle: check the drawing grows until Kindle's words can be read.
5. Tap the small link button beside Kindle: the link is selected and its details show From and To.

**Checklist line:**

> **G-01** Tap a box with several links of one type: its details list them by type and way, in words, each group once
> with a count where there are several, such as "is answered by Kindle and Tablet (2)". Each name is underlined; tap
> one and it becomes the selection, its details open and the drawing glides to it at the same zoom. Zoomed far out,
> it is brought up to a size that can be read.

**Back to the checklist:** [G-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for G-01 in its list.
