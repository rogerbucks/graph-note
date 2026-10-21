---
created: 2026-10-05T19:08
modified: 2026-10-05T19:37
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Judgement test — writing off loan L3]]"
    type: RELATED_TO
    direction: out
---

# Change set test — additions proposed for loan L3

**A test document, not a record.** Change sets (§24 H4 of [[Graph spec model]]) proposed against the loan book and judgement graph of [[Judgement test — writing off loan L3]] — by the drafting model, and once by Alice. Each is dry-run by the checker: it is **offered** for a person to apply only if every check passes, and **refused** otherwise, with what to change. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Change set | Expected |
|---|---|---|
| X1 | the model adds a claim that the borrower owns a car, with its own assessment | offered |
| X2 | the same, made against the loan book as it was after a part payment that is not in it | refused — made against a state the graph is not in |
| X3 | the model records a repayment as a fact | refused — a model adds no record and no cache: it states a claim, or a proposal for a person to decide |
| X4 | the model records a decision in the judgement graph | refused — the same rule |
| X5 | the model moves the date of L3's missed instalment, a record already there | refused — a change set never changes a record or a cache |
| X6 | the model adds a claim with an assessment made *by Alice* | refused — a model's assessments are its own |
| X7 | Alice records a repayment | offered — a person may add facts |
| X8 | the model's assessment dated with a `ZONED DATETIME` | refused by the dialect linter |
| X9 | the model attaches evidence, a type the loan book does not declare | refused — every element must have a declared type (§5), and the refusal names the type and whose change it is |
| X10 | the model adds its own new assessment of an existing claim | offered — and applying it refreshes the claim's cached likelihood, as the engine would |

## X1 — a claim the model may add

```gql
// graph: loanbook · CHANGE SET change:L3/owns-a-car · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (L3:Loan {id: 'loan:L3'}) MATCH (drafter:Model {id: 'model:drafter'})
INSERT (car:Claim {id: 'claim:L3/owns-a-car', claimed_property: 'other_assets', claimed_value: 'a car'}),
 (car)-[:ABOUT {role: 'subject'}]->(L3),
 (a:Assessment {id: 'assess:L3/owns-a-car/1', at: DATE '2026-12-14', likelihood: 'unlikely'}), (a)-[:ASSESSES]->(car), (a)-[:BY]->(drafter)
```

## X2 — made against an old state

```gql
// graph: loanbook · CHANGE SET change:L3/owns-a-car-stale · against sha-256-64:9025e298b7671a15 · by model:drafter
MATCH (L3:Loan {id: 'loan:L3'}) MATCH (drafter:Model {id: 'model:drafter'})
INSERT (car:Claim {id: 'claim:L3/owns-a-car', claimed_property: 'other_assets', claimed_value: 'a car'}),
 (car)-[:ABOUT {role: 'subject'}]->(L3),
 (a:Assessment {id: 'assess:L3/owns-a-car/1', at: DATE '2026-12-14', likelihood: 'unlikely'}), (a)-[:ASSESSES]->(car), (a)-[:BY]->(drafter)
```

## X3 — a fact asserted by a model

```gql
// graph: loanbook · CHANGE SET change:L3/model-repayment · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (L3:Loan {id: 'loan:L3'})
INSERT (pay:Event {id: 'ev:L3/model-repayment', kind: 'Repayment', at: DATE '2026-12-20'}), (pay)-[:APPLIES_TO]->(L3)
```

## X4 — a decision recorded by a model

```gql
// graph: judgements · CHANGE SET change:L3/model-decision · against sha-256-64:bda7bec443351f36 · by model:drafter
MATCH (r_L3:Ref {id: 'ref:loanbook/loan:L3'}) MATCH (r_drafter:Ref {id: 'ref:loanbook/model:drafter'})
INSERT (d:Decision {id: 'decision:L3-model', title: 'Write off loan L3', statement: 'Write off loan L3', rationale: 'drafted and decided by the model', at: DATE '2026-12-15'}),
 (d)-[:ABOUT]->(r_L3), (d)-[:DECIDED_BY]->(r_drafter)
```

## X5 — an edit to a record already there

```gql
// graph: loanbook · CHANGE SET change:L3/missed-date · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (missed:Event {id: 'ev:L3/missed'}) SET missed.at = DATE '2026-11-15'
```

## X6 — an assessment made in someone else's name

```gql
// graph: loanbook · CHANGE SET change:L3/as-alice · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (L3:Loan {id: 'loan:L3'}) MATCH (alice:Person {id: 'person:alice'})
INSERT (car:Claim {id: 'claim:L3/owns-a-car', claimed_property: 'other_assets', claimed_value: 'a car'}),
 (car)-[:ABOUT {role: 'subject'}]->(L3),
 (a:Assessment {id: 'assess:L3/owns-a-car/1', at: DATE '2026-12-14', likelihood: 'unlikely'}), (a)-[:ASSESSES]->(car), (a)-[:BY]->(alice)
```

