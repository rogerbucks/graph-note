# C-07 Convert refused in reading view

**You should see:** with this note in front and shown in reading view, "Convert this note to standard GQL" leaving the note exactly as it is, from the command palette and from the button on the settings page alike, and a notice saying why and what to do: `This note is shown in reading view, which never changes it: switch to Live Preview or Source mode to convert it.` Reading view only ever reads a note. Switched to Live Preview, the same command writes both missing commas, and the notice says `Converted 2 departures to standard GQL.`

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
2. Open the command palette and run "Convert this note to standard GQL". Read the notice and check it is the first one above.
3. Switch to Source mode or Live Preview and check the block has not changed: no comma was written.
4. Back in reading view, in Settings, Graph Note, press the same button on the page, and check the same notice and no change.
5. Close the settings, switch the note to Live Preview, and run the command again: both commas are written, and the notice says 2 departures were converted. Undo once to take them back.

**Checklist line:**

> **C-07** A note shown in reading view, in front, and "Convert this note to standard GQL" from the command palette, and the button on the page: the note is left as it is, and the notice says it is shown in reading view and to switch to Live Preview or Source mode. In Live Preview it converts.

**Back to the checklist:** [C-07 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for C-07 in its list.
