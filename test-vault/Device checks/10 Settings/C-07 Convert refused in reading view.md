# C-07 Convert refused in reading view

**You should see:** "Convert this note to standard GQL" acting only on the note in the pane in front. With this note in front in reading view, it leaves the note exactly as it is, from the command palette and from the button on the settings page alike, and a notice says why and what to do: `This note is shown in reading view, which never changes it: switch to Live Preview or Source mode to convert it to standard GQL.` With the ThoughtKnot pane, a canvas, a PDF or an empty tab in front, the pane in front holds no note, so nothing is converted, even though this note was the last one open, and the notice says `The pane in front holds no note: open a note to convert it to standard GQL.` The pane in front decides: in Live Preview it writes both missing commas, even while another pane shows the note in reading view, and the notice says `Converted 2 departures to standard GQL.`

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

1. Show this note in reading view, with it in front.
2. Open the command palette and run "Convert this note to standard GQL". Read the notice and check it is the reading view one above.
3. Switch to Source mode or Live Preview and check the block has not changed: no comma was written.
4. Back in reading view, in Settings, ThoughtKnot, press the same button on the page, and check the same notice and no change.
5. Open the ThoughtKnot pane beside this note from another note's drawing in Live Preview, and click into the pane so it is in front. Run the command: nothing is converted, and the notice says the pane in front holds no note.
6. Open a new empty tab, or a canvas or a PDF, in front. Run the command: nothing is converted, with the same notice.
7. Open this note in two panes: one in reading view, and the other in Live Preview, in front. Run the command: both commas are written, the notice says 2 departures were converted, and the reading view pane shows them too. Undo once in the Live Preview pane to take them back.
8. Click into the reading view pane so it is in front, and run the command: the note is left as it is, with the reading view notice.

**Checklist line:**

> **C-07** The pane in front shows a note in reading view. Try "Convert this note to standard GQL" from the command palette, and the button on the page. The note is left as it is, and the notice says why.
>
> - With no note in the pane in front (the ThoughtKnot pane, a canvas, a PDF, an empty tab), nothing is converted. The notice says the pane holds no note.
> - The pane in front decides: in Live Preview it converts, even while another pane shows the note in reading view.

**Back to the checklist:** [C-07 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-07 in its list.