## X7 — a fact a person may add

```gql
// graph: loanbook · CHANGE SET change:L3/alice-repayment · against sha-256-64:dd3144ba4ac8f570 · by person:alice
MATCH (L3:Loan {id: 'loan:L3'})
INSERT (pay:Event {id: 'ev:L3/repayment-dec', kind: 'Repayment', at: DATE '2026-12-20'}), (pay)-[:APPLIES_TO]->(L3)
```

## X8 — a dialect trap

```gql
// graph: loanbook · CHANGE SET change:L3/zoned · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (L3:Loan {id: 'loan:L3'}) MATCH (drafter:Model {id: 'model:drafter'})
INSERT (car:Claim {id: 'claim:L3/owns-a-car', claimed_property: 'other_assets', claimed_value: 'a car'}),
 (car)-[:ABOUT {role: 'subject'}]->(L3),
 (a:Assessment {id: 'assess:L3/owns-a-car/1', at: ZONED DATETIME '2026-12-14T09:00:00+10:00', likelihood: 'unlikely'}), (a)-[:ASSESSES]->(car), (a)-[:BY]->(drafter)
```

## X9 — a type the graph does not declare

```gql
// graph: loanbook · CHANGE SET change:L3/evidence · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (norec:Claim {id: 'claim:L3/no-recovery'}) MATCH (drafter:Model {id: 'model:drafter'})
INSERT (ev:Evidence {id: 'evidence:L3/call-notes', text: 'borrower said they had nothing left to sell'}), (norec)-[:SUPPORTED_BY]->(ev), (ev)-[:FROM]->(drafter)
```

## X10 — a new assessment of an existing claim

```gql
// graph: loanbook · CHANGE SET change:L3/reassess · against sha-256-64:dd3144ba4ac8f570 · by model:drafter
MATCH (norec:Claim {id: 'claim:L3/no-recovery'}) MATCH (drafter:Model {id: 'model:drafter'})
INSERT (a:Assessment {id: 'assess:L3/no-recovery/3', at: DATE '2026-12-20', likelihood: 'very-likely'}), (a)-[:ASSESSES]->(norec), (a)-[:BY]->(drafter)
```

## Computed values

Every state hash above is computed, never typed (§24 rule 4), by `zzSupport/_scripts/graph-spec-fill.py`.

```yaml
# fill — computed values (§24 H2)
AGAINST_LB: {state_of: loanbook, load: [Judgement test — writing off loan L3#The data], value: 'sha-256-64:dd3144ba4ac8f570', uses: 8}
AGAINST_J: {state_of: judgements, load: [Judgement test — writing off loan L3#The data, Judgement test — writing off loan L3#The judgements, Judgement test — writing off loan L3#Types for servings, Judgement test — writing off loan L3#The serving], value: 'sha-256-64:bda7bec443351f36', uses: 1}
AGAINST_PAID: {state_of: loanbook, load: [Judgement test — writing off loan L3#The data, Judgement test — writing off loan L3#Later — a part payment arrives], value: 'sha-256-64:9025e298b7671a15', uses: 1}
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17). Each change set is dry-run against the round's documents.

```yaml
# conformance case
case: change-sets
title: Additions proposed by a model, checked before anyone applies them
kind: graphs
rounds:
  - name: proposals against loan L3
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving"]
    expect:
      changesets:
        - {test: X1, set: "Change set test — additions proposed for loan L3#X1 — a claim the model may add", outcome: offered}
        - {test: X2, set: "Change set test — additions proposed for loan L3#X2 — made against an old state", outcome: refused, says: "made against the graph as it stands"}
        - {test: X3, set: "Change set test — additions proposed for loan L3#X3 — a fact asserted by a model", outcome: refused, says: "a model adds no record"}
        - {test: X4, set: "Change set test — additions proposed for loan L3#X4 — a decision recorded by a model", outcome: refused, says: "a model adds no record"}
        - {test: X5, set: "Change set test — additions proposed for loan L3#X5 — an edit to a record already there", outcome: refused, says: "it never removes or changes a record"}
        - {test: X6, set: "Change set test — additions proposed for loan L3#X6 — an assessment made in someone else's name", outcome: refused, says: "assessments are its own"}
        - {test: X7, set: "Change set test — additions proposed for loan L3#X7 — a fact a person may add", outcome: offered}
        - {test: X8, set: "Change set test — additions proposed for loan L3#X8 — a dialect trap", outcome: refused, says: "dialect linter"}
        - {test: X10, set: "Change set test — additions proposed for loan L3#X10 — a new assessment of an existing claim", outcome: offered, refreshes: [["claim:L3/no-recovery", likelihood, very-likely]]}
        - {test: X9, set: "Change set test — additions proposed for loan L3#X9 — a type the graph does not declare", outcome: refused, says: "declared type"}
```
