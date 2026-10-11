# Z-08 Locked graph undeclared

**You should see:** in this locked graph, a warning sign on the line of the kind Spare and on the line of the link type WANT, because its schema declares neither. HOPE is declared but has no reading of its own, so its line reads back as an arrow, `Drive —HOPE→ Plan`, not as a guess at words. The schema's own lines read back too, as `wishes_schema (not in the graph) —DECLARES→ kind_wish (not in the graph)`: that is expected, because the schema's things are not drawn.

**Test diagram:**

```gql
// graph: wishes
(drive:Wish {name: 'Drive'}),
(plan:Wish {name: 'Plan'}),
(spare:Spare {name: 'Spare'}),
(drive)-[:HOPE]->(plan),
(spare)-[:WANT]->(plan),
(wishes_schema:GraphMeta {graph: 'wishes', schema: 'wishes@1'}),
(kind_wish:Meta:ElementType {name: 'Wish', kind: 'node', origin: 'source'}),
(link_hope:Meta:ElementType {name: 'HOPE', kind: 'edge', origin: 'source'}),
(wishes_schema)-[:DECLARES]->(kind_wish),
(wishes_schema)-[:DECLARES]->(link_hope)
```

<!-- expect: problem "Spare is not a kind the schema of graph wishes declares" -->
<!-- expect: problem "WANT is not a relationship type the schema of graph wishes declares" -->
<!-- expect: check "§5" -->
<!-- expect: readback "Drive —HOPE→ Plan" -->
<!-- expect: readback "wishes_schema (not in the graph) —DECLARES→ kind_wish (not in the graph)" -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view hides the Edit, Park, Record and Lock buttons.
1. Press Edit to open the text.
2. Find the warning sign on the `(spare:Spare …)` line and on the `WANT` line.
3. Read the line beside the HOPE link: it should show the arrow, not words.
4. Read the lines beside the schema's DECLARES links: they name `wishes_schema (not in the graph)`, which is expected.

**Checklist line:**

> **Z-08** In a locked graph, a kind or link type its schema does not declare shows a ⚠ on its line. A link type with no reading of its own reads back as an arrow (Drive —HOPE→ …), not as a guess at words.

**Back to the checklist:** [Z-08 in the device checklist](https://github.com/rogerbucks/graph-note/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-08 in its list.
