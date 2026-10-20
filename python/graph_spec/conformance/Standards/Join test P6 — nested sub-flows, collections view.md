---
created: 2026-10-04T22:45
modified: 2026-10-04T23:30
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test P5 — nested sub-flows, operations view]]"
    type: RELATED_TO
    direction: out
---

# Join test P6 — nested sub-flows, collections view

**A test document, not a process anyone runs.** Collections' view: a *recovery* sub-flow inside *defaulting*. Operations' view, with every planted condition listed, is [[Join test P5 — nested sub-flows, operations view]]. Result: [[Graph spec conformance — report]].

## The graph

```gql
// graph: process · document doc:join-test-p6 · schema process@4 · as of 2026-10-15
INSERT
 (overdue:State {id: 'arrears/overdue', flow: 'arrears'}),
 (defaulting:State {id: 'arrears/defaulting', flow: 'arrears'}),
 (ended:State {id: 'arrears/ended', flow: 'arrears', final: TRUE}),
 (overdue)-[:TRANSITION {event: 'GraceExpired', trigger: 'schedule', do: 'start default interest'}]->(defaulting),
 (defaulting)-[:TRANSITION {event: 'done', trigger: 'subflow'}]->(ended),
 (contact:State {id: 'recovery/contact', flow: 'recovery', initial: TRUE}),
 (promised:State {id: 'recovery/promised', flow: 'recovery'}),
 (handed_over:State {id: 'recovery/handed_over', flow: 'recovery', final: TRUE}),
 (defaulting)-[:DETAILED_IN]->(contact),
 (contact)-[:TRANSITION {event: 'PromiseMade', trigger: 'request'}]->(promised),
 (promised)-[:TRANSITION {event: 'PromiseBroken', trigger: 'schedule'}]->(contact),
 (contact)-[:TRANSITION {event: 'HandOver', trigger: 'decision', do: 'notify_both'}]->(handed_over),
 (contact)-[:TRANSITION {event: 'Repayment', trigger: 'ledger', guard: 'else', do: 'log_contact'}]->(contact)
```
