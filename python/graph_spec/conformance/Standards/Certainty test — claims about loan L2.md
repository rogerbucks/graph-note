---
created: 2026-10-04T23:44
modified: 2026-10-04T23:44
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Certainty test — the receipt]]"
    type: RELATED_TO
    direction: out
---

# Certainty test — claims about loan L2

**A test document, not a record.** All people and figures are invented. Claims beside facts under §20 of [[Graph spec model]]: a claimed payment, a claimed employment, an approximate start date, a claim nobody can judge, and a conclusion derived from two of them. The receipt that settles the payment is [[Certainty test — the receipt]]. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| C1 | a $200 payment Carol says she made in cash, held as a claim | the balance counts facts only — 200,000 cents, then 180,000 once the receipt confirms it |
| C2 | the payment claim — two assessments, two independent sources | likely (the latest assessment); high confidence |
| C3 | Dan employed by Acme — one source for, one against | even chance; low |
| C4 | Dan employed since about 2019 (`2019~`) — one source | likely; moderate |
| C5 | Dan borrows elsewhere — nobody can judge | cannot judge; low |
| C6 | Dan can afford a loan — derived from C3's and C4's claims | 0–55%, almost no chance to even chance; low (rule:combine@1) |
| C7 | the certainty lens | the payment probable, then confirmed |
| C8 | the likelihood scale stored in the graph | *likely* reads back as 55–80% |
| C9 | the rejected design — the same payment written as an ordinary repayment | caught: it changes the balance |
| C10 | four tampered values | each caught |

## Combining two claims (E14a)

| Test | Planted | Expected |
|---|---|---|
| R1 | both true: even chance and likely | 0–55% if dependence is unknown; 24.75–44% if independent |
| R2 | either true; neither | 55–100%; 0–45% |
| R3 | two *likely* claims together | 10–80% unknown; 30.25–64% independent — never simply *likely* |
| R4 | a claim nobody can judge, with a *likely* one | still at most 80% |
| R5 | the four joint outcomes, independent | as listed in the case data |
| R6 | may independence be declared? | not for C2 and C3, which share a source; yes for C1 and C3 |

## The graph

