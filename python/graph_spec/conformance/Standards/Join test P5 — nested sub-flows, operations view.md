---
created: 2026-10-04T22:45
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P6 — nested sub-flows, collections view]]"
    type: RELATED_TO
    direction: out
---

# Join test P5 — nested sub-flows, operations view

**A test document, not a process anyone runs.** The loan with arrears as a sub-flow of *servicing*, written by operations. Collections' view, [[Join test P6 — nested sub-flows, collections view]], adds a *recovery* sub-flow inside *defaulting*, so the joined process is nested two levels deep (§16 of [[Graph spec model]]). Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Operations (P5) | Collections (P6) | Expected outcome |
|---|---|---|---|
| U1 | — | *defaulting* opens into a *recovery* sub-flow | added: the joined process is nested two deep |
| U2 | servicing handles *paid in full* | in recovery, any payment is logged and stays put (`else`) | paradox: the `else` two levels down swallows *paid in full* from servicing — **§16 rule 3 must look at every level above, not only the parent** |
| U3 | — | handing a loan over ends recovery; *defaulting* then ends arrears | `done` passes up two levels: recovery ends, arrears ends, servicing goes to *written off* |
| U4 | interest is charged on servicing | — | a payment, interest or a promise inside recovery never restarts a sub-flow above it |

## The graph

```gql
// graph: process · document doc:join-test-p5 · schema process@4 · as of 2026-10-01
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
 (defaulting:State {id: 'arrears/defaulting', flow: 'arrears'}),
 (ended:State {id: 'arrears/ended', flow: 'arrears', final: TRUE}),
 (servicing)-[:DETAILED_IN]->(current),
 (current)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0'}]->(current),
 (current)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(current),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and not arrears_cleared'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'GraceExpired', trigger: 'schedule', do: 'start default interest'}]->(defaulting),
 (defaulting)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(ended)
```

## Conformance case

The expected answers for this case, as data — read by the conformance suite ([[Graph spec conformance suite]], spec §17). The planted-conditions table above explains them; the test ids must match.

```yaml
# conformance case
case: nested-sub-flows
title: Nested sub-flows, two levels deep
documents: ["Join test P5 — nested sub-flows, operations view", "Join test P6 — nested sub-flows, collections view"]
configuration: subflow
rounds:
  - name: as written
    expect:
      report:
        - [constraint, "recovery/contact", TRANSITION, U2]
        - [constraint, "loan/servicing", TRANSITION, U2]
      edges:
        - {test: U1, from: "arrears/defaulting", type: DETAILED_IN, to: "recovery/contact"}
        - {test: U2, from: "recovery/contact", type: TRANSITION, to: "recovery/contact", id: [Repayment, else], present: false}
  - name: after the process owner's finding
    findings:
      - {id: "finding:L1", kind: process owner, confirms: "claim:join/loan/servicing/TRANSITION-loan/repaid/Repayment;balance_after = 0@join-test-p5", refutes: ["claim:join/recovery/contact/TRANSITION-recovery/contact/Repayment;else@join-test-p6"]}
    expect:
      runs:
        - {test: U1, events: [[Sign], [Drawdown], [InstalmentMissed], [GraceExpired]], ends_in: ["loan/servicing", "arrears/defaulting", "recovery/contact"]}
        - {test: U2, events: [[Sign], [Drawdown], [InstalmentMissed], [GraceExpired], [Repayment, {balance_after: 0, arrears_cleared: true}]], ends_in: ["loan/repaid"]}
        - {test: U3, events: [[Sign], [Drawdown], [InstalmentMissed], [GraceExpired], [HandOver]], ends_in: ["loan/written_off"], actions: [alert_both, start default interest, notify_both]}
        - {test: U4, events: [[Sign], [Drawdown], [InstalmentMissed], [GraceExpired], [PromiseMade], [InterestCharge]], ends_in: ["loan/servicing", "arrears/defaulting", "recovery/promised"]}
```
