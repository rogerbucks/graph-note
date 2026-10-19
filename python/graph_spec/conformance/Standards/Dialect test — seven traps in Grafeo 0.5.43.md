---
created: 2026-10-05T12:22
modified: 2026-10-08T21:49
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/☑️ 2026-10-05 Build H1 — the graph spec dialect linter.task]]"
    type: RELATED_TO
    direction: out
---

# Dialect test — seven traps in Grafeo 0.5.43

**A test document, not a record.** Its controls Q8–Q11 are things the linter must *not* flag — measured on 5 Oct 2026 and kept here so the measurement can be repeated. The dialect linter (§24 H1 of [[Graph spec model]]) checked against every trap listed in E10. A small renovation graph and four queries are written correctly here. Each mutation swaps one of them for its trap. **Four of the traps give a wrong answer with no error**; the suite proves that, with the linter switched off, Grafeo returns a wrong answer and raises nothing. The other three fail loudly in Grafeo, and the linter names the fix. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Written correctly | The trap | Without the linter |
|---|---|---|---|
| Q1 | spend per budget aggregated with `WITH`, then compared | `sum(s.amount_cents) > b.approved_cents` in one expression | every answer null — **silent** |
| Q2 | a self-containing area matched twice, ids compared | `(a)-[:PART_OF]->(b)-[:PART_OF]->(a)` | the yard reported as containing itself — **silent** |
| Q3 | each area returned as a map | `[a.id, a.note]` | rows shift where a note is missing — **silent** |
| Q4 | events after 1 Nov compared as `DATETIME` with an offset | `ZONED DATETIME` | no events found — **silent** |
| Q5 | ordinary property names | a property called `for` | Grafeo refuses the block |
| Q6 | `MATCH … INSERT … SET` | `MATCH … SET … INSERT` | Grafeo refuses the block |
| Q7 | no bytes in the graph | a byte literal `X'…'` | Grafeo refuses the block |
| Q8 | `to`, `date` and `on` as property names; `TO`, `ON` and `DATE` as relationship types | — they are not traps in 0.5.43 | the block loads and the linter passes it |
| Q9 | a loop written as two comma-separated patterns | — Grafeo enforces the shared variable here | no area found inside itself |
| Q10 | an aggregate plus a literal, `count(a) + 1` | — only a mix with a property value fails | the right number |
| Q11 | a list holding ids and fixed text | — an id is never null (§10) | every row complete |
| Q12 | — | `groups` as a label | Grafeo refuses the block |
| Q13 | — | `on` as a variable | Grafeo refuses the block |
| Q14 | every node written before a relationship uses it | `(n1)-[:TO]->(n2), (n2:Note {…})` — a node used before it is written. *Added 6 Oct 2026: the portable readers used to accept it* | Grafeo refuses the block |
| Q15 | `MATCH … INSERT …` — the keyword kept after `MATCH` | `MATCH (kitchen …)` then the new things with no `INSERT`. *Added 6 Oct 2026, with the data shortcut: only a block that lists things and links may leave the keyword out* | the readers cannot tell what is found from what is added |
| Q16 | a graph name of one word, `dialect` | `// graph: dialect-test` — a hyphen in the graph name. *Added 6 Oct 2026* | Grafeo cannot create the graph |
| Q17 | every type its GraphMeta `DECLARES` | `Budget` written as an `ElementType` but not linked from the GraphMeta by `DECLARES`. *Added 8 Oct 2026: the readers used to count any ElementType as declared, against §5* | Grafeo loads it; only the readers can see the type is not declared |
| Q18 | a link type with its colon, `[:PART_OF]` | `[PART_OF]` — the colon left out. *Added 8 Oct 2026, measured that evening:* Grafeo reads `PART_OF` as a variable and stores a link with **no type** | **silent** in Grafeo — so the readers refuse to give an engine a block that still holds one, and the tools fix it first |

## The graph

