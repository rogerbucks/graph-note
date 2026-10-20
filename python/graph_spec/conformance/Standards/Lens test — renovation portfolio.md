---
created: 2026-10-04T23:48
modified: 2026-10-05T09:01
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Lens test — renovation budgets]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Lens test — renovation portfolio

**A test document, not a record.** A house renovation as a portfolio of projects, each zooming into its budget in another graph (§16 of [[Graph spec model]]). The budgets and their lenses are [[Lens test — renovation budgets]]. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| L1 | the budget-review lens over three budgets | kitchen in budget; bathroom over budget; garden budget requested — first matching bucket wins |
| L2 | a second lens, by size, over the same budgets | kitchen and bathroom large, garden small; the first lens undisturbed |
| L3 | each project zooms to its budget by a `Ref` | every `Ref` resolves, and the zoom reads each project's bucket |
| L4 | the lens membership stored as a cache | equal to a recompute; one bucket per budget per lens; tampering caught |
| L5 | a zoom link to a budget that does not exist | caught |
| L6 | a block with its `// graph:` line removed | refused, saying it names no graph (§3) |

## The graph

```gql
// graph: portfolio · SOURCE · example E12
INSERT
 (meta:GraphMeta {id: 'meta:portfolio', graph: 'portfolio', schema: 'portfolio@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t0:Meta:ElementType {id: 'meta:portfolio:Programme', kind: 'node', name: 'Programme', origin: 'source'}),
 (meta)-[:DECLARES]->(t0),
 (t1:Meta:ElementType {id: 'meta:portfolio:Project', kind: 'node', name: 'Project', origin: 'source'}),
 (meta)-[:DECLARES]->(t1),
 (t2:Meta:ElementType {id: 'meta:portfolio:Ref', kind: 'node', name: 'Ref', origin: 'reference'}),
 (meta)-[:DECLARES]->(t2),
 (t3:Meta:ElementType {id: 'meta:portfolio:PART_OF', kind: 'edge', name: 'PART_OF', origin: 'source', reading: 'is part of', reverse_name: 'contains'}),
 (meta)-[:DECLARES]->(t3),
 (t4:Meta:ElementType {id: 'meta:portfolio:DETAILED_IN', kind: 'edge', name: 'DETAILED_IN', origin: 'source', reading: 'is detailed in', reverse_name: 'details'}),
 (meta)-[:DECLARES]->(t4),
 (prog:Programme {id: 'prog:renovation', name: 'House renovation'}),
 (kitchen:Project {id: 'project:kitchen', name: 'Kitchen'}),
 (bathroom:Project {id: 'project:bathroom', name: 'Bathroom'}),
 (garden:Project {id: 'project:garden', name: 'Garden'}),
 (ref_k:Ref {id: 'ref:budget/kitchen', graph: 'budget', ref: 'budget:kitchen'}),
 (ref_b:Ref {id: 'ref:budget/bathroom', graph: 'budget', ref: 'budget:bathroom'}),
 (ref_g:Ref {id: 'ref:budget/garden', graph: 'budget', ref: 'budget:garden'}),
 (kitchen)-[:PART_OF]->(prog),
 (bathroom)-[:PART_OF]->(prog),
 (garden)-[:PART_OF]->(prog),
 (kitchen)-[:DETAILED_IN]->(ref_k),
 (bathroom)-[:DETAILED_IN]->(ref_b),
 (garden)-[:DETAILED_IN]->(ref_g)
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: lenses-and-zoom
title: Lenses group nodes by rule; zoom is a link to detail
kind: graphs
rounds:
  - name: the budget-review lens and a second lens
    documents: ["Lens test — renovation portfolio", "Lens test — renovation budgets"]
    expect:
      lenses:
        - test: L1
          graph: budget
          lens: "lens:budget-review@1"
          rule: |
            MATCH (b:Budget)
            OPTIONAL MATCH (s:Spend)-[:AGAINST]->(b)
            OPTIONAL MATCH (r:BudgetRequest {status: 'open'})-[:AGAINST]->(b)
            WITH b, sum(s.amount_cents) AS spent, count(r) AS open_requests
            RETURN b.id AS id,
              CASE WHEN open_requests > 0 THEN 'budget-requested'
                   WHEN spent > b.approved_cents THEN 'over-budget'
                   ELSE 'in-budget' END AS grp
          buckets: {"budget:kitchen": in-budget, "budget:bathroom": over-budget, "budget:garden": budget-requested}
        - test: L2
          graph: budget
          lens: "lens:size@1"
          rule: |
            MATCH (b:Budget)
            RETURN b.id AS id, CASE WHEN b.approved_cents >= 1000000 THEN 'large' ELSE 'small' END AS grp
          buckets: {"budget:kitchen": large, "budget:bathroom": large, "budget:garden": small}
      zoom: {test: L3, graph: portfolio, lens: "lens:budget-review@1", buckets: {Kitchen: in-budget, Bathroom: over-budget, Garden: budget-requested}}
    mutations:
      - {test: L4, name: "the kitchen's stored lens membership moved to the wrong bucket", document: "Lens test — renovation budgets", replace: "(kitchen)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_in)", with: "(kitchen)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_over)"}
      - {test: L4, name: "a budget placed in two buckets of one lens", document: "Lens test — renovation budgets", append: ",\n (garden)-[:IN_GROUP {lens: 'lens:budget-review@1', as_of: DATE '2026-09-30'}]->(g_in)"}
      - {test: L6, name: "a block with its graph line removed", document: "Lens test — renovation budgets", replace: "// graph: budget · SOURCE and CACHE · example E12\n", with: "", expect_message: "names no graph"}
      - {test: L5, name: "a zoom link whose reference does not resolve", document: "Lens test — renovation portfolio", replace: "ref: 'budget:garden'", with: "ref: 'budget:shed'"}
```
