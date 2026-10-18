# C-03 Convert to standard GQL

**You should see:** with this graph in front, which misses a comma at the end of two lines, "Convert this note to standard GQL" writing both commas, and a notice saying how many were converted: `Converted 2 departures to standard GQL.` One undo takes both commas back.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'})
(small:Option {name: 'Small reader'})
(small)-[:ANSWERS]->(question)
```

<!-- expect: problem "a comma is missing at the end of this line" -->
<!-- expect: notice "Converted 2 departures to standard GQL." -->

**Do this:**

1. With this note in front in Live Preview or Source mode (reading view never changes a note: see C-07), open the command palette and run "Convert this note to standard GQL".
2. Check a comma is now at the end of the first two lines of the block, and the notice above appears.
3. Press undo once and check both commas are gone.
4. In Settings, ThoughtKnot, press the same button on the page, and check the same result.

**Checklist line:**

> **C-03** With such a note in front, try "Convert this note to standard GQL" from the command palette, and the button on the page. The comma is written, and a notice says how many were converted. One undo takes it back.

**Back to the checklist:** [C-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-03 in its list.
