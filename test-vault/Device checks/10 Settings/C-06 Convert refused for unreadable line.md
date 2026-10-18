# C-06 Convert refused for unreadable line

**You should see:** with this graph in front, which has a line that cannot be read as well as a missing comma, "Convert this note to standard GQL" leaving the note exactly as it is, and a notice saying why: `Not converted: block 1, line 4, cannot be read, so the note cannot be made standard: cannot read '??? what'`

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'})
(small:Option {name: 'Small reader'}),
(small)-[:ANSWERS]->(question) ??? what
```

<!-- expect: problem "a comma is missing at the end of this line" -->
<!-- expect: problem "cannot read '??? what'" -->
<!-- expect: notice "Not converted: block 1, line 4, cannot be read, so the note cannot be made standard: cannot read '??? what'" -->

**Do this:**

1. With this note in front in Live Preview or Source mode (in reading view the command refuses for another reason: see C-07), open the command palette and run "Convert this note to standard GQL".
2. Read the notice and check it is the one above.
3. Check the text of the block has not changed: no comma was written.
4. In Settings, ThoughtKnot, press the same button on the page, and check the same result.

**Checklist line:**

> **C-06** A note with a line that cannot be read, in front, and "Convert this note to standard GQL" from the command palette: the note is left as it is, and the notice says why.

**Back to the checklist:** [C-06 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-06 in its list.
