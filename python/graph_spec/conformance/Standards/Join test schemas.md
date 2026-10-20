---
created: 2026-10-05T23:51
modified: 2026-10-05T23:51
status: active
test_class: Own
tags: [graph-model, schema]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec conformance suite]]"
    type: RELATED_TO
    direction: out
---

# Join test schemas

**The shared schemas the join test documents are written in** (§5 of [[Graph spec model]]). Each join test document names its schema in its first line — `schema ledger@8`, `schema process@4` — and declares no types of its own; a checker types it against the schema declared here. One schema, many documents: the same way knowledge notes share a schema.

The suite's configurations ([[Graph spec conformance suite]]) still list these types for the join; the suite checks the two agree.

## ledger@8

```gql
// graph: schema · SCHEMA ledger@8 · the lender's, broker's and revised notes — money in cents
INSERT
 (meta:GraphMeta {id: 'meta:schema/ledger@8', graph: 'schema', schema: 'ledger@8', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t_Party:Meta:ElementType {id: 'meta:ledger@8:Party', kind: 'node', name: 'Party', origin: 'source'}), (meta)-[:DECLARES]->(t_Party),
 (t_Person:Meta:ElementType {id: 'meta:ledger@8:Person', kind: 'node', name: 'Person', origin: 'source'}), (meta)-[:DECLARES]->(t_Person),
 (t_Organisation:Meta:ElementType {id: 'meta:ledger@8:Organisation', kind: 'node', name: 'Organisation', origin: 'source'}), (meta)-[:DECLARES]->(t_Organisation),
 (t_Loan:Meta:ElementType {id: 'meta:ledger@8:Loan', kind: 'node', name: 'Loan', origin: 'source'}), (meta)-[:DECLARES]->(t_Loan),
 (t_Repayment:Meta:ElementType {id: 'meta:ledger@8:Repayment', kind: 'node', name: 'Repayment', origin: 'source'}), (meta)-[:DECLARES]->(t_Repayment),
 (t_Project:Meta:ElementType {id: 'meta:ledger@8:Project', kind: 'node', name: 'Project', origin: 'source'}), (meta)-[:DECLARES]->(t_Project),
 (t_Decision:Meta:ElementType {id: 'meta:ledger@8:Decision', kind: 'node', name: 'Decision', origin: 'source'}), (meta)-[:DECLARES]->(t_Decision),
 (t_LENDER:Meta:ElementType {id: 'meta:ledger@8:LENDER', kind: 'edge', name: 'LENDER', origin: 'source', reading: 'has lender', reverse_name: 'lends on'}), (meta)-[:DECLARES]->(t_LENDER),
 (t_BORROWER:Meta:ElementType {id: 'meta:ledger@8:BORROWER', kind: 'edge', name: 'BORROWER', origin: 'source', reading: 'has borrower', reverse_name: 'borrows on'}), (meta)-[:DECLARES]->(t_BORROWER),
 (t_ARRANGED_BY:Meta:ElementType {id: 'meta:ledger@8:ARRANGED_BY', kind: 'edge', name: 'ARRANGED_BY', origin: 'source', reading: 'is arranged by', reverse_name: 'arranges'}), (meta)-[:DECLARES]->(t_ARRANGED_BY),
 (t_REPAYS:Meta:ElementType {id: 'meta:ledger@8:REPAYS', kind: 'edge', name: 'REPAYS', origin: 'source', reading: 'repays', reverse_name: 'is repaid by'}), (meta)-[:DECLARES]->(t_REPAYS),
 (t_PART_OF:Meta:ElementType {id: 'meta:ledger@8:PART_OF', kind: 'edge', name: 'PART_OF', origin: 'source', reading: 'is part of', reverse_name: 'contains'}), (meta)-[:DECLARES]->(t_PART_OF),
 (t_SUPERSEDES:Meta:ElementType {id: 'meta:ledger@8:SUPERSEDES', kind: 'edge', name: 'SUPERSEDES', origin: 'source', reading: 'supersedes', reverse_name: 'is superseded by'}), (meta)-[:DECLARES]->(t_SUPERSEDES),
 (t_EMPLOYED_BY:Meta:ElementType {id: 'meta:ledger@8:EMPLOYED_BY', kind: 'edge', name: 'EMPLOYED_BY', origin: 'source', reading: 'is employed by', reverse_name: 'employs'}), (meta)-[:DECLARES]->(t_EMPLOYED_BY)
```

## ledger@1

