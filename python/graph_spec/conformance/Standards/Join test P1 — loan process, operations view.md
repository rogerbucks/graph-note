---
created: 2026-10-04T21:08
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P2 — loan process, collections view]]"
    type: RELATED_TO
    direction: out
---

# Join test P1 — loan process, operations view

**A test document, not a process anyone runs.** Two teams have each written down the loan process as they see it. This is operations' view; collections' is [[Join test P2 — loan process, collections view]]. Joined under §21 of [[Graph spec model]], the result must still be a deterministic process (§7). Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Operations (P1) | Collections (P2) | Expected outcome |
|---|---|---|---|
| P1 | the event is called `Repayment` | `Payment` | restated by a declared vocabulary map — no conflict |
| P2 | a missed instalment alerts both parties | alerts the borrower only | the same transition, its action contested |
| P3 | a payment to zero ends in *repaid* | a payment to zero goes to *closing* | paradox: two transitions could fire at once |
| P4 | the process starts at *new* | starts at *agreed* | paradox: two start states |
| P5 | *repaid* is final | *repaid* can be reopened | paradox: a final state with a way out |
| P6 | — | write-off goes to two places, in P2 itself | invalid in P2 alone — excluded |
| P7 | — | a customer can withdraw an offer | added |
| P8 | interest charged leaves an active loan where it is | the same | agreed — one of two transitions from *active* back to itself, told apart only by its event, so a transition is identified by its event and guard as well as its two states |

## The graph

```gql
// graph: process · document doc:join-test-p1 · schema process@3 · as of 2026-10-01
INSERT
 (new:State {id: 'loan/new', flow: 'loan', initial: TRUE}),
 (requested:State {id: 'loan/requested', flow: 'loan'}),
 (offered:State {id: 'loan/offered', flow: 'loan'}),
 (agreed:State {id: 'loan/agreed', flow: 'loan'}),
 (active:State {id: 'loan/active', flow: 'loan'}),
 (in_arrears:State {id: 'loan/in_arrears', flow: 'loan'}),
 (repaid:State {id: 'loan/repaid', flow: 'loan', final: TRUE}),
 (declined:State {id: 'loan/declined', flow: 'loan', final: TRUE}),
 (written_off:State {id: 'loan/written_off', flow: 'loan', final: TRUE}),
 (new)-[:TRANSITION {event: 'Request', trigger: 'request'}]->(requested),
 (requested)-[:TRANSITION {event: 'Offer', trigger: 'decision'}]->(offered),
 (requested)-[:TRANSITION {event: 'Decline', trigger: 'decision'}]->(declined),
 (offered)-[:TRANSITION {event: 'Sign', trigger: 'decision'}]->(agreed),
 (agreed)-[:TRANSITION {event: 'Drawdown', trigger: 'ledger'}]->(active),
 (active)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0'}]->(active),
 (active)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after = 0'}]->(repaid),
 (active)-[:TRANSITION {event: 'InterestCharge', trigger: 'schedule'}]->(active),
 (active)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(in_arrears),
 (in_arrears)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(active),
 (in_arrears)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and not arrears_cleared'}]->(in_arrears),
 (in_arrears)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after = 0'}]->(repaid),
 (in_arrears)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(written_off)
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: two-process-views
title: Two views of a process
documents: ["Join test P1 — loan process, operations view", "Join test P2 — loan process, collections view"]
configuration: process
rounds:
  - name: as written
    expect:
      report:
        - [vocab, "loan/active", TRANSITION event, P1]
        - [vocab, "loan/active", TRANSITION event, P1]
        - [attribute, "loan/active", TRANSITION do, P2]
        - [nondeterministic, "loan/active", TRANSITION, P3]
        - [nondeterministic, "loan/active", TRANSITION, P3]
        - [constraint, "loan/agreed", initial, P4]
        - [constraint, "loan/new", initial, P4]
        - [constraint, "loan/repaid", final, P5]
        - [constraint, "loan/repaid", TRANSITION, P5]
        - [invalid, "loan/in_arrears", TRANSITION, P6]
        - [invalid, "loan/in_arrears", TRANSITION, P6]
      claims: 8
      contradicts: 4
      edges:
        - {test: P1, from: "loan/active", type: TRANSITION, to: "loan/active", id: [Repayment, "balance_after > 0"], stated_in: ["doc:join-test-p1", "doc:join-test-p2"]}
        - {test: P7, from: "loan/offered", type: TRANSITION, to: "loan/declined", id: [Withdraw, null]}
        - {test: P8, from: "loan/active", type: TRANSITION, to: "loan/active", id: [InterestCharge, null], stated_in: ["doc:join-test-p1", "doc:join-test-p2"]}
        - {test: P3, from: "loan/active", type: TRANSITION, to: "loan/repaid", id: [Repayment, "balance_after = 0"], present: false}
        - {test: P3, from: "loan/active", type: TRANSITION, to: "loan/closing", id: [Repayment, "balance_after = 0"], present: false}
      absent:
        - {test: P4, element: "loan/new", property: initial}
        - {test: P4, element: "loan/agreed", property: initial}
  - name: after the process owner's findings
    findings:
      - {id: "finding:H1", kind: process owner, confirms: "claim:join/loan/new/initial=true@join-test-p1", refutes: ["claim:join/loan/agreed/initial=true@join-test-p2"]}
      - {id: "finding:H2", kind: process owner, confirms: "claim:join/loan/active/TRANSITION-loan/repaid/Repayment;balance_after = 0@join-test-p1", refutes: ["claim:join/loan/active/TRANSITION-loan/closing/Repayment;balance_after = 0@join-test-p2"]}
      - {id: "finding:H3", kind: process owner, confirms: "claim:join/loan/repaid/final=true@join-test-p1", refutes: ["claim:join/loan/repaid/TRANSITION-loan/active/Reopen@join-test-p2"]}
    expect:
      statuses: {confirmed: 3, refuted: 3, contested: 2}
      unreachable: {test: P3, states: ["loan/closing"]}
```
