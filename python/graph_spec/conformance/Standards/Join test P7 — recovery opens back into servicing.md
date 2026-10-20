---
created: 2026-10-05T09:11
modified: 2026-10-05T09:11
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P5 — nested sub-flows, operations view]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Join test P6 — nested sub-flows, collections view]]"
    type: RELATED_TO
    direction: out
---

# Join test P7 — recovery opens back into servicing

**A test document, not a process anyone runs.** A third view of the nested loan process — an escalation team's — in which recovery's first state opens into the *loan* flow. Valid on its own. Joined with [[Join test P5 — nested sub-flows, operations view]] (servicing opens into arrears) and [[Join test P6 — nested sub-flows, collections view]] (defaulting opens into recovery), it closes a loop: loan → arrears → recovery → loan. §16 of [[Graph spec model]] says sub-flows never nest in a loop. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| V1 | each document's nesting, on its own | no loop in any one document, nor in any pair |
| V2 | all three joined | loan → arrears → recovery → loan — held as one paradox of the three `DETAILED_IN` links; none asserted |
| V3 | what the joined process does with the loop held | three flows now start on their own, so the engine runs only the one it is told to — the loan, without its sub-flow, so a missed instalment changes nothing |
| V4 | a loop written inside one document | refused by the engine by name, and caught by the process rules |

## The graph

```gql
// graph: process · document doc:join-test-p7 · schema process@4 · as of 2026-10-20
INSERT
 (contact:State {id: 'recovery/contact', flow: 'recovery', initial: TRUE}),
 (servicing:State {id: 'loan/servicing', flow: 'loan'}),
 (contact)-[:DETAILED_IN]->(servicing)
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: nesting-loop
title: Sub-flows never nest in a loop
documents: ["Join test P5 — nested sub-flows, operations view", "Join test P6 — nested sub-flows, collections view", "Join test P7 — recovery opens back into servicing"]
configuration: subflow
rounds:
  - name: three views that close a loop only together
    expect:
      no_loop_alone: {test: V1}
      report:
        - [constraint, "recovery/contact", TRANSITION, U2]
        - [constraint, "loan/servicing", TRANSITION, U2]
        - [constraint, "arrears/defaulting", DETAILED_IN, V2]
        - [constraint, "loan/servicing", DETAILED_IN, V2]
        - [constraint, "recovery/contact", DETAILED_IN, V2]
      paradox_sizes: [3]
      edges:
        - {test: V2, from: "loan/servicing", type: DETAILED_IN, to: "arrears/current", present: false}
        - {test: V2, from: "arrears/defaulting", type: DETAILED_IN, to: "recovery/contact", present: false}
        - {test: V2, from: "recovery/contact", type: DETAILED_IN, to: "loan/servicing", present: false}
      runs:
        - {test: V3, flow: loan, events: [[Sign], [Drawdown], [InstalmentMissed]], ends_in: ["loan/servicing"]}
```
