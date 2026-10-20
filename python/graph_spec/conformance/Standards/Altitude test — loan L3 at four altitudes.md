---
created: 2026-10-05T08:55
modified: 2026-10-05T08:55
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Altitude test — loan L3 at four altitudes

**A test document, not a record.** Loan L3 told at four altitudes under §22 of [[Graph spec model]]: its facts, its November arrears, its origination and servicing, and its whole life. A second arrears episode, on loan L1, shows paths related through a concept. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| A1 | lift from the grace-expiry fact | the November arrears → servicing → the loan's whole life |
| A2 | view the loan's life at each altitude | 2 paths at Working; 5 facts and 1 episode at Detail; all 8 facts at Facts |
| A3 | sideways through *an arrears episode* | both loans' episodes |
| A4 | lift the concept | *running a loan* → *a loan from request to close* |
| A5 | a path that contains a path above it | caught by rule 1 |
| A6 | a gap in a path's steps | caught by rule 2 |
| A7 | a path that never reaches a fact | caught by rule 3 |
| A8 | facts under a path out of time order | caught by rule 4 |

## The graph

```gql
// graph: altitude · SOURCE · example — loan L3 seen at four altitudes
INSERT
 (meta:GraphMeta {id: 'meta:altitude', graph: 'altitude', schema: 'altitude@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (tP:Meta:ElementType {id: 'meta:altitude:Path', kind: 'node', name: 'Path', origin: 'source'}), (meta)-[:DECLARES]->(tP),
 (tC:Meta:ElementType {id: 'meta:altitude:Concept', kind: 'node', name: 'Concept', origin: 'source', aligns_with: 'skos:Concept'}), (meta)-[:DECLARES]->(tC),
 (tA:Meta:ElementType {id: 'meta:altitude:Altitude', kind: 'node', name: 'Altitude', origin: 'source'}), (meta)-[:DECLARES]->(tA),
 (tE:Meta:ElementType {id: 'meta:altitude:Event', kind: 'node', name: 'Event', origin: 'source'}), (meta)-[:DECLARES]->(tE),
 (tS:Meta:ElementType {id: 'meta:altitude:STEP', kind: 'edge', name: 'STEP', origin: 'source', reading: 'has step', reverse_name: 'is a step of', identified_by: 'seq'}), (meta)-[:DECLARES]->(tS),
 (tI:Meta:ElementType {id: 'meta:altitude:INSTANCE_OF', kind: 'edge', name: 'INSTANCE_OF', origin: 'source', reading: 'is an instance of', reverse_name: 'has instance'}), (meta)-[:DECLARES]->(tI),
 (tB:Meta:ElementType {id: 'meta:altitude:BROADER', kind: 'edge', name: 'BROADER', origin: 'source', reading: 'has broader concept', reverse_name: 'narrower', aligns_with: 'skos:broader'}), (meta)-[:DECLARES]->(tB),
// the altitudes, named
 (a3:Altitude {id: 'altitude:3', level: 3, name: 'Overview'}),
 (a2:Altitude {id: 'altitude:2', level: 2, name: 'Working'}),
 (a1:Altitude {id: 'altitude:1', level: 1, name: 'Detail'}),
 (a0:Altitude {id: 'altitude:0', level: 0, name: 'Facts'}),
// altitude 0 — the facts
 (request:Event {id: 'ev:L3/request', kind: 'Request', at: DATE '2026-09-20'}),
 (offer:Event {id: 'ev:L3/offer', kind: 'Offer', at: DATE '2026-09-22'}),
 (sign:Event {id: 'ev:L3/sign', kind: 'Sign', at: DATE '2026-09-25'}),
 (drawdown:Event {id: 'ev:L3/drawdown', kind: 'Drawdown', at: DATE '2026-10-01'}),
 (missed:Event {id: 'ev:L3/missed', kind: 'InstalmentMissed', at: DATE '2026-11-01'}),
 (grace:Event {id: 'ev:L3/grace', kind: 'GraceExpired', at: DATE '2026-11-08'}),
 (dint:Event {id: 'ev:L3/default-interest', kind: 'DefaultInterestCharge', at: DATE '2026-11-30'}),
 (payout:Event {id: 'ev:L3/payout', kind: 'Repayment', at: DATE '2026-11-30'}),
 (l1missed:Event {id: 'ev:L1/missed', kind: 'InstalmentMissed', at: DATE '2026-10-15'}),
 (l1cured:Event {id: 'ev:L1/cured', kind: 'Repayment', at: DATE '2026-10-20'}),
// concepts — what a path is an instance of, organised broader and narrower (SKOS)
 (k_life:Concept {id: 'concept:loan-life', label: 'a loan from request to close'}),
 (k_orig:Concept {id: 'concept:origination', label: 'getting a loan agreed'}),
 (k_serv:Concept {id: 'concept:servicing', label: 'running a loan'}),
 (k_arr:Concept {id: 'concept:arrears-episode', label: 'falling behind and recovering'}),
 (k_orig)-[:BROADER]->(k_life), (k_serv)-[:BROADER]->(k_life), (k_arr)-[:BROADER]->(k_serv),
// paths — nodes whose ordered steps are facts, or paths one altitude down
 (life:Path {id: 'path:L3/life', altitude: 3, name: 'Loan L3, start to finish', ordered_by: 'at'}),
 (orig:Path {id: 'path:L3/origination', altitude: 2, name: 'L3 agreed', ordered_by: 'at'}),
 (serv:Path {id: 'path:L3/servicing', altitude: 2, name: 'L3 drawn, fell behind, paid out', ordered_by: 'at'}),
 (arr3:Path {id: 'path:L3/arrears-nov', altitude: 1, name: 'L3 in arrears, November', ordered_by: 'at'}),
 (arr1:Path {id: 'path:L1/arrears-oct', altitude: 1, name: 'L1 in arrears, October', ordered_by: 'at'}),
 (life)-[:STEP {seq: 1}]->(orig), (life)-[:STEP {seq: 2}]->(serv),
 (orig)-[:STEP {seq: 1}]->(request), (orig)-[:STEP {seq: 2}]->(offer), (orig)-[:STEP {seq: 3}]->(sign),
 (serv)-[:STEP {seq: 1}]->(drawdown), (serv)-[:STEP {seq: 2}]->(arr3), (serv)-[:STEP {seq: 3}]->(payout),
 (arr3)-[:STEP {seq: 1}]->(missed), (arr3)-[:STEP {seq: 2}]->(grace), (arr3)-[:STEP {seq: 3}]->(dint),
 (arr1)-[:STEP {seq: 1}]->(l1missed), (arr1)-[:STEP {seq: 2}]->(l1cured),
 (life)-[:INSTANCE_OF]->(k_life), (orig)-[:INSTANCE_OF]->(k_orig), (serv)-[:INSTANCE_OF]->(k_serv),
 (arr3)-[:INSTANCE_OF]->(k_arr), (arr1)-[:INSTANCE_OF]->(k_arr)
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: paths-and-altitude
title: Paths and altitude — lift, zoom and view at a level
kind: graphs
rounds:
  - name: loan L3 at four altitudes
    documents: ["Altitude test — loan L3 at four altitudes"]
    rules: [paths]
    expect:
      lift:
        - {test: A1, from: "ev:L3/grace", chain: ["path:L3/arrears-nov", "path:L3/servicing", "path:L3/life"]}
      views:
        test: A2
        top: "path:L3/life"
        of:
          2: ["path:L3/origination", "path:L3/servicing"]
          1: ["ev:L3/request", "ev:L3/offer", "ev:L3/sign", "ev:L3/drawdown", "path:L3/arrears-nov", "ev:L3/payout"]
          0: ["ev:L3/request", "ev:L3/offer", "ev:L3/sign", "ev:L3/drawdown", "ev:L3/missed", "ev:L3/grace", "ev:L3/default-interest", "ev:L3/payout"]
      sideways: {test: A3, concept: "concept:arrears-episode", paths: ["path:L1/arrears-oct", "path:L3/arrears-nov"]}
      concept_lift: {test: A4, from: "concept:arrears-episode", chain: ["concept:servicing", "concept:loan-life"]}
    mutations:
      - {test: A5, name: "a path that contains a path above it", document: "Altitude test — loan L3 at four altitudes", append: ",\n (arr3)-[:STEP {seq: 4}]->(serv)"}
      - {test: A6, name: "a gap in a path's steps", document: "Altitude test — loan L3 at four altitudes", replace: "(orig)-[:STEP {seq: 3}]->(sign)", with: "(orig)-[:STEP {seq: 4}]->(sign)"}
      - {test: A7, name: "a path that never reaches a fact", document: "Altitude test — loan L3 at four altitudes", append: ",\n (empty:Path {id: 'path:L3/nothing', altitude: 1, name: 'nothing yet'})"}
      - {test: A8, name: "facts under a path out of time order", document: "Altitude test — loan L3 at four altitudes", replace: "(arr3)-[:STEP {seq: 1}]->(missed), (arr3)-[:STEP {seq: 2}]->(grace)", with: "(arr3)-[:STEP {seq: 2}]->(missed), (arr3)-[:STEP {seq: 1}]->(grace)"}
```
