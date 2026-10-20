---
created: 2026-10-04T23:48
modified: 2026-10-04T23:48
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Lens test — renovation portfolio]]"
    type: RELATED_TO
    direction: out
---

# Lens test — renovation budgets

**A test document, not a record.** The renovation's budgets, spending and one open request, with two lenses and their membership stored as a cache (§15 of [[Graph spec model]]). The portfolio, with the planted conditions, is [[Lens test — renovation portfolio]]. Result: [[Graph spec conformance — report]].

## The graph

```gql
// graph: budget · SOURCE and CACHE · example E12
INSERT
 (meta:GraphMeta {id: 'meta:budget', graph: 'budget', schema: 'budget@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t0:Meta:ElementType {id: 'meta:budget:Lens', kind: 'node', name: 'Lens', origin: 'source'}),
 (meta)-[:DECLARES]->(t0),
 (t1:Meta:ElementType {id: 'meta:budget:Budget', kind: 'node', name: 'Budget', origin: 'source'}),
 (meta)-[:DECLARES]->(t1),
 (t2:Meta:ElementType {id: 'meta:budget:Spend', kind: 'node', name: 'Spend', origin: 'source'}),
 (meta)-[:DECLARES]->(t2),
 (t3:Meta:ElementType {id: 'meta:budget:BudgetRequest', kind: 'node', name: 'BudgetRequest', origin: 'source'}),
 (meta)-[:DECLARES]->(t3),
 (t4:Meta:ElementType {id: 'meta:budget:LensGroup', kind: 'node', name: 'LensGroup', origin: 'cache'}),
 (meta)-[:DECLARES]->(t4),
 (t5:Meta:ElementType {id: 'meta:budget:AGAINST', kind: 'edge', name: 'AGAINST', origin: 'source', reading: 'is charged against', reverse_name: 'is charged with'}),
 (meta)-[:DECLARES]->(t5),
 (t6:Meta:ElementType {id: 'meta:budget:IN_GROUP', kind: 'edge', name: 'IN_GROUP', origin: 'cache', reading: 'is in group', reverse_name: 'holds'}),
 (meta)-[:DECLARES]->(t6),
 (lens:Meta:Lens {id: 'lens:budget-review@1', applies_to: 'Budget', buckets: 'budget-requested, over-budget, in-budget', precedence: 'first matching group wins; the last group takes everything else', rule: 'rule:budget-review@1'}),
 (size:Meta:Lens {id: 'lens:size@1', applies_to: 'Budget', buckets: 'large, small', precedence: 'first matching group wins; the last group takes everything else', rule: 'rule:size@1'}),
 (kitchen:Budget {id: 'budget:kitchen', approved_cents: 2000000}),
 (bathroom:Budget {id: 'budget:bathroom', approved_cents: 1200000}),
 (garden:Budget {id: 'budget:garden', approved_cents: 500000}),
 (s1:Event:Spend {id: 'S1', amount_cents: 1500000, at: DATETIME '2026-09-10T10:00:00+10:00'}),
 (s2:Event:Spend {id: 'S2', amount_cents: 1350000, at: DATETIME '2026-09-18T15:30:00+10:00'}),
 (s3:Event:Spend {id: 'S3', amount_cents: 450000, at: DATETIME '2026-09-22T09:00:00+10:00'}),
 (r1:Event:BudgetRequest {id: 'BR1', requested_cents: 200000, at: DATETIME '2026-09-25T11:00:00+10:00', status: 'open'}),
 (s1)-[:AGAINST]->(kitchen),
 (s2)-[:AGAINST]->(bathroom),
 (s3)-[:AGAINST]->(garden),
 (r1)-[:AGAINST]->(garden),
// the lenses' membership, stored as a cache (§11, §15) — proved equal to a recompute
 (g_req:LensGroup {id: 'group:budget-review@1/budget-requested', lens: 'lens:budget-review@1', name: 'budget-requested'}),
 (g_over:LensGroup {id: 'group:budget-review@1/over-budget', lens: 'lens:budget-review@1', name: 'over-budget'}),
 (g_in:LensGroup {id: 'group:budget-review@1/in-budget', lens: 'lens:budget-review@1', name: 'in-budget'}),
 (g_large:LensGroup {id: 'group:size@1/large', lens: 'lens:size@1', name: 'large'}),
 (g_small:LensGroup {id: 'group:size@1/small', lens: 'lens:size@1', name: 'small'}),
 (kitchen)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_in),
 (bathroom)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_over),
 (garden)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_req),
 (kitchen)-[:IN_GROUP {lens: 'lens:size@1', as_of: DATE '2026-09-30'}]->(g_large),
 (bathroom)-[:IN_GROUP {lens: 'lens:size@1', as_of: DATE '2026-09-30'}]->(g_large),
 (garden)-[:IN_GROUP {lens: 'lens:size@1', as_of: DATE '2026-09-30'}]->(g_small)
```
