---
created: 2026-10-04T23:46
modified: 2026-10-05T09:12
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Lending demo graph data]]"
    type: RELATED_TO
    direction: out
---

# Sub-flow test — loan with arrears as a sub-flow

**A test document, not a process anyone runs.** The lending demo's loan process, with its arrears handling rebuilt as a sub-flow of *servicing* (§16 of [[Graph spec model]], E15). It must behave exactly like the flat process in [[Lending demo graph data]], and its SCXML export must be valid against the W3C schema. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| E1 | the sub-flow version beside the demo's flat process | the same state and the same actions in every reachable situation, under every event and repayment case — 11 pairs |
| E2 | the SCXML export, *servicing* as a compound state | valid against the W3C schema; a separate reader of the XML agrees with the engine at every step |
| E3 | five runs through the sub-flow | defaulting; overdue not restarted by interest; cured; repaid by the parent; written off via `done` |
| E4 | three faults written into this document | each caught: an `else` over the parent's event, a sub-flow end with no `done`, two start states |
| E5 | the demo's own flat process, exported to SCXML | valid against the W3C schema; a separate reader of the XML agrees with the engine in every reachable state |

## The graph

```gql
// graph: process_subflow · SOURCE · example E15 — the loan with arrears handling as a sub-flow
INSERT
 (meta:GraphMeta {id: 'meta:process-sub', graph: 'process', schema: 'process@4-proposed', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (tS:Meta:ElementType {id: 'meta:process:State', kind: 'node', name: 'State', origin: 'source'}), (meta)-[:DECLARES]->(tS),
 (tT:Meta:ElementType {id: 'meta:process:TRANSITION', kind: 'edge', name: 'TRANSITION', origin: 'source', reading: 'moves to', reverse_name: 'is entered from'}), (meta)-[:DECLARES]->(tT),
 (tD:Meta:ElementType {id: 'meta:process:DETAILED_IN', kind: 'edge', name: 'DETAILED_IN', origin: 'source', reading: 'is detailed in', reverse_name: 'details'}), (meta)-[:DECLARES]->(tD),
// ── flow loan ──
 (new:State {id: 'loan/new', flow: 'loan', initial: TRUE}),
 (requested:State {id: 'loan/requested', flow: 'loan'}),
 (offered:State {id: 'loan/offered', flow: 'loan'}),
 (agreed:State {id: 'loan/agreed', flow: 'loan'}),
 (servicing:State {id: 'loan/servicing', flow: 'loan'}),
 (repaid:State {id: 'loan/repaid', flow: 'loan', final: TRUE}),
 (declined:State {id: 'loan/declined', flow: 'loan', final: TRUE}),
 (lapsed:State {id: 'loan/lapsed', flow: 'loan', final: TRUE}),
 (written_off:State {id: 'loan/written_off', flow: 'loan', final: TRUE}),
 (new)-[:TRANSITION {event: 'Request', trigger: 'request', do: 'notify_lender'}]->(requested),
 (requested)-[:TRANSITION {event: 'Offer', trigger: 'decision', do: 'notify_borrower'}]->(offered),
 (requested)-[:TRANSITION {event: 'Decline', trigger: 'decision', do: 'notify_borrower'}]->(declined),
 (offered)-[:TRANSITION {event: 'Sign', trigger: 'decision'}]->(agreed),
 (offered)-[:TRANSITION {event: 'OfferExpired', trigger: 'schedule', do: 'notify_both'}]->(lapsed),
 (agreed)-[:TRANSITION {event: 'Drawdown', trigger: 'ledger'}]->(servicing),
 (servicing)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after = 0'}]->(repaid),
 (servicing)-[:TRANSITION {event: 'InterestCharge', trigger: 'schedule'}]->(servicing),
 (servicing)-[:TRANSITION {event: 'DefaultInterestCharge', trigger: 'schedule'}]->(servicing),
// ── servicing opens into flow arrears ──
 (current:State {id: 'arrears/current', flow: 'arrears', initial: TRUE}),
 (servicing)-[:DETAILED_IN]->(current),
 (overdue:State {id: 'arrears/overdue', flow: 'arrears'}),
 (defaulting:State {id: 'arrears/defaulting', flow: 'arrears'}),
 (ended:State {id: 'arrears/ended', flow: 'arrears', final: TRUE}),
 (current)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0'}]->(current),
 (current)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'GraceExpired', trigger: 'schedule', do: 'alert_both; start default interest'}]->(defaulting),
 (defaulting)-[:TRANSITION {event: 'InstalmentMissed', trigger: 'schedule', do: 'alert_both'}]->(defaulting),
 (defaulting)-[:TRANSITION {event: 'GraceExpired', trigger: 'schedule', do: 'alert_both; start default interest'}]->(defaulting),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(current),
 (overdue)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and not arrears_cleared'}]->(overdue),
 (overdue)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(ended),
 (defaulting)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and arrears_cleared'}]->(current),
 (defaulting)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'balance_after > 0 and not arrears_cleared'}]->(defaulting),
 (defaulting)-[:TRANSITION {event: 'WriteOff', trigger: 'decision', do: 'notify_both'}]->(ended),
 (servicing)-[:TRANSITION {event: 'done', trigger: 'subflow'}]->(written_off)
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: subflow-equivalence
title: A sub-flow behaves exactly like the flat process it replaces
kind: graphs
configuration: subflow
rounds:
  - name: the arrears sub-flow against the demo's flat process
    documents: ["Lending demo graph data#Source — process", "Sub-flow test — loan with arrears as a sub-flow"]
    rules: [process]
    expect:
      equivalent:
        test: E1
        flat: process
        subflow: process_subflow
        map: {"loan/servicing / arrears/current": loan/active, "loan/servicing / arrears/overdue": loan/in_arrears, "loan/servicing / arrears/defaulting": loan/in_arrears}
        reachable_pairs: 11
      scxml: {test: E2, graph: process_subflow}
      scxml_flat: {test: E5, graph: process}
      runs:
        - {test: E3, graph: process_subflow, events: [[Request], [Offer], [Sign], [Drawdown], [InstalmentMissed], [GraceExpired]], ends_in: [loan/servicing, arrears/defaulting], actions: [notify_lender, notify_borrower, alert_both, "alert_both; start default interest"]}
        - {test: E3, graph: process_subflow, events: [[Request], [Offer], [Sign], [Drawdown], [InstalmentMissed], [InterestCharge]], ends_in: [loan/servicing, arrears/overdue]}
        - {test: E3, graph: process_subflow, events: [[Request], [Offer], [Sign], [Drawdown], [InstalmentMissed], [Repayment, {balance_after: 500, arrears_cleared: true}]], ends_in: [loan/servicing, arrears/current]}
        - {test: E3, graph: process_subflow, events: [[Request], [Offer], [Sign], [Drawdown], [InstalmentMissed], [GraceExpired], [Repayment, {balance_after: 0, arrears_cleared: true}]], ends_in: [loan/repaid]}
        - {test: E3, graph: process_subflow, events: [[Request], [Offer], [Sign], [Drawdown], [InstalmentMissed], [WriteOff]], ends_in: [loan/written_off], actions: [notify_lender, notify_borrower, alert_both, notify_both]}
    mutations:
      - {test: E4, name: "an else in the sub-flow that swallows paying in full", document: "Sub-flow test — loan with arrears as a sub-flow", replace: "guard: 'balance_after > 0 and not arrears_cleared'}]->(overdue)", with: "guard: 'else'}]->(overdue)"}
      - {test: E4, name: "a sub-flow that can end with no done on its parent", document: "Sub-flow test — loan with arrears as a sub-flow", replace: " (servicing)-[:TRANSITION {event: 'done', trigger: 'subflow'}]->(written_off)", with: " (servicing)-[:TRANSITION {event: 'Noop', trigger: 'subflow'}]->(servicing)"}
      - {test: V4, name: "a nesting loop written into one document — arrears opening back into servicing", document: "Sub-flow test — loan with arrears as a sub-flow", append: ",\n (current)-[:DETAILED_IN]->(servicing)", expect_message: "nest in a loop"}
      - {test: E4, name: "two start states in the sub-flow", document: "Sub-flow test — loan with arrears as a sub-flow", replace: "(overdue:State {id: 'arrears/overdue', flow: 'arrears'})", with: "(overdue:State {id: 'arrears/overdue', flow: 'arrears', initial: TRUE})"}
```
