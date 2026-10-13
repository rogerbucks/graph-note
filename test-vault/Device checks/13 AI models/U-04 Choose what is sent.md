# U-04 Choose what is sent

**You should see:** what is sent is what you choose and nothing more. A view of the graph sends only the things the view picks out and the links between them; ticked things send only those things and the links between them; and none of the note's prose, nor any other graph, is ever in what is shown.

This line of prose is never sent.

**Test diagram:**

```gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question),
(alice)-[:ASKED]->(question)
```

```gql
// graph: reader · QUERY view picked_two
MATCH (n) WHERE n.id IN ['question', 'large_reader'] RETURN n
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): the command writes its answer into the note, so it is refused in reading view.
1. Run "Ask an AI model to propose changes" and choose A view of it, with the view picked_two. Press Show what will be sent. Check the body holds Which device? and Large reader and their ANSWERS link, and not Alice.
2. Choose Only the things ticked, and tick Alice and Which device?. Press Show what will be sent. Check the body holds those two and their ASKED link, and not Large reader.
3. Check the body never holds "This line of prose is never sent".

**Checklist line:**

> **U-04** Choose "A view of it", then "Only the things ticked" with two things ticked, pressing Show what will be sent each time: what is shown holds only those things and the links between them, and none of the note's prose.

**Back to the checklist:** [U-04 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for U-04 in its list.
