# P-12 Graph locked by earlier build

**You should see:** a warning that the schema does not declare its types (Option, Question and ANSWERS), because the schema's GraphMeta has no DECLARES links, as a graph locked by an earlier build would be. Its fix adds the DECLARES links and the warning goes. The new DECLARES lines read back in the pane with the schema's names marked "(not in the graph)", because the schema's things are not drawn: that is expected.

**Test diagram:**

```gql
// graph: reader
(question:Question {title: 'Which device should I read on?'}),
(small:Option {name: 'Small reader'}),
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'answered by'}),
(small)-[:ANSWERS]->(question)
```

<!-- expect: problem "the schema does not declare Option, Question and ANSWERS" -->
<!-- expect: check "§5" -->

**Do this:**

1. Open the problems list behind the badge and read the warning.
2. Press its fix.
3. Check three DECLARES lines are added to the text and the warning goes.

**Checklist line:**

> **P-12** A graph locked by an earlier build shows a ⚠ that its schema does not declare its types. Its fix adds the DECLARES links, and the ⚠ goes.

**Back to the checklist:** [P-12 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for P-12 in its list.
