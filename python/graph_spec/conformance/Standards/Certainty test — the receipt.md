---
created: 2026-10-04T23:44
modified: 2026-10-04T23:44
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Certainty test — claims about loan L2]]"
    type: RELATED_TO
    direction: out
---

# Certainty test — the receipt

**A test document, not a record.** The receipt for the $200 cash payment claimed in [[Certainty test — claims about loan L2]]. It records the payment as a fact that confirms the claim, and updates the claim's status in the same transaction (§11). Nothing in the earlier document is edited. Result: [[Graph spec conformance — report]].

```gql
// graph: credit · SOURCE · addition — the receipt for claim C1
MATCH (l2:Loan {id: 'loan:L2'}), (carol:Person {id: 'person:carol'}), (c1:Claim {id: 'claim:C1'})
INSERT (r3:Event:Repayment {id: 'R3', amount_cents: 20000, at: DATETIME '2026-11-03T12:00:00+10:00', recorded_at: DATETIME '2026-11-10T16:00:00+10:00'}),
 (r3)-[:REPAYS]->(l2),
 (r3)-[:PAID_BY]->(carol),
 (r3)-[:CONFIRMS]->(c1)
SET c1.status = 'confirmed'
```