```gql
// graph: credit · SOURCE · example E14
INSERT
 (meta:GraphMeta {id: 'meta:credit', graph: 'credit', schema: 'credit@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (t0:Meta:ElementType {id: 'meta:credit:Person', kind: 'node', name: 'Person', origin: 'source', aligns_with: 'prov:Agent'}),
 (meta)-[:DECLARES]->(t0),
 (t1:Meta:ElementType {id: 'meta:credit:Organisation', kind: 'node', name: 'Organisation', origin: 'source', aligns_with: 'prov:Agent'}),
 (meta)-[:DECLARES]->(t1),
 (t2:Meta:ElementType {id: 'meta:credit:Loan', kind: 'node', name: 'Loan', origin: 'source'}),
 (meta)-[:DECLARES]->(t2),
 (t3:Meta:ElementType {id: 'meta:credit:Repayment', kind: 'node', name: 'Repayment', origin: 'source'}),
 (meta)-[:DECLARES]->(t3),
 (t4:Meta:ElementType {id: 'meta:credit:Claim', kind: 'node', name: 'Claim', origin: 'source', aligns_with: 'rdf:Statement'}),
 (meta)-[:DECLARES]->(t4),
 (t5:Meta:ElementType {id: 'meta:credit:Evidence', kind: 'node', name: 'Evidence', origin: 'source', aligns_with: 'prov:Entity'}),
 (meta)-[:DECLARES]->(t5),
 (t6:Meta:ElementType {id: 'meta:credit:Assessment', kind: 'node', name: 'Assessment', origin: 'source', aligns_with: 'prov:Activity'}),
 (meta)-[:DECLARES]->(t6),
 (t7:Meta:ElementType {id: 'meta:credit:LikelihoodBand', kind: 'node', name: 'LikelihoodBand', origin: 'source'}),
 (meta)-[:DECLARES]->(t7),
 (t8:Meta:ElementType {id: 'meta:credit:LENDER', kind: 'edge', name: 'LENDER', origin: 'source', reading: 'has lender', reverse_name: 'lends on'}),
 (meta)-[:DECLARES]->(t8),
 (t9:Meta:ElementType {id: 'meta:credit:BORROWER', kind: 'edge', name: 'BORROWER', origin: 'source', reading: 'has borrower', reverse_name: 'borrows on'}),
 (meta)-[:DECLARES]->(t9),
 (t10:Meta:ElementType {id: 'meta:credit:REPAYS', kind: 'edge', name: 'REPAYS', origin: 'source', reading: 'repays', reverse_name: 'is repaid by'}),
 (meta)-[:DECLARES]->(t10),
 (t11:Meta:ElementType {id: 'meta:credit:PAID_BY', kind: 'edge', name: 'PAID_BY', origin: 'source', reading: 'is paid by', reverse_name: 'paid'}),
 (meta)-[:DECLARES]->(t11),
 (t12:Meta:ElementType {id: 'meta:credit:ABOUT', kind: 'edge', name: 'ABOUT', origin: 'source', reading: 'is about', reverse_name: 'is the subject of'}),
 (meta)-[:DECLARES]->(t12),
 (t13:Meta:ElementType {id: 'meta:credit:SUPPORTED_BY', kind: 'edge', name: 'SUPPORTED_BY', origin: 'source', reading: 'is supported by', reverse_name: 'supports'}),
 (meta)-[:DECLARES]->(t13),
 (t14:Meta:ElementType {id: 'meta:credit:CONTRADICTED_BY', kind: 'edge', name: 'CONTRADICTED_BY', origin: 'source', reading: 'is contradicted by', reverse_name: 'contradicts'}),
 (meta)-[:DECLARES]->(t14),
 (t15:Meta:ElementType {id: 'meta:credit:FROM', kind: 'edge', name: 'FROM', origin: 'source', reading: 'comes from', reverse_name: 'is the source of', aligns_with: 'prov:wasAttributedTo'}),
 (meta)-[:DECLARES]->(t15),
 (t16:Meta:ElementType {id: 'meta:credit:ASSESSES', kind: 'edge', name: 'ASSESSES', origin: 'source', reading: 'assesses', reverse_name: 'is assessed by'}),
 (meta)-[:DECLARES]->(t16),
 (t17:Meta:ElementType {id: 'meta:credit:BY', kind: 'edge', name: 'BY', origin: 'source', reading: 'is made by', reverse_name: 'made', aligns_with: 'prov:wasAssociatedWith'}),
 (meta)-[:DECLARES]->(t17),
 (t18:Meta:ElementType {id: 'meta:credit:CONFIRMS', kind: 'edge', name: 'CONFIRMS', origin: 'source', reading: 'confirms', reverse_name: 'is confirmed by'}),
 (meta)-[:DECLARES]->(t18),
 (t19:Meta:ElementType {id: 'meta:credit:REFUTES', kind: 'edge', name: 'REFUTES', origin: 'source', reading: 'refutes', reverse_name: 'is refuted by'}),
 (meta)-[:DECLARES]->(t19),
 (t20:Meta:ElementType {id: 'meta:credit:WAS_DERIVED_FROM', kind: 'edge', name: 'WAS_DERIVED_FROM', origin: 'generated', rule: 'rule:combine@1', reading: 'was derived from', reverse_name: 'was used to derive', aligns_with: 'prov:wasDerivedFrom'}),
 (meta)-[:DECLARES]->(t20),
 (t21:Meta:ElementType {id: 'meta:credit:Claim.likelihood', kind: 'property', name: 'Claim.likelihood', origin: 'cache', rule: 'rule:latest-assessment@1'}),
 (meta)-[:DECLARES]->(t21),
 (t22:Meta:ElementType {id: 'meta:credit:Claim.confidence', kind: 'property', name: 'Claim.confidence', origin: 'cache', rule: 'rule:confidence-from-evidence@1'}),
 (meta)-[:DECLARES]->(t22),
 (t23:Meta:ElementType {id: 'meta:credit:Claim.status', kind: 'property', name: 'Claim.status', origin: 'cache', rule: 'rule:claim-status@1'}),
 (meta)-[:DECLARES]->(t23),
 (t24:Meta:ElementType {id: 'meta:credit:Claim.low_pct', kind: 'property', name: 'Claim.low_pct', origin: 'generated', rule: 'rule:combine@1'}),
 (meta)-[:DECLARES]->(t24),
 (t25:Meta:ElementType {id: 'meta:credit:Claim.high_pct', kind: 'property', name: 'Claim.high_pct', origin: 'generated', rule: 'rule:combine@1'}),
 (meta)-[:DECLARES]->(t25),
 (band0:LikelihoodBand {id: 'band:icd203/cannot-judge', term: 'cannot-judge', rank: 0}),
 (band1:LikelihoodBand {id: 'band:icd203/almost-no-chance', term: 'almost-no-chance', rank: 1, low_pct: 1, high_pct: 5}),
 (band2:LikelihoodBand {id: 'band:icd203/very-unlikely', term: 'very-unlikely', rank: 2, low_pct: 5, high_pct: 20}),
 (band3:LikelihoodBand {id: 'band:icd203/unlikely', term: 'unlikely', rank: 3, low_pct: 20, high_pct: 45}),
 (band4:LikelihoodBand {id: 'band:icd203/even-chance', term: 'even-chance', rank: 4, low_pct: 45, high_pct: 55}),
 (band5:LikelihoodBand {id: 'band:icd203/likely', term: 'likely', rank: 5, low_pct: 55, high_pct: 80}),
 (band6:LikelihoodBand {id: 'band:icd203/very-likely', term: 'very-likely', rank: 6, low_pct: 80, high_pct: 95}),
 (band7:LikelihoodBand {id: 'band:icd203/almost-certain', term: 'almost-certain', rank: 7, low_pct: 95, high_pct: 99}),
 (alice:Party:Person {id: 'person:alice', name: 'Alice'}),
 (bob:Party:Person {id: 'person:bob', name: 'Bob'}),
 (carol:Party:Person {id: 'person:carol', name: 'Carol'}),
 (dan:Party:Person {id: 'person:dan', name: 'Dan'}),
 (acme:Party:Organisation {id: 'org:acme', name: 'Acme Builders'}),
 (l2:Loan {id: 'loan:L2', principal_cents: 300000, currency: 'AUD'}),
 (l2)-[:LENDER]->(alice), (l2)-[:BORROWER]->(carol),
 (r1:Event:Repayment {id: 'R1', amount_cents: 50000, at: DATETIME '2026-09-30T09:00:00+10:00', recorded_at: DATETIME '2026-09-30T09:05:00+10:00'}),
 (r2:Event:Repayment {id: 'R2', amount_cents: 50000, at: DATETIME '2026-10-31T09:00:00+10:00', recorded_at: DATETIME '2026-10-31T09:04:00+10:00'}),
 (r1)-[:REPAYS]->(l2), (r1)-[:PAID_BY]->(carol), (r2)-[:REPAYS]->(l2), (r2)-[:PAID_BY]->(carol),
// C1 — a claimed event: Carol says she paid $200 in cash on 3 Nov
 (c1:Claim {id: 'claim:C1', claimed_label: 'Repayment', amount_cents: 20000, at: DATETIME '2026-11-03T12:00:00+10:00', likelihood: 'likely', confidence: 'high', status: 'open'}),
 (c1)-[:ABOUT {role: 'REPAYS'}]->(l2), (c1)-[:ABOUT {role: 'PAID_BY'}]->(carol),
// C2 — a claimed relationship: Dan is employed by Acme
 (c2:Claim {id: 'claim:C2', claimed_relationship: 'EMPLOYED_BY', likelihood: 'even-chance', confidence: 'low', status: 'open'}),
 (c2)-[:ABOUT {role: 'subject'}]->(dan), (c2)-[:ABOUT {role: 'object'}]->(acme),
// C3 — a claimed property value, itself approximate (ISO 8601-2: 2019, approximately)
 (c3:Claim {id: 'claim:C3', claimed_property: 'employed_since', claimed_value: '2019~', likelihood: 'likely', confidence: 'moderate', status: 'open'}),
 (c3)-[:ABOUT {role: 'subject'}]->(dan),
// D1 — a derived claim: Dan can afford a loan; needs C2 and C3 both true; they share a source, so dependence is unknown
 (d1:Claim {id: 'claim:D1', claimed_property: 'can_afford_loan', claimed_value: 'yes', likelihood: 'almost-no-chance', likelihood_to: 'even-chance', low_pct: 0.0, high_pct: 55.0, combine: 'both', dependence: 'unknown', confidence: 'low', status: 'open', rule: 'rule:combine@1'}),
 (d1)-[:ABOUT {role: 'subject'}]->(dan), (d1)-[:WAS_DERIVED_FROM]->(c2), (d1)-[:WAS_DERIVED_FROM]->(c3),
// Evidence, each attributed to its source
 (e1:Evidence {id: 'evidence:E1', kind: 'text message', at: DATETIME '2026-11-03T12:10:00+10:00'}), (e1)-[:FROM]->(carol),
 (e2:Evidence {id: 'evidence:E2', kind: 'witness statement', at: DATETIME '2026-11-05T18:00:00+10:00'}), (e2)-[:FROM]->(bob),
 (e3:Evidence {id: 'evidence:E3', kind: 'loan application', at: DATETIME '2026-10-20T10:00:00+10:00'}), (e3)-[:FROM]->(dan),
 (e4:Evidence {id: 'evidence:E4', kind: 'email reply', at: DATETIME '2026-11-02T15:00:00+10:00'}), (e4)-[:FROM]->(acme),
 (c1)-[:SUPPORTED_BY]->(e1), (c1)-[:SUPPORTED_BY]->(e2),
 (c2)-[:SUPPORTED_BY]->(e3), (c2)-[:CONTRADICTED_BY]->(e4),
 (c3)-[:SUPPORTED_BY]->(e3),
// Assessments — the likelihood is a dated judgement by a person
 (a1:Event:Assessment {id: 'assess:C1/1', likelihood: 'even-chance', at: DATETIME '2026-11-04T09:00:00+10:00'}), (a1)-[:ASSESSES]->(c1), (a1)-[:BY]->(alice),
 (a2:Event:Assessment {id: 'assess:C1/2', likelihood: 'likely', at: DATETIME '2026-11-06T09:00:00+10:00'}), (a2)-[:ASSESSES]->(c1), (a2)-[:BY]->(alice),
 (a3:Event:Assessment {id: 'assess:C2/1', likelihood: 'even-chance', at: DATETIME '2026-11-04T09:10:00+10:00'}), (a3)-[:ASSESSES]->(c2), (a3)-[:BY]->(alice),
 (a4:Event:Assessment {id: 'assess:C3/1', likelihood: 'likely', at: DATETIME '2026-11-04T09:20:00+10:00'}), (a4)-[:ASSESSES]->(c3), (a4)-[:BY]->(alice),
// C4 — a claim nobody can yet judge: Bob says Dan has a second loan elsewhere
 (c4:Claim {id: 'claim:C4', claimed_relationship: 'BORROWER', likelihood: 'cannot-judge', confidence: 'low', status: 'open'}),
 (c4)-[:ABOUT {role: 'object'}]->(dan),
 (a5:Event:Assessment {id: 'assess:C4/1', likelihood: 'cannot-judge', at: DATETIME '2026-11-07T10:00:00+10:00'}), (a5)-[:ASSESSES]->(c4), (a5)-[:BY]->(alice)
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: certainty
title: Certainty — claims beside facts
kind: graphs
rounds:
  - name: before the receipt
    documents: ["Certainty test — claims about loan L2"]
    rules: [section20]
    expect:
      figures:
        - {test: C1, figure: loan-balance, of: "loan:L2", result: ok, value: 200000, currency: AUD}
      claim_values:
        - {test: C2, claim: "claim:C1", likelihood: likely, confidence: high}
        - {test: C3, claim: "claim:C2", likelihood: even-chance, confidence: low}
        - {test: C4, claim: "claim:C3", likelihood: likely, confidence: moderate, claimed_value: "2019~"}
        - {test: C5, claim: "claim:C4", likelihood: cannot-judge, confidence: low}
        - {test: C6, claim: "claim:D1", likelihood: almost-no-chance, likelihood_to: even-chance, low_pct: 0.0, high_pct: 55.0, confidence: low}
      lens: {test: C7, buckets: {"claim:C1": probable, "claim:C2": open, "claim:C3": probable, "claim:C4": open, "claim:D1": open}}
      band_values: {test: C8, of: {likely: [55, 80], even-chance: [45, 55]}}
    mutations:
      - {test: C9, name: "the rejected inline form — the doubtful payment written as an ordinary repayment", document: "Certainty test — claims about loan L2", append: ",\n (x1:Event:Repayment {id: 'R-claimed', amount_cents: 20000, likelihood: 'likely'}),\n (x1)-[:REPAYS]->(l2)"}
      - {test: C10, name: "a likelihood typed in that no assessment supports", document: "Certainty test — claims about loan L2", replace: "likelihood: 'likely', confidence: 'high'", with: "likelihood: 'very-likely', confidence: 'high'"}
      - {test: C10, name: "a confidence higher than the evidence supports", document: "Certainty test — claims about loan L2", replace: "likelihood: 'likely', confidence: 'moderate'", with: "likelihood: 'likely', confidence: 'high'"}
      - {test: C10, name: "a derived claim stored narrower than its inputs allow", document: "Certainty test — claims about loan L2", replace: "likelihood: 'almost-no-chance', likelihood_to: 'even-chance', low_pct: 0.0", with: "likelihood: 'even-chance', likelihood_to: 'even-chance', low_pct: 45.0"}
      - {test: C10, name: "a likelihood word outside the declared scale", document: "Certainty test — claims about loan L2", replace: "likelihood: 'likely', confidence: 'moderate'", with: "likelihood: 'probable', confidence: 'moderate'"}
  - name: after the receipt
    documents: ["Certainty test — claims about loan L2", "Certainty test — the receipt"]
    rules: [section20]
    expect:
      figures:
        - {test: C1, figure: loan-balance, of: "loan:L2", result: ok, value: 180000, currency: AUD}
      claim_values:
        - {test: C7, claim: "claim:C1", status: confirmed}
      lens: {test: C7, buckets: {"claim:C1": confirmed, "claim:C2": open, "claim:C3": probable, "claim:C4": open, "claim:D1": open}}
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: ranges
title: Combining two claims as ranges
kind: graphs
rounds:
  - name: the arithmetic
    documents: ["Certainty test — claims about loan L2"]
    expect:
      ranges:
        - {test: R1, op: both, a: even-chance, b: likely, dependence: unknown, range: [0, 55], words: almost-no-chance to even-chance}
        - {test: R1, op: both, a: even-chance, b: likely, dependence: independent, range: [24.75, 44], words: unlikely}
        - {test: R2, op: either, a: even-chance, b: likely, dependence: unknown, range: [55, 100], words: likely to almost-certain}
        - {test: R2, op: neither, a: even-chance, b: likely, dependence: unknown, range: [0, 45], words: almost-no-chance to unlikely}
        - {test: R3, op: both, a: likely, b: likely, dependence: independent, range: [30.25, 64], words: unlikely to likely}
        - {test: R3, op: both, a: likely, b: likely, dependence: unknown, range: [10, 80], words: very-unlikely to likely}
        - {test: R4, op: both, a: cannot-judge, b: likely, dependence: unknown, range: [0, 80], words: almost-no-chance to likely}
      outcomes:
        - {test: R5, a: even-chance, b: likely, of: {"both true": [24.75, 44], "only the first": [9, 24.75], "only the second": [24.75, 44], "neither": [9, 24.75], "exactly one": [47, 53]}}
      independence:
        - {test: R6, claims: ["claim:C2", "claim:C3"], allowed: false}
        - {test: R6, claims: ["claim:C1", "claim:C3"], allowed: true}
```
