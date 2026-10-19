---
created: 2026-10-04T21:08
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test A — lender's notes]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Join test A3 — borrower's edit of the lender's notes]]"
    type: RELATED_TO
    direction: out
---

# Join test A2 — lender's notes, revised

**A test document, not a record.** All figures are invented. Alice's own revision of [[Join test A — lender's notes]], made on 1 Nov 2026. Meanwhile Bob edited his own copy of the same original: [[Join test A3 — borrower's edit of the lender's notes]]. The two revisions are joined from their common earlier version under §21 of [[Graph spec model]]. Result: [[Graph spec conformance — report]].

## What this revision changed from the original

| Test | Change in A2 | Change in A3 | Expected outcome |
|---|---|---|---|
| T1 | R2 corrected to 24,000 cents | — | A2's change kept; **a two-way join would wrongly call this a conflict** |
| T2 | the fee removed | — | removed; **a two-way join would wrongly keep it** |
| T3 | the kitchen no longer part of the renovation | — | removed |
| T4 | principal 160,000 | principal 155,000 | both changed, differently — contested |
| T5 | drawdown date removed | drawdown date changed to 8 Sep | removed in one, changed in the other — contested |
| T6 | R3 added | — | added |
| T7 | R4 added, 5,000 cents | R4 added, 5,000 cents | agreed |
| T8 | R5 added, 3,000 cents | R5 added, 3,500 cents | both added, differently — contested |
| T9 | — | Alice's name now *Alice Tan* | A3's change kept |
| T10 | employer unchanged | employer unchanged | no change — the copied value keeps the original's date |
| T11 | decision D3 deleted, with its supersession | D3 retitled *at 4.5%* | removed in one, changed in the other — **the deletion is contested, not applied**; D3 is kept as A3 has it until a finding decides |
| T12 | the broker link to Harbour Lending deleted | its fee share changed from 10 to 12 | the same rule for a relationship — the deletion contested, not applied; the link kept as A3 has it, its fee share contested |

## The graph

