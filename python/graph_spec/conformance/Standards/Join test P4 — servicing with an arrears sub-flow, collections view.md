---
created: 2026-10-04T22:23
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P3 — servicing with an arrears sub-flow, operations view]]"
    type: RELATED_TO
    direction: out
---

# Join test P4 — servicing with an arrears sub-flow, collections view

**A test document, not a process anyone runs.** Collections' view of the loan with an arrears sub-flow. Operations' view, with every planted condition listed, is [[Join test P3 — servicing with an arrears sub-flow, operations view]]. Result: [[Graph spec conformance — report]].

## The graph

```gql
// graph: process · document doc:join-test-p4 · schema process@4 · as of 2026-10-15
INSERT
 (agreed:State {id: 'loan/agreed', flow: 'loan'}),
 (servicing:State {id: 'loan/servicing', flow: 'loan'}),
 (agreed)-[:TRANSITION {event: 'Drawdown', trigger: 'ledger'}]->(servicing),
 (servicing)-[:TRANSITION {event: 'InterestCharge', trigger: 'schedule'}]->(servicing),
 (watch:State {id: 'arrears/watch', flow: 'arrears', initial: TRUE}),
 (current:State {id: 'arrears/current', flow: 'arrears'}),
 (overdue:State {id: 'arrears/overdue', flow: 'arrears'}),
 (ended:State {id: 'arrears/ended', flow: 'arrears', final: TRUE}),
 (servicing)-[:DETAILED_IN]->(watch),
 (watch)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_borrower'}]->(overdue),
 (current)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0'}]->(current),
 (current)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(current),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'else'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(ended)
```