```gql
// graph: schema · SCHEMA ledger@1 · the borrower's notes — the same types, money in dollars (the unit map restates it)
INSERT
 (meta:GraphMeta {id: 'meta:schema/ledger@1', graph: 'schema', schema: 'ledger@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t_Party:Meta:ElementType {id: 'meta:ledger@1:Party', kind: 'node', name: 'Party', origin: 'source'}), (meta)-[:DECLARES]->(t_Party),
 (t_Person:Meta:ElementType {id: 'meta:ledger@1:Person', kind: 'node', name: 'Person', origin: 'source'}), (meta)-[:DECLARES]->(t_Person),
 (t_Organisation:Meta:ElementType {id: 'meta:ledger@1:Organisation', kind: 'node', name: 'Organisation', origin: 'source'}), (meta)-[:DECLARES]->(t_Organisation),
 (t_Loan:Meta:ElementType {id: 'meta:ledger@1:Loan', kind: 'node', name: 'Loan', origin: 'source'}), (meta)-[:DECLARES]->(t_Loan),
 (t_Repayment:Meta:ElementType {id: 'meta:ledger@1:Repayment', kind: 'node', name: 'Repayment', origin: 'source'}), (meta)-[:DECLARES]->(t_Repayment),
 (t_Project:Meta:ElementType {id: 'meta:ledger@1:Project', kind: 'node', name: 'Project', origin: 'source'}), (meta)-[:DECLARES]->(t_Project),
 (t_Decision:Meta:ElementType {id: 'meta:ledger@1:Decision', kind: 'node', name: 'Decision', origin: 'source'}), (meta)-[:DECLARES]->(t_Decision),
 (t_LENDER:Meta:ElementType {id: 'meta:ledger@1:LENDER', kind: 'edge', name: 'LENDER', origin: 'source', reading: 'has lender', reverse_name: 'lends on'}), (meta)-[:DECLARES]->(t_LENDER),
 (t_BORROWER:Meta:ElementType {id: 'meta:ledger@1:BORROWER', kind: 'edge', name: 'BORROWER', origin: 'source', reading: 'has borrower', reverse_name: 'borrows on'}), (meta)-[:DECLARES]->(t_BORROWER),
 (t_ARRANGED_BY:Meta:ElementType {id: 'meta:ledger@1:ARRANGED_BY', kind: 'edge', name: 'ARRANGED_BY', origin: 'source', reading: 'is arranged by', reverse_name: 'arranges'}), (meta)-[:DECLARES]->(t_ARRANGED_BY),
 (t_REPAYS:Meta:ElementType {id: 'meta:ledger@1:REPAYS', kind: 'edge', name: 'REPAYS', origin: 'source', reading: 'repays', reverse_name: 'is repaid by'}), (meta)-[:DECLARES]->(t_REPAYS),
 (t_PART_OF:Meta:ElementType {id: 'meta:ledger@1:PART_OF', kind: 'edge', name: 'PART_OF', origin: 'source', reading: 'is part of', reverse_name: 'contains'}), (meta)-[:DECLARES]->(t_PART_OF),
 (t_SUPERSEDES:Meta:ElementType {id: 'meta:ledger@1:SUPERSEDES', kind: 'edge', name: 'SUPERSEDES', origin: 'source', reading: 'supersedes', reverse_name: 'is superseded by'}), (meta)-[:DECLARES]->(t_SUPERSEDES),
 (t_EMPLOYED_BY:Meta:ElementType {id: 'meta:ledger@1:EMPLOYED_BY', kind: 'edge', name: 'EMPLOYED_BY', origin: 'source', reading: 'is employed by', reverse_name: 'employs'}), (meta)-[:DECLARES]->(t_EMPLOYED_BY)
```

## process@3

```gql
// graph: schema · SCHEMA process@3 · flat loan processes
INSERT
 (meta:GraphMeta {id: 'meta:schema/process@3', graph: 'schema', schema: 'process@3', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t_State:Meta:ElementType {id: 'meta:process@3:State', kind: 'node', name: 'State', origin: 'source'}), (meta)-[:DECLARES]->(t_State),
 (t_TRANSITION:Meta:ElementType {id: 'meta:process@3:TRANSITION', kind: 'edge', name: 'TRANSITION', origin: 'source', reading: 'moves to', reverse_name: 'is entered from', identified_by: 'event, guard'}), (meta)-[:DECLARES]->(t_TRANSITION)
```

## process@4

```gql
// graph: schema · SCHEMA process@4 · loan processes with sub-flows (§16)
INSERT
 (meta:GraphMeta {id: 'meta:schema/process@4', graph: 'schema', schema: 'process@4', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t_State:Meta:ElementType {id: 'meta:process@4:State', kind: 'node', name: 'State', origin: 'source'}), (meta)-[:DECLARES]->(t_State),
 (t_TRANSITION:Meta:ElementType {id: 'meta:process@4:TRANSITION', kind: 'edge', name: 'TRANSITION', origin: 'source', reading: 'moves to', reverse_name: 'is entered from', identified_by: 'event, guard'}), (meta)-[:DECLARES]->(t_TRANSITION),
 (t_DETAILED_IN:Meta:ElementType {id: 'meta:process@4:DETAILED_IN', kind: 'edge', name: 'DETAILED_IN', origin: 'source', reading: 'is detailed in', reverse_name: 'details'}), (meta)-[:DECLARES]->(t_DETAILED_IN)
```