```gql
// graph: dialect · SOURCE · example — a small renovation graph for the dialect traps
INSERT
 (meta:GraphMeta {id: 'meta:dialect', graph: 'dialect', schema: 'dialect@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (tB:Meta:ElementType {id: 'meta:dialect:Budget', kind: 'node', name: 'Budget', origin: 'source'}), (meta)-[:DECLARES]->(tB),
 (tS:Meta:ElementType {id: 'meta:dialect:Spend', kind: 'node', name: 'Spend', origin: 'source'}), (meta)-[:DECLARES]->(tS),
 (tA:Meta:ElementType {id: 'meta:dialect:Area', kind: 'node', name: 'Area', origin: 'source'}), (meta)-[:DECLARES]->(tA),
 (tE:Meta:ElementType {id: 'meta:dialect:Event', kind: 'node', name: 'Event', origin: 'source'}), (meta)-[:DECLARES]->(tE),
 (tN:Meta:ElementType {id: 'meta:dialect:Note', kind: 'node', name: 'Note', origin: 'source'}), (meta)-[:DECLARES]->(tN),
 (eC:Meta:ElementType {id: 'meta:dialect:CHARGED_TO', kind: 'edge', name: 'CHARGED_TO', origin: 'source', reading: 'is charged to', reverse_name: 'is charged with'}), (meta)-[:DECLARES]->(eC),
 (eP:Meta:ElementType {id: 'meta:dialect:PART_OF', kind: 'edge', name: 'PART_OF', origin: 'source', reading: 'is part of', reverse_name: 'contains'}), (meta)-[:DECLARES]->(eP),
 (eA:Meta:ElementType {id: 'meta:dialect:ABOUT', kind: 'edge', name: 'ABOUT', origin: 'source', reading: 'is about', reverse_name: 'is the subject of'}), (meta)-[:DECLARES]->(eA),
 (eTo:Meta:ElementType {id: 'meta:dialect:TO', kind: 'edge', name: 'TO', origin: 'source', reading: 'leads to', reverse_name: 'is reached from'}), (meta)-[:DECLARES]->(eTo),
 (eOn:Meta:ElementType {id: 'meta:dialect:ON', kind: 'edge', name: 'ON', origin: 'source', reading: 'is on', reverse_name: 'carries'}), (meta)-[:DECLARES]->(eOn),
 (eDa:Meta:ElementType {id: 'meta:dialect:DATE', kind: 'edge', name: 'DATE', origin: 'source', reading: 'falls on', reverse_name: 'is the date of'}), (meta)-[:DECLARES]->(eDa),
 (kitchen:Budget {id: 'budget:kitchen', approved_cents: 10000}),
 (roof:Budget {id: 'budget:roof', approved_cents: 50000}),
 (s1:Spend {id: 'spend:1', amount_cents: 8000}), (s2:Spend {id: 'spend:2', amount_cents: 4000}), (s3:Spend {id: 'spend:3', amount_cents: 9000}),
 (s1)-[:CHARGED_TO]->(kitchen), (s2)-[:CHARGED_TO]->(kitchen), (s3)-[:CHARGED_TO]->(roof),
 (deck:Area {id: 'area:deck'}), (garden:Area {id: 'area:garden', note: 'north side'}), (yard:Area {id: 'area:yard'}),
 (deck)-[:PART_OF]->(garden), (garden)-[:PART_OF]->(yard),
 (quote:Event {id: 'event:quote', at: DATETIME '2026-10-20T10:00:00+10:00'}),
 (inspection:Event {id: 'event:inspection', at: DATETIME '2026-11-02T09:00:00+10:00'})
```

## Names Grafeo accepts

```gql
// graph: dialect · SOURCE · later — names that look reserved but are accepted by 0.5.43
INSERT (trip:Note {id: 'note:trip', to: 'Brisbane', date: DATE '2026-11-03', on: 'site'}),
 (n1:Note {id: 'note:a'}), (n2:Note {id: 'note:b'}), (n3:Note {id: 'note:c'}), (n4:Note {id: 'note:d'}),
 (n1)-[:TO]->(n2), (n2)-[:ON]->(n3), (n3)-[:DATE]->(n4)
```

## Later — the kitchen budget is raised

```gql
// graph: dialect · SOURCE · later — the kitchen budget raised to $110, with a note why
MATCH (kitchen:Budget {id: 'budget:kitchen'})
INSERT (n:Note {id: 'note:kitchen-raise', text: 'tiles cost more than quoted'}), (n)-[:ABOUT]->(kitchen)
SET kitchen.approved_cents = 11000
```

## Over budget