```gql
// graph: notes · document doc:join-test-a2 · schema ledger@8 · as of 2026-11-01 · revision of doc:join-test-a
INSERT
 (alice:Party:Person {id: 'person:alice', name: 'Alice', customer_since: '2018', employer: 'org:quay'}),
 (bob:Party:Person {id: 'person:bob', name: 'Bob Ng'}),
 (quay:Party:Organisation {id: 'org:quay', name: 'Quay Freight'}),
 (harbour:Party:Organisation {id: 'org:harbour', name: 'Harbour Lending'}),
 (l1:Loan {id: 'loan:L1', principal_cents: 160000, currency: 'AUD'}),
 (l1)-[:LENDER]->(alice),
 (l1)-[:BORROWER]->(bob),
 (r2:Event:Repayment {id: 'R2', amount_cents: 24000, at: DATE '2026-09-30'}),
 (r2)-[:REPAYS]->(l1),
 (r3:Event:Repayment {id: 'R3', amount_cents: 10000, at: DATE '2026-10-31'}),
 (r3)-[:REPAYS]->(l1),
 (r4:Event:Repayment {id: 'R4', amount_cents: 5000, at: DATE '2026-11-01'}),
 (r4)-[:REPAYS]->(l1),
 (r5:Event:Repayment {id: 'R5', amount_cents: 3000, at: DATE '2026-11-02'}),
 (r5)-[:REPAYS]->(l1),
 (reno:Project {id: 'project:renovation', name: 'Renovation'}),
 (kitchen:Project {id: 'project:kitchen', name: 'Kitchen'}),
 (deck:Project {id: 'project:deck', name: 'Deck'}),
 (garden:Project {id: 'project:garden', name: 'Garden'}),
 (deck)-[:PART_OF]->(garden),
 (d1:Decision {id: 'decision:D1', title: 'Lend $1,500'})
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: two-revisions
title: Two revisions of one earlier version
base: "Join test A — lender's notes"
documents: ["Join test A2 — lender's notes, revised", "Join test A3 — borrower's edit of the lender's notes"]
configuration: ledger
rounds:
  - name: as written
    expect:
      report:
        - [time, "person:alice", EMPLOYED_BY, T10]
        - [time, "person:alice", EMPLOYED_BY, T10]
        - [time, "person:alice", EMPLOYED_BY, T10]
        - [one-side-change, "R2", amount_cents, T1]
        - [one-side-removal, "loan:L1", fee_cents, T2]
        - [one-side-removal, "project:kitchen", edge, T3]
        - [both-differ, "loan:L1", principal_cents, T4]
        - [remove-v-change, "loan:L1", drawn_at, T5]
        - [one-side-addition, "R3", node, T6]
        - [one-side-addition, "R3", edge, T6]
        - [both-same, "R4", node, T7]
        - [both-same, "R4", edge, T7]
        - [both-same, "R5", node, T8]
        - [both-same, "R5", edge, T8]
        - [both-differ, "R5", amount_cents, T8]
        - [one-side-change, "person:alice", name, T9]
        - [delete-v-change, "decision:D3", node, T11]
        - [remove-v-change, "decision:D3", title, T11]
        - [delete-v-change, "loan:L1", edge, T12]
        - [remove-v-change, "loan:L1", ARRANGED_BY fee_share, T12]
      claims: 14
      contradicts: 7
      asserted:
        - {test: T1, element: "R2", property: amount_cents, value: 24000}
        - {test: T9, element: "person:alice", property: name, value: Alice Tan}
        - {test: T7, element: "R4", property: amount_cents, value: 5000}
      absent:
        - {test: T2, element: "loan:L1", property: fee_cents}
        - {test: T4, element: "loan:L1", property: principal_cents}
        - {test: T11, element: "decision:D3", property: title}
      nodes: [{test: T11, present: ["decision:D3"]}, {test: T6, present: ["R3"]}]
      edges:
        - {test: T3, from: "project:kitchen", type: PART_OF, to: "project:renovation", present: false}
        - {test: T10, from: "person:alice", type: EMPLOYED_BY, to: "org:quay", props: {as_of: 2026-10-01}}
        - {test: T11, from: "decision:D3", type: SUPERSEDES, to: "decision:D1"}
        - {test: T12, from: "loan:L1", type: ARRANGED_BY, to: "org:harbour", absent_props: [fee_share]}
  - name: after findings
    findings:
      - {id: "finding:G1", kind: signed variation, confirms: "claim:join/loan:L1/principal_cents=160000@join-test-a2", refutes: ["claim:join/loan:L1/principal_cents=155000@join-test-a3"]}
      - {id: "finding:G2", kind: bank statement, confirms: "claim:join/loan:L1/drawn_at=2026-09-08@join-test-a3", refutes: ["claim:join/loan:L1/drawn_at=removed@join-test-a2"]}
      - {id: "finding:G3", kind: bank statement, confirms: "claim:join/R5/amount_cents=3500@join-test-a3", refutes: ["claim:join/R5/amount_cents=3000@join-test-a2"]}
      - {id: "finding:G4", kind: decision register, confirms: "claim:join/decision:D3/exists=removed@join-test-a2", refutes: ["claim:join/decision:D3/exists=kept@join-test-a3", "claim:join/decision:D3/title=Lend $1,500 at 4.5%@join-test-a3"]}
      - {id: "finding:G5", kind: decision register, confirms: "claim:join/decision:D3/title=removed@join-test-a2", refutes: []}
      - {id: "finding:G6", kind: broker agreement, confirms: "claim:join/loan:L1/ARRANGED_BY-org:harbour//exists=kept@join-test-a3", refutes: ["claim:join/loan:L1/ARRANGED_BY-org:harbour//exists=removed@join-test-a2"]}
      - {id: "finding:G7", kind: broker agreement, confirms: "claim:join/loan:L1/ARRANGED_BY-org:harbour//fee_share=12@join-test-a3", refutes: ["claim:join/loan:L1/ARRANGED_BY-org:harbour//fee_share=removed@join-test-a2"]}
    expect:
      statuses: {confirmed: 7, refuted: 9}
      figures:
        - {test: T4, figure: loan-balance, of: "loan:L1", result: ok, value: 117500, currency: AUD}
      nodes: [{test: T11, absent: ["decision:D3"]}]
      about_removed: {test: T11, count: 6}
      edges:
        - {test: T11, from: "decision:D3", type: SUPERSEDES, to: "decision:D1", present: false}
        - {test: T12, from: "loan:L1", type: ARRANGED_BY, to: "org:harbour", props: {fee_share: 12}}
```
