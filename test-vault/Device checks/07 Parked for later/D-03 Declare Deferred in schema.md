# D-03 Declare Deferred in schema

**You should see:** parking a box in a locked graph whose schema does not declare Deferred and DEFERS being refused, the message saying to declare them, with a button "Declare Deferred and DEFERS in the schema" below it. Pressing it writes the two declarations at the end of the block that holds the schema, writes the Deferred, and the badge says "No problems, 1 parked". Both graphs below are locked and lack the declarations: in the first the schema is in the same block, in the second in a later block. In the text of a locked graph the schema's own lines read back with names marked "(not in the graph)", such as `reader_schema (not in the graph) —DECLARES→ kind_option (not in the graph)`: that is expected, because the schema's things are not drawn.

**Test diagram:**

```gql
// graph: reader
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(tablet:Option {name: 'Tablet'}),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question),
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)
```

The second graph, with its schema in a later block.

```gql
// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)
```

```gql
// graph: trip · SOURCE
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(trip_schema)-[:DECLARES]->(kind_place),
(trip_schema)-[:DECLARES]->(link_near)
```

<!-- expect: clean -->
<!-- expect: readback "reader_schema (not in the graph) —DECLARES→ kind_option (not in the graph)" -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. On the first drawing press Edit here, tap the Tablet box, press Park for later, fill the form and press Park it.
2. Read the message and check the button "Declare Deferred and DEFERS in the schema" is as big as the other buttons to touch, and read by VoiceOver.
3. Press it, twice fast. Check the two declarations are at the end of the block, the Deferred is written with what you typed, and the badge says "No problems, 1 parked". It must park once.
4. Undo once: the park and the declarations should go together.
5. Blank the "What is needed" field and press Park it, then the declare button: nothing is declared, and the message says what is missing.
6. Repeat with the second drawing: the declarations go into the schema's own (later) block, and undo takes back the park only; the declarations stay until removed by hand.

**Checklist line:**

> **D-03** In a locked graph whose schema does not declare Deferred and DEFERS, Edit here, tap a box, press Park for later, fill the form and press Park it: the message says to declare them, and a button "Declare Deferred and DEFERS in the schema" appears below it, as big as the other buttons to touch and read by VoiceOver. Press it: the two declarations are written at the end of the block that holds the schema (in the text being edited, or, when the schema is in a later block, in that block of the note), the Deferred is written with what you typed in the form, and the badge says "No problems, 1 parked". Pressing the button twice fast parks once. Blank What is needed first and press it: nothing is declared, and the message says what is missing. Undo takes back the park, and, when the schema is in the same block, the declarations with it; when the schema is in another block the declarations are not undone with the park, and stay until removed by hand.

**Back to the checklist:** [D-03 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for D-03 in its list.