```gql
// graph: dialect · QUERY · which budgets are over
MATCH (s:Spend)-[:CHARGED_TO]->(b:Budget)
WITH b, sum(s.amount_cents) AS spent
RETURN b.id AS budget, spent > b.approved_cents AS over ORDER BY budget
```

## Areas that contain themselves

```gql
// graph: dialect · QUERY · an area inside itself would be a loop
MATCH (a:Area)-[:PART_OF]->(b) MATCH (b)-[:PART_OF]->(c) WHERE c.id = a.id
RETURN a.id AS area
```

## Each area

```gql
// graph: dialect · QUERY · each area, with its note if it has one
MATCH (a:Area)
RETURN {id: a.id, note: a.note} AS row ORDER BY a.id
```

## Events after 1 November

```gql
// graph: dialect · QUERY · events after the start of November, Brisbane time
MATCH (e:Event) WHERE e.at > DATETIME '2026-11-01T00:00:00+10:00'
RETURN e.id AS event
```

## A loop in two patterns

```gql
// graph: dialect · QUERY · the same loop test written as two patterns joined by a comma
MATCH (a:Area)-[:PART_OF]->(b), (b)-[:PART_OF]->(a)
RETURN a.id AS area
```

## How many areas, plus one

```gql
// graph: dialect · QUERY · an aggregate with a literal
MATCH (a:Area)
RETURN count(a) + 1 AS n
```

## Area ids as lists

