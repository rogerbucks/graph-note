---
created: 2026-10-04T20:53
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test B — borrower's notes]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Join test A — lender's notes

**A test document, not a record.** All people, organisations and figures are invented. This is one of two documents written to be joined under §21 of [[Graph spec model]], each valid on its own, with failure conditions planted between them. Its partner is [[Join test B — borrower's notes]]. The generated result is [[Graph spec conformance — report]].

This document is the lender's view: current schema (`ledger@8`, money in cents), as of 1 Oct 2026.

## Planted conditions

| Test | What this document says | What the other says | Expected outcome |
|---|---|---|---|
| J1 | loan principal 150,000 cents | 1,500.00 dollars | agreed, after restating units |
| J2 | Alice works for Quay Freight, as of 1 Oct | Pier Logistics, as of 20 Oct | no conflict, after restating over time |
| J3 | Alice a customer since 2018 | since 12 Jun 2018 | refined to the more precise date |
| J4 | the loan is in AUD | NZD | contested; the balance reports itself incomplete |
| J5 | Harbour Lending is an organisation | a person | identity contested |
| J6 | the borrower is `person:bob`, Bob Ng | `person:robert`, Bob Ng | flagged as a possible duplicate, never merged by itself |
| J6a | one borrower | a different borrower id | paradox: a loan with two borrowers |
| J7 | the kitchen is part of the renovation | the renovation is part of the kitchen | paradox: a containment cycle |
| J8 | D3 supersedes D1 | D4 supersedes D1 | paradox: two successors |
| J9 | drawn down on 10 Sep | a repayment on 5 Sep | paradox: repaid before it was drawn |
| J10 | a fee of 1,500 cents | a fee of 15.00, in a field no unit map covers | flagged as undeclared, never silently doubled |
| J12 | the deck is part of the garden | the garden is part of the yard (B); the yard is part of the deck ([[Join test C — broker's notes]]) | no paradox in any pair; a three-way cycle once all three are joined |

## The graph

```gql
// graph: notes · document doc:join-test-a · schema ledger@8 · as of 2026-10-01
INSERT
 (alice:Party:Person {id: 'person:alice', name: 'Alice', customer_since: '2018', employer: 'org:quay'}),
 (bob:Party:Person {id: 'person:bob', name: 'Bob Ng'}),
 (quay:Party:Organisation {id: 'org:quay', name: 'Quay Freight'}),
 (harbour:Party:Organisation {id: 'org:harbour', name: 'Harbour Lending'}),
 (l1:Loan {id: 'loan:L1', principal_cents: 150000, currency: 'AUD', fee_cents: 1500, drawn_at: DATE '2026-09-10'}),
 (l1)-[:LENDER]->(alice),
 (l1)-[:BORROWER]->(bob),
 (l1)-[:ARRANGED_BY {fee_share: 10}]->(harbour),
 (r2:Event:Repayment {id: 'R2', amount_cents: 25000, at: DATE '2026-09-30'}),
 (r2)-[:REPAYS]->(l1),
 (reno:Project {id: 'project:renovation', name: 'Renovation'}),
 (kitchen:Project {id: 'project:kitchen', name: 'Kitchen'}),
 (kitchen)-[:PART_OF]->(reno),
 (deck:Project {id: 'project:deck', name: 'Deck'}),
 (garden:Project {id: 'project:garden', name: 'Garden'}),
 (deck)-[:PART_OF]->(garden),
 (d1:Decision {id: 'decision:D1', title: 'Lend $1,500'}),
 (d3:Decision {id: 'decision:D3', title: 'Lend $1,500 at 4%'}),
 (d3)-[:SUPERSEDES {why: 'rate agreed'}]->(d1)
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: two-documents
title: Two documents, planted failures
documents: ["Join test A — lender's notes", "Join test B — borrower's notes"]
configuration: ledger
rounds:
  - name: as written
    expect:
      report:
        - [unit, "loan:L1", principal_cents, J1]
        - [unit, "R1", amount_cents, J1]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [refine, "person:alice", customer_since, J3]
        - [value, "loan:L1", currency, J4]
        - [identity, "org:harbour", labels, J5]
        - [duplicate, "person:bob, person:robert", name, J6]
        - [too-many, "loan:L1", BORROWER, J6a]
        - [too-many, "loan:L1", BORROWER, J6a]
        - [cycle, "project:kitchen", PART_OF, J7]
        - [cycle, "project:renovation", PART_OF, J7]
        - [too-many, "decision:D3", SUPERSEDES, J8]
        - [too-many, "decision:D4", SUPERSEDES, J8]
        - [constraint, "R1", at, J9]
        - [constraint, "loan:L1", drawn_at, J9]
        - [undeclared, "loan:L1", fee, J10]
        - [invalid, "project:shed", PART_OF, J11]
      claims: 12
      contradicts: 6
      paradoxes: 0
      statuses: {contested: 12}
      asserted:
        - {test: J1, element: "loan:L1", property: principal_cents, value: 150000}
        - {test: J3, element: "person:alice", property: customer_since, value: "2018-06-12"}
        - {test: J10, element: "loan:L1", property: fee, value: 15.0}
        - {test: J10, element: "loan:L1", property: fee_cents, value: 1500}
      absent:
        - {test: J4, element: "loan:L1", property: currency}
        - {test: J9, element: "loan:L1", property: drawn_at}
      nodes: [{test: J6, present: ["person:bob", "person:robert"]}]
      edges:
        - {test: J2, from: "person:alice", type: EMPLOYED_BY, to: "org:quay", props: {as_of: 2026-10-01}}
        - {test: J2, from: "person:alice", type: EMPLOYED_BY, to: "org:pier", props: {as_of: 2026-10-20}}
        - {test: J11, from: "project:shed", type: PART_OF, to: "project:shed", present: false}
      figures:
        - {test: J4, figure: loan-balance, of: "loan:L1", result: incomplete}
  - name: after investigation
    configuration_changes:
      unit_maps: {ledger@1: {fee: [fee_cents, 100]}}
      id_map: {"person:robert": "person:bob"}
    findings:
      - {id: "finding:F1", kind: signed loan agreement, confirms: "claim:join/loan:L1/currency=AUD@join-test-a", refutes: ["claim:join/loan:L1/currency=NZD@join-test-b"]}
      - {id: "finding:F2", kind: company register, confirms: "claim:join/org:harbour/label/Organisation@join-test-a", refutes: ["claim:join/org:harbour/label/Person@join-test-b"]}
      - {id: "finding:F3", kind: project plan, confirms: "claim:join/project:kitchen/PART_OF-project:renovation@join-test-a", refutes: ["claim:join/project:renovation/PART_OF-project:kitchen@join-test-b"]}
      - {id: "finding:F4", kind: bank statement, confirms: "claim:join/R1/at=2026-09-05@join-test-b", refutes: ["claim:join/loan:L1/drawn_at=2026-09-10@join-test-a"]}
    expect:
      report:
        - [id, "person:robert", id, J6]
        - [unit, "loan:L1", principal_cents, J1]
        - [unit, "R1", amount_cents, J1]
        - [unit, "loan:L1", fee_cents, J10]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [refine, "person:alice", customer_since, J3]
        - [value, "loan:L1", currency, J4]
        - [identity, "org:harbour", labels, J5]
        - [cycle, "project:kitchen", PART_OF, J7]
        - [cycle, "project:renovation", PART_OF, J7]
        - [too-many, "decision:D3", SUPERSEDES, J8]
        - [too-many, "decision:D4", SUPERSEDES, J8]
        - [constraint, "R1", at, J9]
        - [constraint, "loan:L1", drawn_at, J9]
        - [invalid, "project:shed", PART_OF, J11]
      statuses: {confirmed: 4, refuted: 4, contested: 2}
      nodes: [{test: J6, absent: ["person:robert"]}]
      asserted:
        - {test: J10, element: "loan:L1", property: fee_cents, value: 1500}
      absent:
        - {test: J10, element: "loan:L1", property: fee}
      figures:
        - {test: J4, figure: loan-balance, of: "loan:L1", result: ok, value: 100000, currency: AUD}
```
