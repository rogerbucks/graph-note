# C-03 Convert to standard GQL

**You should see:** with the first note's commas missing, "Convert this note to standard GQL" writing the commas, a notice saying how many were converted, and one undo taking it all back. With the second graph's unreadable line in the note, the conversion leaves the note as it is, and the notice says why.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'})
(small:Option {name: 'Small reader'})
(small)-[:ANSWERS]->(question)
```

A second graph, with a line that cannot be read.

```gql
// graph: other · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(small)-[:ANSWERS]->(question) ??? what
```

<!-- expect: problem "a comma is missing at the end of this line" -->
<!-- expect: problem "cannot read '??? what'" -->

**Do this:**

1. With only the first graph in the note (delete the second for this step), run "Convert this note to standard GQL" from the command palette. Check the commas are written and a notice says how many were converted.
2. Press undo once and check the note is as before.
3. Restore the second graph and run the conversion again, and also press the button on the settings page. Check the note is left as it is and the notice says why.

**Checklist line:**

> **C-03** With such a note in front, "Convert this note to standard GQL" from the command palette, and the button on the page: the comma is written, a notice says how many were converted, and one undo takes it back. A note with a line that cannot be read is left as it is, and the notice says why (slice 2, simplified_back_to_standard).

**Back to the checklist:** [C-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-03 in its list.