```gql
// graph: dialect · QUERY · a list of an id and fixed text
MATCH (a:Area)
RETURN [a.id, 'area'] AS row ORDER BY a.id
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17). A mutation marked `silent` is also run with the linter switched off, to prove the trap gives a wrong answer with no error.

```yaml
# conformance case
case: dialect
title: The dialect linter catches every known trap
kind: graphs
rounds:
  - name: written correctly
    documents: ["Dialect test — seven traps in Grafeo 0.5.43", "Dialect test — seven traps in Grafeo 0.5.43#Later — the kitchen budget is raised", "Dialect test — seven traps in Grafeo 0.5.43#Names Grafeo accepts"]
    expect:
      queries:
        - {test: Q1, query: "Dialect test — seven traps in Grafeo 0.5.43#Over budget", returns: [{budget: "budget:kitchen", over: true}, {budget: "budget:roof", over: false}]}
        - {test: Q2, query: "Dialect test — seven traps in Grafeo 0.5.43#Areas that contain themselves", returns: []}
        - {test: Q3, query: "Dialect test — seven traps in Grafeo 0.5.43#Each area", returns: [{row: {id: "area:deck"}}, {row: {id: "area:garden", note: "north side"}}, {row: {id: "area:yard"}}]}
        - {test: Q4, query: "Dialect test — seven traps in Grafeo 0.5.43#Events after 1 November", returns: [{event: "event:inspection"}]}
        - {test: Q8, query: "Dialect test — seven traps in Grafeo 0.5.43#Each area", returns: [{row: {id: "area:deck"}}, {row: {id: "area:garden", note: "north side"}}, {row: {id: "area:yard"}}]}
        - {test: Q9, query: "Dialect test — seven traps in Grafeo 0.5.43#A loop in two patterns", returns: []}
        - {test: Q10, query: "Dialect test — seven traps in Grafeo 0.5.43#How many areas, plus one", returns: [{n: 4}]}
        - {test: Q11, query: "Dialect test — seven traps in Grafeo 0.5.43#Area ids as lists", returns: [{row: ["area:deck", "area"]}, {row: ["area:garden", "area"]}, {row: ["area:yard", "area"]}]}
    mutations:
      - {test: Q1, name: "an aggregate mixed with a value", silent: true, document: "Dialect test — seven traps in Grafeo 0.5.43#Over budget", replace: "WITH b, sum(s.amount_cents) AS spent\nRETURN b.id AS budget, spent > b.approved_cents AS over", with: "RETURN b.id AS budget, sum(s.amount_cents) > b.approved_cents AS over", expect_check: "dialect linter", expect_message: "aggregate mixed with a value"}
      - {test: Q2, name: "a pattern that returns to its own variable", silent: true, document: "Dialect test — seven traps in Grafeo 0.5.43#Areas that contain themselves", replace: "MATCH (a:Area)-[:PART_OF]->(b) MATCH (b)-[:PART_OF]->(c) WHERE c.id = a.id", with: "MATCH (a:Area)-[:PART_OF]->(b)-[:PART_OF]->(a)", expect_check: "dialect linter", expect_message: "pattern returns to a bound variable"}
      - {test: Q3, name: "a list literal with values that may be null", silent: true, document: "Dialect test — seven traps in Grafeo 0.5.43#Each area", replace: "{id: a.id, note: a.note}", with: "[a.id, a.note]", expect_check: "dialect linter", expect_message: "list literal"}
      - {test: Q4, name: "a zoned datetime comparison", silent: true, document: "Dialect test — seven traps in Grafeo 0.5.43#Events after 1 November", replace: "e.at > DATETIME", with: "e.at > ZONED DATETIME", expect_check: "dialect linter", expect_message: "zoned datetime"}
      - {test: Q5, name: "a reserved word as a property name", document: "Dialect test — seven traps in Grafeo 0.5.43", replace: "(roof:Budget {id: 'budget:roof',", with: "(roof:Budget {id: 'budget:roof', for: 'house',", expect_check: "dialect linter", expect_message: "reserved word"}
      - {test: Q6, name: "SET before INSERT", document: "Dialect test — seven traps in Grafeo 0.5.43#Later — the kitchen budget is raised", replace: "INSERT (n:Note {id: 'note:kitchen-raise', text: 'tiles cost more than quoted'}), (n)-[:ABOUT]->(kitchen)\nSET kitchen.approved_cents = 11000", with: "SET kitchen.approved_cents = 11000\nINSERT (n:Note {id: 'note:kitchen-raise', text: 'tiles cost more than quoted'}), (n)-[:ABOUT]->(kitchen)", expect_check: "dialect linter", expect_message: "SET before INSERT"}
      - {test: Q12, name: "a reserved word as a label", document: "Dialect test — seven traps in Grafeo 0.5.43#Names Grafeo accepts", replace: "(n4:Note {id: 'note:d'})", with: "(n4:groups {id: 'note:d'})", expect_check: "dialect linter", expect_message: "reserved word"}
      - {test: Q13, name: "a reserved word as a variable", document: "Dialect test — seven traps in Grafeo 0.5.43#Names Grafeo accepts", replace: "(n2:Note {id: 'note:b'})", with: "(on:Note {id: 'note:b'})", expect_check: "dialect linter", expect_message: "reserved word"}
      - {test: Q14, name: "a node used before it is written", document: "Dialect test — seven traps in Grafeo 0.5.43#Names Grafeo accepts", replace: "(n1:Note {id: 'note:a'}), (n2:Note {id: 'note:b'}),", with: "(n1:Note {id: 'note:a'}), (n1)-[:TO]->(n2), (n2:Note {id: 'note:b'}),", expect_check: "dialect linter", expect_message: "used before it is written"}
      - {test: Q15, name: "INSERT left out after MATCH", document: "Dialect test — seven traps in Grafeo 0.5.43#Later — the kitchen budget is raised", replace: "MATCH (kitchen:Budget {id: 'budget:kitchen'})\nINSERT (n:Note", with: "MATCH (kitchen:Budget {id: 'budget:kitchen'})\n(n:Note", expect_check: "dialect linter", expect_message: "expected 'INSERT'"}
      - {test: Q16, name: "a graph name that is not one word", document: "Dialect test — seven traps in Grafeo 0.5.43#Names Grafeo accepts", replace: "// graph: dialect · SOURCE · later — names", with: "// graph: dialect-test · SOURCE · later — names", expect_check: "dialect linter", expect_message: "is not one word"}
      - {test: Q7, name: "a byte literal", document: "Dialect test — seven traps in Grafeo 0.5.43", append: ",\n (photo:Note {id: 'note:photo', bytes: X'FFD8FF'})", expect_check: "dialect linter", expect_message: "byte literal"}
      - {test: Q17, name: "a type its GraphMeta does not declare", document: "Dialect test — seven traps in Grafeo 0.5.43", replace: "name: 'Budget', origin: 'source'}), (meta)-[:DECLARES]->(tB),", with: "name: 'Budget', origin: 'source'}),"}
      - {test: Q18, name: "a link type written without its colon", document: "Dialect test — seven traps in Grafeo 0.5.43", replace: "(deck)-[:PART_OF]->(garden)", with: "(deck)-[PART_OF]->(garden)", expect_message: "has no colon"}
```
