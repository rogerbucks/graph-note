---
created: 2026-10-04T20:53
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test A — lender's notes]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Join test B — borrower's notes

**A test document, not a record.** All people, organisations and figures are invented. This is the second of two documents written to be joined under §21 of [[Graph spec model]]. Its partner is [[Join test A — lender's notes]], which lists every planted condition. The generated result is [[Graph spec conformance — report]].

This document is the borrower's view: an older schema (`ledger@1`, money in dollars), as of 20 Oct 2026.

## Planted in this document only

| Test | What | Expected outcome |
|---|---|---|
| J11 | the shed is part of itself — invalid in this document alone | excluded before joining and reported, so the source can be fixed |
| J10 | `fee: 15.0` — dollars, in a field the unit map for `ledger@1` does not cover | flagged as undeclared |
| J12 | the garden is part of the yard — one link of a cycle that closes only with A and C | no paradox in any pair; a three-way cycle once all three are joined |

## The graph

```gql
// graph: notes · document doc:join-test-b · schema ledger@1 · as of 2026-10-20
INSERT
 (alice:Party:Person {id: 'person:alice', name: 'Alice', customer_since: '2018-06-12', employer: 'org:pier'}),
 (robert:Party:Person {id: 'person:robert', name: 'Bob Ng'}),
 (pier:Party:Organisation {id: 'org:pier', name: 'Pier Logistics'}),
 (harbour:Party:Person {id: 'org:harbour', name: 'Harbour Lending'}),
 (l1:Loan {id: 'loan:L1', principal: 1500.0, currency: 'NZD', fee: 15.0}),
 (l1)-[:LENDER]->(alice),
 (l1)-[:BORROWER]->(robert),
 (l1)-[:ARRANGED_BY]->(harbour),
 (r1:Event:Repayment {id: 'R1', amount: 250.0, at: DATE '2026-09-05'}),
 (r1)-[:REPAYS]->(l1),
 (reno:Project {id: 'project:renovation', name: 'Renovation'}),
 (kitchen:Project {id: 'project:kitchen', name: 'Kitchen'}),
 (reno)-[:PART_OF]->(kitchen),
 (shed:Project {id: 'project:shed', name: 'Shed'}),
 (shed)-[:PART_OF]->(shed),
 (garden:Project {id: 'project:garden', name: 'Garden'}),
 (yard:Project {id: 'project:yard', name: 'Yard'}),
 (garden)-[:PART_OF]->(yard),
 (d1:Decision {id: 'decision:D1', title: 'Lend $1,500'}),
 (d4:Decision {id: 'decision:D4', title: 'Lend $1,500, no interest'}),
 (d4)-[:SUPERSEDES {why: 'family rate'}]->(d1)
```
