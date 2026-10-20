---
created: 2026-10-04T22:23
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P4 — servicing with an arrears sub-flow, collections view]]"
    type: RELATED_TO
    direction: out
---

# Join test P3 — servicing with an arrears sub-flow, operations view

**A test document, not a process anyone runs.** The loan process with arrears handled as a sub-flow of *servicing* (§16 of [[Graph spec model]]). This is operations' view; collections' view is [[Join test P4 — servicing with an arrears sub-flow, collections view]]. Joined under §21, the result must keep §7 and §16's four sub-flow rules. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Operations (P3) | Collections (P4) | Expected outcome |
|---|---|---|---|
| S1 | servicing opens into arrears at *current* | the same, and the same transitions | agreed |
| S2 | while overdue, a part-payment that does not clear arrears stays overdue | the same, written as `else` | paradox: an `else` in the sub-flow swallows *paid in full*, which servicing handles (§16 rule 3) |
| S3 | arrears starts at *current* | arrears starts at *watch* | paradox twice: two start states in one sub-flow, and servicing opening at two places |
| S4 | — | a write-off ends the sub-flow, but P4 has no `done` on servicing | invalid in P4 alone (§16 rule 4) — excluded; P3's own write-off stays |
| S5 | a self-transition on servicing for interest | the same | agreed — it must never restart the sub-flow (§16 rule 2) |

## The graph

```gql
// graph: process · document doc:join-test-p3 · schema process@4 · as of 2026-10-01
INSERT
 (new:State {id: 'loan/new', flow: 'loan', initial: TRUE}),
 (agreed:State {id: 'loan/agreed', flow: 'loan'}),
 (servicing:State {id: 'loan/servicing', flow: 'loan'}),
 (repaid:State {id: 'loan/repaid', flow: 'loan', final: TRUE}),
 (written_off:State {id: 'loan/written_off', flow: 'loan', final: TRUE}),
 (new)-[:TRANSITION {event: 'Sign', trigger: 'decision'}]->(agreed),
 (agreed)-[:TRANSITION {event: 'Drawdown', trigger: 'ledger'}]->(servicing),
 (servicing)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after = 0'}]->(repaid),
 (servicing)-[:TRANSITION {event: 'InterestCharge', trigger: 'schedule'}]->(servicing),
 (servicing)-[:TRANSITION {event: 'done', trigger: 'subflow'}]->(written_off),
 (current:State {id: 'arrears/current', flow: 'arrears', initial: TRUE}),
 (overdue:State {id: 'arrears/overdue', flow: 'arrears'}),
 (ended:State {id: 'arrears/ended', flow: 'arrears', final: TRUE}),
 (servicing)-[:DETAILED_IN]->(current),
 (current)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0'}]->(current),
 (current)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(current),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and not arrears_cleared'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(ended)
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: sub-flows
title: Two process views with sub-flows
documents: ["Join test P3 — servicing with an arrears sub-flow, operations view", "Join test P4 — servicing with an arrears sub-flow, collections view"]
configuration: subflow
rounds:
  - name: as written
    expect:
      report:
        - [constraint, "arrears/overdue", TRANSITION, S2]
        - [constraint, "loan/servicing", TRANSITION, S2]
        - [too-many, "loan/servicing", DETAILED_IN, S3]
        - [too-many, "loan/servicing", DETAILED_IN, S3]
        - [constraint, "arrears/current", initial, S3]
        - [constraint, "arrears/watch", initial, S3]
        - [invalid, "arrears/overdue", TRANSITION, S4]
      edges:
        - {test: S1, from: "arrears/current", type: TRANSITION, to: "arrears/overdue", id: [InstalmentMissed, null], stated_in: ["doc:join-test-p3", "doc:join-test-p4"]}
        - {test: S4, from: "arrears/overdue", type: TRANSITION, to: "arrears/ended", id: [WriteOff, null], stated_in: ["doc:join-test-p3"]}
        - {test: S5, from: "loan/servicing", type: TRANSITION, to: "loan/servicing", id: [InterestCharge, null], stated_in: ["doc:join-test-p3", "doc:join-test-p4"]}
  - name: after the process owner's findings
    findings:
      - {id: "finding:K1", kind: process owner, confirms: "claim:join/loan/servicing/DETAILED_IN-arrears/current@join-test-p3", refutes: ["claim:join/loan/servicing/DETAILED_IN-arrears/watch@join-test-p4"]}
      - {id: "finding:K2", kind: process owner, confirms: "claim:join/arrears/current/initial=true@join-test-p3", refutes: ["claim:join/arrears/watch/initial=true@join-test-p4"]}
      - {id: "finding:K3", kind: process owner, confirms: "claim:join/loan/servicing/TRANSITION-loan/repaid/Repayment;balance_after = 0@join-test-p3", refutes: ["claim:join/arrears/overdue/TRANSITION-arrears/overdue/Repayment;else@join-test-p4"]}
    expect:
      runs:
        - {test: S1, events: [[Sign], [Drawdown]], ends_in: ["loan/servicing", "arrears/current"]}
        - {test: S2, events: [[Sign], [Drawdown], [InstalmentMissed], [Repayment, {balance_after: 0, arrears_cleared: true}]], ends_in: ["loan/repaid"]}
        - {test: S5, events: [[Sign], [Drawdown], [InstalmentMissed], [InterestCharge]], ends_in: ["loan/servicing", "arrears/overdue"]}
        - {test: S4, events: [[Sign], [Drawdown], [InstalmentMissed], [WriteOff]], ends_in: ["loan/written_off"], actions: [alert_both, notify_both]}
      unreachable: {test: S3, states: ["arrears/watch"]}
```
