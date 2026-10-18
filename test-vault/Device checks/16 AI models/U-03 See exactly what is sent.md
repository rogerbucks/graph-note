# U-03 See exactly what is sent

**You should see:** before anything is sent, the dialog shows the exact request: the model, its address, the headers with the key only by its name, the note's classification, and the body word for word. Send stays off until it is shown, and goes off again when anything is changed. Pressed, it sends exactly that, once, and the answer arrives as a change set under the graph, each change waiting for you; the graph block itself is unchanged.

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
1. Give this note a classification of Public in its front matter (a note with none counts as the most sensitive level, and by default goes to no model). Run "Ask an AI model to propose changes", choose The whole graph and the local model. Check Send is off.
2. Press Show what will be sent. Check the model, its address and the note's classification are said, the headers show any key only by its name, and the body holds the graph's things and links and your question.
3. Change the question. Check Send goes off and what was shown goes, until you press Show what will be sent again.
4. Press Send once. Check a notice says how many changes the model proposed, and a change set block appears under the graph with each change listed to accept or reject.
5. Check the graph block is as it was before you sent. Take the front matter and the change set out again.

**Checklist line:**

> **U-03** In the dialog, choose a model and press Show what will be sent: the exact request is shown, with the model, its address, the headers (the key only by its name) and the note's classification, and Send stays off until then. Change the question: Send goes off again until it is shown again. Press Send: exactly that goes, once, and the answer arrives as a change set under the graph, each change waiting to be accepted or rejected; the graph block is unchanged.

**Back to the checklist:** [U-03 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-03 in its list.
