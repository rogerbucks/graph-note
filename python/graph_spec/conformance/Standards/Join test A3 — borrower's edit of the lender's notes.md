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
  - target: "[[Standards/Join test A2 — lender's notes, revised]]"
    type: RELATED_TO
    direction: out
---

# Join test A3 — borrower's edit of the lender's notes

**A test document, not a record.** All figures are invented. Bob's edit of his copy of [[Join test A — lender's notes]], made on 3 Nov 2026, independently of Alice's own revision, [[Join test A2 — lender's notes, revised]], which lists every planted change. Result: [[Graph spec conformance — report]].

## The graph

```gql
// graph: notes · document doc:join-test-a3 · schema ledger@8 · as of 2026-11-03 · revision of doc:join-test-a
INSERT
 (alice:Party:Person {id: 'person:alice', name: 'Alice Tan', customer_since: '2018', employer: 'org:quay'}),
 (bob:Party:Person {id: 'person:bob', name: 'Bob Ng'}),
 (quay:Party:Organisation {id: 'org:quay', name: 'Quay Freight'}),
 (harbour:Party:Organisation {id: 'org:harbour', name: 'Harbour Lending'}),
 (l1:Loan {id: 'loan:L1', principal_cents: 155000, currency: 'AUD', fee_cents: 1500, drawn_at: DATE '2026-09-08'}),
 (l1)-[:LENDER]->(alice),
 (l1)-[:BORROWER]->(bob),
 (l1)-[:ARRANGED_BY {fee_share: 12}]->(harbour),
 (r2:Event:Repayment {id: 'R2', amount_cents: 25000, at: DATE '2026-09-30'}),
 (r2)-[:REPAYS]->(l1),
 (r4:Event:Repayment {id: 'R4', amount_cents: 5000, at: DATE '2026-11-01'}),
 (r4)-[:REPAYS]->(l1),
 (r5:Event:Repayment {id: 'R5', amount_cents: 3500, at: DATE '2026-11-02'}),
 (r5)-[:REPAYS]->(l1),
 (reno:Project {id: 'project:renovation', name: 'Renovation'}),
 (kitchen:Project {id: 'project:kitchen', name: 'Kitchen'}),
 (kitchen)-[:PART_OF]->(reno),
 (deck:Project {id: 'project:deck', name: 'Deck'}),
 (garden:Project {id: 'project:garden', name: 'Garden'}),
 (deck)-[:PART_OF]->(garden),
 (d1:Decision {id: 'decision:D1', title: 'Lend $1,500'}),
 (d3:Decision {id: 'decision:D3', title: 'Lend $1,500 at 4.5%'}),
 (d3)-[:SUPERSEDES {why: 'rate agreed'}]->(d1)
```
