# E-05 Wide types on a phone

**You should see:** on the phone, three drawings each wider than the screen, none shrunk to fit its width. The flow and the timeline run left to right at a readable size, the whole of their height showing; the tree is wide, with its many leaves side by side. Each starts at its left edge. A finger dragged sideways on a drawing moves it sideways only, never up or down, and stops at either end; dragged up or down, it scrolls the note. A pinch still zooms in, and Fit brings the drawing back to its start.

**Test diagram:**

```gql
// graph: steps · SOURCE
(s1:Step {name: 'Gather the papers'}),
(s2:Step {name: 'Read them through'}),
(s3:Step {name: 'Mark the questions'}),
(s4:Step {name: 'Ask the team'}),
(s5:Step {name: 'Write the answers'}),
(s6:Step {name: 'Check the answers'}),
(s7:Step {name: 'Send them back'}),
(s1)-[:THEN]->(s2),
(s2)-[:THEN]->(s3),
(s3)-[:THEN]->(s4),
(s4)-[:THEN]->(s5),
(s5)-[:THEN]->(s6),
(s6)-[:THEN]->(s7)
```

```gql
// graph: steps_style · STYLE steps
(d1:Diagram {type: 'flow'})
```

```gql
// graph: family · SOURCE
(root:Person {name: 'Grandmother'}),
(a:Person {name: 'Anna'}),
(b:Person {name: 'Ben'}),
(c:Person {name: 'Cara'}),
(d:Person {name: 'Dan'}),
(e:Person {name: 'Eve'}),
(f:Person {name: 'Finn'}),
(g:Person {name: 'Gail'}),
(h:Person {name: 'Hugh'}),
(root)-[:PARENT_OF]->(a),
(root)-[:PARENT_OF]->(b),
(root)-[:PARENT_OF]->(c),
(root)-[:PARENT_OF]->(d),
(root)-[:PARENT_OF]->(e),
(root)-[:PARENT_OF]->(f),
(root)-[:PARENT_OF]->(g),
(root)-[:PARENT_OF]->(h)
```

```gql
// graph: family_style · STYLE family
(d1:Diagram {type: 'tree', relationship: 'PARENT_OF'})
```

```gql
// graph: year · SOURCE
(jan:Event {name: 'Plan the year', on: DATE '2026-01-05'}),
(mar:Event {name: 'First draft', on: DATE '2026-03-02'}),
(may:Event {name: 'Review', on: DATE '2026-05-11'}),
(jul:Event {name: 'Second draft', on: DATE '2026-07-06'}),
(sep:Event {name: 'Final review', on: DATE '2026-09-07'}),
(nov:Event {name: 'Publish', on: DATE '2026-11-02'}),
(dec:Event {name: 'Look back', on: DATE '2026-12-14'})
```

```gql
// graph: year_style · STYLE year
(d1:Diagram {type: 'timeline'})
```

<!-- expect: clean -->

**Do this:**

1. On the phone, look at each of the three drawings: readable, the whole height showing, starting at the left.
2. Drag a finger sideways on each: it moves sideways only, and stops at either end.
3. Drag a finger up and down on a drawing: the note scrolls.
4. Pinch to zoom in on one, then press Fit: it returns to its start.
5. On the Mac, the same three are fitted to the card's width, as every drawing there is.

**Checklist line:**

> **E-05** Phone: a wide flow, a wide tree and a wide timeline each show at a readable size, fitted top to bottom. A finger moves the drawing sideways only, and up and down still scroll the note.

**Back to the checklist:** [E-05 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for E-05 in its list.
