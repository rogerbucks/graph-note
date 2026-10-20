---
created: 2026-10-04T21:08
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P1 — loan process, operations view]]"
    type: RELATED_TO
    direction: out
---

# Join test P2 — loan process, collections view

**A test document, not a process anyone runs.** Collections' view of the loan process. Operations' view, with every planted condition listed, is [[Join test P1 — loan process, operations view]]. Result: [[Graph spec conformance — report]].

## The graph

```gql
// graph: process · document doc:join-test-p2 · schema process@3 · as of 2026-10-15
INSERT
 (agreed:State {id: 'loan/agreed', flow: 'loan', initial: TRUE}),
 (offered:State {id: 'loan/offered', flow: 'loan'}),
 (declined:State {id: 'loan/declined', flow: 'loan', final: TRUE}),
 (active:State {id: 'loan/active', flow: 'loan'}),
 (in_arrears:State {id: 'loan/in_arrears', flow: 'loan'}),
 (closing:State {id: 'loan/closing', flow: 'loan'}),
 (repaid:State {id: 'loan/repaid', flow: 'loan'}),
 (written_off:State {id: 'loan/written_off', flow: 'loan', final: TRUE}),
 (offered)-[:TRANSITION {event: 'Withdraw', trigger: 'request'}]->(declined),
 (agreed)-[:TRANSITION {event: 'Drawdown', trigger: 'ledger'}]->(active),
 (active)-[:TRANSITION {event: 'Payment', trigger: 'ledger', guard: 'balance_after > 0'}]->(active),
 (active)-[:TRANSITION {event: 'Payment', trigger: 'ledger', guard: 'balance_after = 0'}]->(closing),
 (closing)-[:TRANSITION {event: 'Settle', trigger: 'ledger'}]->(repaid),
 (active)-[:TRANSITION {event: 'InterestCharge', trigger: 'schedule'}]->(active),
 (active)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_borrower'}]->(in_arrears),
 (in_arrears)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(written_off),
 (in_arrears)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_lender'}]->(declined),
 (repaid)-[:TRANSITION {event: 'Reopen', trigger: 'decision'}]->(active)
```
