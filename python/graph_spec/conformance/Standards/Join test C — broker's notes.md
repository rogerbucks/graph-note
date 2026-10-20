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
  - target: "[[Standards/Join test B — borrower's notes]]"
    type: RELATED_TO
    direction: out
---

# Join test C — broker's notes

**A test document, not a record.** All people, organisations and figures are invented. This is the third document for joining under §21 of [[Graph spec model]], together with [[Join test A — lender's notes]] and [[Join test B — borrower's notes]]. The generated result is [[Graph spec conformance — report]].

The broker's view: current schema (`ledger@8`), as of 25 Oct 2026.

## Planted conditions — three documents at once

| Test | What this document says | What A and B say | Expected outcome |
|---|---|---|---|
| N1 | the loan is in AUD | A: AUD · B: NZD | two claims; AUD is stated in two documents, NZD in one — visible, but not decisive |
| N2 | Alice a customer since 2017 | A: 2018 · B: 12 Jun 2018 | three claims; 2017 contradicts both, while 2018 and 12 Jun 2018 do not contradict each other |
| N3 | Harbour Lending is an organisation | A: an organisation · B: a person | two claims, the organisation one stated in two documents |
| J12 | the yard is part of the deck | A: deck in garden · B: garden in yard | no paradox in any pair; a cycle of three once all three are joined — held as one paradox, since no two of the three clash |

## The graph

```gql
// graph: notes · document doc:join-test-c · schema ledger@8 · as of 2026-10-25
INSERT
 (alice:Party:Person {id: 'person:alice', name: 'Alice', customer_since: '2017'}),
 (harbour:Party:Organisation {id: 'org:harbour', name: 'Harbour Lending'}),
 (l1:Loan {id: 'loan:L1', principal_cents: 150000, currency: 'AUD'}),
 (l1)-[:LENDER]->(alice),
 (l1)-[:ARRANGED_BY]->(harbour),
 (yard:Project {id: 'project:yard', name: 'Yard'}),
 (deck:Project {id: 'project:deck', name: 'Deck'}),
 (yard)-[:PART_OF]->(deck)
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: three-documents
title: Three documents at once
documents: ["Join test A — lender's notes", "Join test B — borrower's notes", "Join test C — broker's notes"]
configuration: ledger
rounds:
  - name: as written
    expect:
      report:
        - [unit, "loan:L1", principal_cents, J1]
        - [unit, "R1", amount_cents, J1]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [time, "person:alice", EMPLOYED_BY, J2]
        - [value, "loan:L1", currency, N1]
        - [value, "person:alice", customer_since, N2]
        - [identity, "org:harbour", labels, N3]
        - [duplicate, "person:bob, person:robert", name, J6]
        - [too-many, "loan:L1", BORROWER, J6a]
        - [too-many, "loan:L1", BORROWER, J6a]
        - [cycle, "project:kitchen", PART_OF, J7]
        - [cycle, "project:renovation", PART_OF, J7]
        - [cycle, "project:deck", PART_OF, J12]
        - [cycle, "project:garden", PART_OF, J12]
        - [cycle, "project:yard", PART_OF, J12]
        - [too-many, "decision:D3", SUPERSEDES, J8]
        - [too-many, "decision:D4", SUPERSEDES, J8]
        - [constraint, "R1", at, J9]
        - [constraint, "loan:L1", drawn_at, J9]
        - [undeclared, "loan:L1", fee, J10]
        - [invalid, "project:shed", PART_OF, J11]
      paradox_sizes: [3]
      claim_details:
        - {test: N1, element: "loan:L1", property: currency, value: AUD, stated_in: ["doc:join-test-a", "doc:join-test-c"], confidence: moderate}
        - {test: N1, element: "loan:L1", property: currency, value: NZD, stated_in: ["doc:join-test-b"], confidence: low}
        - {test: N3, element: "org:harbour", label: Organisation, stated_in: ["doc:join-test-a", "doc:join-test-c"]}
        - {test: N3, element: "org:harbour", label: Person, stated_in: ["doc:join-test-b"]}
      linked:
        - {test: N2, element: "person:alice", property: customer_since, values: ["2017", "2018"], linked: true}
        - {test: N2, element: "person:alice", property: customer_since, values: ["2017", "2018-06-12"], linked: true}
        - {test: N2, element: "person:alice", property: customer_since, values: ["2018", "2018-06-12"], linked: false}
      pairs_clean: [{test: J12, elements: ["project:deck", "project:garden", "project:yard"]}]
```
