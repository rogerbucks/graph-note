# U-01 AI off until turned on

**You should see:** with Use AI models off, as it is until you turn it on, the command "Ask an AI model to propose changes" only shows a notice saying AI is off: no dialog opens and nothing is sent. Turned on with no model set up, the notice says to set one up. Obsidian has no AI of its own, so once a model is set up the dialog offers only the models you set up yourself.

**Test diagram:**

```gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question),
(alice)-[:ASKED]->(question)
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): the command writes its answer into the note, so it is refused in reading view.
1. In Settings, ThoughtKnot, AI models, check Use AI models says Off.
2. Run "Ask an AI model to propose changes" from the command palette. Check a notice says AI is off, and no dialog opens.
3. Turn Use AI models on, with no model set up, and run the command again. Check the notice says to set a model up.
4. Set up one model (U-02 says how) and run the command again. Check the dialog's Model list holds only the models you set up.
5. Turn Use AI models off again when you are done.

**Checklist line:**

> **U-01** With Use AI models off, as it is until you turn it on, run "Ask an AI model to propose changes" from the command palette: a notice says AI is off, no dialog opens, and nothing is sent. Turn it on with no model set up: the notice says to set one up. Obsidian has no AI of its own, so the dialog offers only the models you set up.

**Back to the checklist:** [U-01 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-01 in its list.
