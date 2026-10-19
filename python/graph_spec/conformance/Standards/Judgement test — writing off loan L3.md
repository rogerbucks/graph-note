---
created: 2026-10-05T11:16
modified: 2026-10-05T19:37
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec judgements.aiplan]]"
    type: RELATED_TO
    direction: out
---

# Judgement test — writing off loan L3

**A test document, not a record.** Two judgements made from a loan book under §23 of [[Graph spec model]]: writing off loan L3, drafted by one model, challenged by another and decided by Alice; and keeping loan L1 on its schedule, decided by Alice alone. Then the world moves, one change at a time, to show each judgement folded away until a rule brings it back. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| G1 | both judgements, as decided | nothing to review |
| G2 | the *why* layer on L3's whole life, at Overview | the write-off — it rests on facts folded under *servicing* |
| G3 | the *why* layer on L3's origination | nothing — the write-off read nothing there |
| G4 | the *why* layer on L1's arrears | the L1 judgement only |
| G5 | a part payment changes L3's balance, which the write-off read | the write-off surfaces: basis moved |
| G6 | L3's servicer changes, which no judgement read | nothing surfaces |
| G7 | the grace-expiry fact is corrected by a superseding fact | the write-off surfaces: basis moved |
| G8 | *no recovery* is reassessed from *likely* to *even chance* | the write-off surfaces: assumption weakened |
| G9 | a finding refutes *no other assets* | the write-off surfaces: assumption weakened |
| G10 | the arrears process gets a new version | both judgements surface: shape changed |
| G11 | after the part payment, Alice reaffirms the write-off | the old judgement is superseded and leaves review; the new one is clear |
| G19 | L1 falls behind again — nothing the L1 judgement hashed has changed, but L1 has left the *current* bucket of the arrears lens it rested on | the L1 judgement surfaces: basis moved; the write-off does not |
| G20 | a lens pin that does not say which bucket | caught by rule 2 |
| G12 | a judgement decided by a model | caught by rule 1 |
| G13 | a pin read after the decision was made | caught by rule 2 |
| G14 | an assumption that is a fact, not a claim | caught by rule 3 |
| G15 | a stored review that disagrees with the rule | caught by rule 4 |
| G16 | the loan book links back into the judgements | caught by rule 5 |
| G17 | a proposal that names no model | caught by rule 6 |
| G18 | a pin edited in place instead of a new decision | caught by rule 7 |
| G21 | the model's proposal with its serving taken away | caught by §24 H3 rule 4 |

## The data

```gql
// graph: loanbook · SOURCE · example — a loan book that judgements are made from
INSERT
 (meta:GraphMeta {id: 'meta:loanbook', graph: 'loanbook', schema: 'loanbook@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (tPe:Meta:ElementType {id: 'meta:loanbook:Person', kind: 'node', name: 'Person', origin: 'source', aligns_with: 'prov:Agent'}), (meta)-[:DECLARES]->(tPe),
 (tMo:Meta:ElementType {id: 'meta:loanbook:Model', kind: 'node', name: 'Model', origin: 'source', aligns_with: 'prov:SoftwareAgent'}), (meta)-[:DECLARES]->(tMo),
 (tLo:Meta:ElementType {id: 'meta:loanbook:Loan', kind: 'node', name: 'Loan', origin: 'source'}), (meta)-[:DECLARES]->(tLo),
 (tEv:Meta:ElementType {id: 'meta:loanbook:Event', kind: 'node', name: 'Event', origin: 'source'}), (meta)-[:DECLARES]->(tEv),
 (tPa:Meta:ElementType {id: 'meta:loanbook:Path', kind: 'node', name: 'Path', origin: 'source'}), (meta)-[:DECLARES]->(tPa),
 (tAl:Meta:ElementType {id: 'meta:loanbook:Altitude', kind: 'node', name: 'Altitude', origin: 'source'}), (meta)-[:DECLARES]->(tAl),
 (tCl:Meta:ElementType {id: 'meta:loanbook:Claim', kind: 'node', name: 'Claim', origin: 'source', aligns_with: 'rdf:Statement'}), (meta)-[:DECLARES]->(tCl),
 (tAs:Meta:ElementType {id: 'meta:loanbook:Assessment', kind: 'node', name: 'Assessment', origin: 'source', aligns_with: 'prov:Activity'}), (meta)-[:DECLARES]->(tAs),
 (tFi:Meta:ElementType {id: 'meta:loanbook:Finding', kind: 'node', name: 'Finding', origin: 'source'}), (meta)-[:DECLARES]->(tFi),
 (tLB:Meta:ElementType {id: 'meta:loanbook:LikelihoodBand', kind: 'node', name: 'LikelihoodBand', origin: 'source'}), (meta)-[:DECLARES]->(tLB),
 (tPr:Meta:ElementType {id: 'meta:loanbook:Process', kind: 'node', name: 'Process', origin: 'source'}), (meta)-[:DECLARES]->(tPr),
 (tRe:Meta:ElementType {id: 'meta:loanbook:Ref', kind: 'node', name: 'Ref', origin: 'reference'}), (meta)-[:DECLARES]->(tRe),
 (tLz:Meta:ElementType {id: 'meta:loanbook:Lens', kind: 'node', name: 'Lens', origin: 'source'}), (meta)-[:DECLARES]->(tLz),
 (eAp:Meta:ElementType {id: 'meta:loanbook:APPLIES_TO', kind: 'edge', name: 'APPLIES_TO', origin: 'source', reading: 'applies to', reverse_name: 'has event'}), (meta)-[:DECLARES]->(eAp),
 (eSt:Meta:ElementType {id: 'meta:loanbook:STEP', kind: 'edge', name: 'STEP', origin: 'source', reading: 'has step', reverse_name: 'is a step of', identified_by: 'seq'}), (meta)-[:DECLARES]->(eSt),
 (eAb:Meta:ElementType {id: 'meta:loanbook:ABOUT', kind: 'edge', name: 'ABOUT', origin: 'source', reading: 'is about', reverse_name: 'is the subject of'}), (meta)-[:DECLARES]->(eAb),
 (eAs:Meta:ElementType {id: 'meta:loanbook:ASSESSES', kind: 'edge', name: 'ASSESSES', origin: 'source', reading: 'assesses', reverse_name: 'is assessed by'}), (meta)-[:DECLARES]->(eAs),
 (eBy:Meta:ElementType {id: 'meta:loanbook:BY', kind: 'edge', name: 'BY', origin: 'source', reading: 'is made by', reverse_name: 'made', aligns_with: 'prov:wasAssociatedWith'}), (meta)-[:DECLARES]->(eBy),
 (eRf:Meta:ElementType {id: 'meta:loanbook:REFUTES', kind: 'edge', name: 'REFUTES', origin: 'source', reading: 'refutes', reverse_name: 'is refuted by'}), (meta)-[:DECLARES]->(eRf),
 (eSu:Meta:ElementType {id: 'meta:loanbook:SUPERSEDES', kind: 'edge', name: 'SUPERSEDES', origin: 'source', reading: 'supersedes', reverse_name: 'is superseded by'}), (meta)-[:DECLARES]->(eSu),
// the likelihood scale (§20)
 (b1:LikelihoodBand {id: 'band:almost-no-chance', term: 'almost-no-chance', rank: 1, low_pct: 1, high_pct: 5}), (b2:LikelihoodBand {id: 'band:very-unlikely', term: 'very-unlikely', rank: 2, low_pct: 5, high_pct: 20}),
 (b3:LikelihoodBand {id: 'band:unlikely', term: 'unlikely', rank: 3, low_pct: 20, high_pct: 45}), (b4:LikelihoodBand {id: 'band:even-chance', term: 'even-chance', rank: 4, low_pct: 45, high_pct: 55}),
 (b5:LikelihoodBand {id: 'band:likely', term: 'likely', rank: 5, low_pct: 55, high_pct: 80}), (b6:LikelihoodBand {id: 'band:very-likely', term: 'very-likely', rank: 6, low_pct: 80, high_pct: 95}),
 (b7:LikelihoodBand {id: 'band:almost-certain', term: 'almost-certain', rank: 7, low_pct: 95, high_pct: 99}), (b0:LikelihoodBand {id: 'band:cannot-judge', term: 'cannot-judge', rank: 0, low_pct: 0, high_pct: 100}),
// who acts — a person and two models
 (alice:Person {id: 'person:alice', name: 'Alice'}),
 (drafter:Model {id: 'model:drafter', name: 'drafting model'}),
 (challenger:Model {id: 'model:challenger', name: 'challenging model'}),
// the process both judgements were made under — its shape
 (proc1:Process {id: 'process:arrears@1', name: 'arrears', version: 1}),
// a lens over the loans (§15) — membership computed on demand by the rule it holds
 (arrears_lens:Lens {id: 'lens:arrears@1', applies_to: 'Loan', buckets: 'current, late, in-arrears', rule_gql: 'MATCH (l:Loan) RETURN l.id AS id, CASE WHEN l.days_late = 0 THEN \'current\' WHEN l.days_late < 30 THEN \'late\' ELSE \'in-arrears\' END AS grp'}),
// the loans and their facts
 (L3:Loan {id: 'loan:L3', balance_cents: 500000, days_late: 44, servicer: 'collections-a'}),
 (L1:Loan {id: 'loan:L1', balance_cents: 120000, days_late: 0, servicer: 'collections-a'}),
 (request:Event {id: 'ev:L3/request', kind: 'Request', at: DATE '2026-09-20'}),
 (sign:Event {id: 'ev:L3/sign', kind: 'Sign', at: DATE '2026-09-25'}),
 (drawdown:Event {id: 'ev:L3/drawdown', kind: 'Drawdown', at: DATE '2026-10-01'}),
 (missed:Event {id: 'ev:L3/missed', kind: 'InstalmentMissed', at: DATE '2026-11-01'}),
 (grace:Event {id: 'ev:L3/grace', kind: 'GraceExpired', at: DATE '2026-11-08'}),
 (l1missed:Event {id: 'ev:L1/missed', kind: 'InstalmentMissed', at: DATE '2026-10-15'}),
 (l1cured:Event {id: 'ev:L1/cured', kind: 'Repayment', at: DATE '2026-10-20'}),
 (request)-[:APPLIES_TO]->(L3), (sign)-[:APPLIES_TO]->(L3), (drawdown)-[:APPLIES_TO]->(L3), (missed)-[:APPLIES_TO]->(L3), (grace)-[:APPLIES_TO]->(L3),
 (l1missed)-[:APPLIES_TO]->(L1), (l1cured)-[:APPLIES_TO]->(L1),
// the stories, at altitudes (§22)
 (a3:Altitude {id: 'altitude:3', level: 3, name: 'Overview'}), (a2:Altitude {id: 'altitude:2', level: 2, name: 'Working'}),
 (a1:Altitude {id: 'altitude:1', level: 1, name: 'Detail'}), (a0:Altitude {id: 'altitude:0', level: 0, name: 'Facts'}),
 (life:Path {id: 'path:L3/life', altitude: 3, name: 'Loan L3, start to now', ordered_by: 'at'}),
 (orig:Path {id: 'path:L3/origination', altitude: 2, name: 'L3 agreed', ordered_by: 'at'}),
 (serv:Path {id: 'path:L3/servicing', altitude: 2, name: 'L3 drawn and fell behind', ordered_by: 'at'}),
 (arr3:Path {id: 'path:L3/arrears-nov', altitude: 1, name: 'L3 in arrears, November', ordered_by: 'at'}),
 (arr1:Path {id: 'path:L1/arrears-oct', altitude: 1, name: 'L1 in arrears, October', ordered_by: 'at'}),
 (life)-[:STEP {seq: 1}]->(orig), (life)-[:STEP {seq: 2}]->(serv),
 (orig)-[:STEP {seq: 1}]->(request), (orig)-[:STEP {seq: 2}]->(sign),
 (serv)-[:STEP {seq: 1}]->(drawdown), (serv)-[:STEP {seq: 2}]->(arr3),
 (arr3)-[:STEP {seq: 1}]->(missed), (arr3)-[:STEP {seq: 2}]->(grace),
 (arr1)-[:STEP {seq: 1}]->(l1missed), (arr1)-[:STEP {seq: 2}]->(l1cured),
// the assumptions — claims (§20); the drafter raised the first, the challenger the second
 (norec:Claim {id: 'claim:L3/no-recovery', claimed_property: 'recovered_cents', claimed_value: 0, likelihood: 'likely', confidence: 'low', status: 'open'}),
 (noassets:Claim {id: 'claim:L3/no-other-assets', claimed_property: 'other_assets', claimed_value: 'none', likelihood: 'very-likely', confidence: 'low', status: 'open'}),
 (norec)-[:ABOUT {role: 'subject'}]->(L3), (noassets)-[:ABOUT {role: 'subject'}]->(L3),
 (as1:Assessment {id: 'assess:L3/no-recovery/1', at: DATE '2026-12-13', likelihood: 'likely'}), (as1)-[:ASSESSES]->(norec), (as1)-[:BY]->(drafter),
 (as2:Assessment {id: 'assess:L3/no-recovery/2', at: DATE '2026-12-14', likelihood: 'likely'}), (as2)-[:ASSESSES]->(norec), (as2)-[:BY]->(alice),
 (as3:Assessment {id: 'assess:L3/no-other-assets/1', at: DATE '2026-12-14', likelihood: 'very-likely'}), (as3)-[:ASSESSES]->(noassets), (as3)-[:BY]->(challenger)
```

## The judgements

```gql
// graph: judgements · SOURCE · example — judgements made from the loan book; nothing in the loan book points here
INSERT
 (meta:GraphMeta {id: 'meta:judgements', graph: 'judgements', schema: 'judgements@1', owner_engine: 'engine:mac14', written_by: 'ea/sara@mac14'}),
 (tDe:Meta:ElementType {id: 'meta:judgements:Decision', kind: 'node', name: 'Decision', origin: 'source'}), (meta)-[:DECLARES]->(tDe),
 (tPp:Meta:ElementType {id: 'meta:judgements:Proposal', kind: 'node', name: 'Proposal', origin: 'source', aligns_with: 'prov:Entity'}), (meta)-[:DECLARES]->(tPp),
 (tOp:Meta:ElementType {id: 'meta:judgements:Option', kind: 'node', name: 'Option', origin: 'source'}), (meta)-[:DECLARES]->(tOp),
 (tAc:Meta:ElementType {id: 'meta:judgements:Activity', kind: 'node', name: 'Activity', origin: 'source', aligns_with: 'prov:Activity'}), (meta)-[:DECLARES]->(tAc),
 (tRe:Meta:ElementType {id: 'meta:judgements:Ref', kind: 'node', name: 'Ref', origin: 'reference'}), (meta)-[:DECLARES]->(tRe),
 (eAb:Meta:ElementType {id: 'meta:judgements:ABOUT', kind: 'edge', name: 'ABOUT', origin: 'source', reading: 'is about', reverse_name: 'is the subject of'}), (meta)-[:DECLARES]->(eAb),
 (eRo:Meta:ElementType {id: 'meta:judgements:RESTS_ON', kind: 'edge', name: 'RESTS_ON', origin: 'source', reading: 'rests on', reverse_name: 'is a basis of'}), (meta)-[:DECLARES]->(eRo),
 (eAm:Meta:ElementType {id: 'meta:judgements:ASSUMES', kind: 'edge', name: 'ASSUMES', origin: 'source', reading: 'assumes', reverse_name: 'is assumed by'}), (meta)-[:DECLARES]->(eAm),
 (eUn:Meta:ElementType {id: 'meta:judgements:UNDER', kind: 'edge', name: 'UNDER', origin: 'source', reading: 'is read under', reverse_name: 'is the shape of'}), (meta)-[:DECLARES]->(eUn),
 (eDb:Meta:ElementType {id: 'meta:judgements:DECIDED_BY', kind: 'edge', name: 'DECIDED_BY', origin: 'source', reading: 'is decided by', reverse_name: 'decided'}), (meta)-[:DECLARES]->(eDb),
 (eAd:Meta:ElementType {id: 'meta:judgements:ADOPTS', kind: 'edge', name: 'ADOPTS', origin: 'source', reading: 'adopts', reverse_name: 'is adopted by'}), (meta)-[:DECLARES]->(eAd),
 (eCo:Meta:ElementType {id: 'meta:judgements:CONSIDERED', kind: 'edge', name: 'CONSIDERED', origin: 'source', reading: 'considered', reverse_name: 'was considered in'}), (meta)-[:DECLARES]->(eCo),
 (eCh:Meta:ElementType {id: 'meta:judgements:CHOSE', kind: 'edge', name: 'CHOSE', origin: 'source', reading: 'chose', reverse_name: 'was chosen by'}), (meta)-[:DECLARES]->(eCh),
 (eRj:Meta:ElementType {id: 'meta:judgements:REJECTED', kind: 'edge', name: 'REJECTED', origin: 'source', reading: 'rejected', reverse_name: 'was rejected by'}), (meta)-[:DECLARES]->(eRj),
 (eGb:Meta:ElementType {id: 'meta:judgements:WAS_GENERATED_BY', kind: 'edge', name: 'WAS_GENERATED_BY', origin: 'source', reading: 'was generated by', reverse_name: 'generated', aligns_with: 'prov:wasGeneratedBy'}), (meta)-[:DECLARES]->(eGb),
 (eAw:Meta:ElementType {id: 'meta:judgements:ASSOCIATED_WITH', kind: 'edge', name: 'ASSOCIATED_WITH', origin: 'source', reading: 'is associated with', reverse_name: 'took part in', aligns_with: 'prov:wasAssociatedWith'}), (meta)-[:DECLARES]->(eAw),
 (eCb:Meta:ElementType {id: 'meta:judgements:CHALLENGED_BY', kind: 'edge', name: 'CHALLENGED_BY', origin: 'source', reading: 'is challenged by', reverse_name: 'challenged'}), (meta)-[:DECLARES]->(eCb),
 (eSu:Meta:ElementType {id: 'meta:judgements:SUPERSEDES', kind: 'edge', name: 'SUPERSEDES', origin: 'source', reading: 'supersedes', reverse_name: 'is superseded by'}), (meta)-[:DECLARES]->(eSu),
// references into the loan book — the only links between the two graphs, and they point one way
 (r_alice:Ref {id: 'ref:loanbook/person:alice', ref: 'person:alice', graph: 'loanbook'}),
 (r_drafter:Ref {id: 'ref:loanbook/model:drafter', ref: 'model:drafter', graph: 'loanbook'}),
 (r_challenger:Ref {id: 'ref:loanbook/model:challenger', ref: 'model:challenger', graph: 'loanbook'}),
 (r_L3:Ref {id: 'ref:loanbook/loan:L3', ref: 'loan:L3', graph: 'loanbook'}),
 (r_L1:Ref {id: 'ref:loanbook/loan:L1', ref: 'loan:L1', graph: 'loanbook'}),
 (r_grace:Ref {id: 'ref:loanbook/ev:L3/grace', ref: 'ev:L3/grace', graph: 'loanbook'}),
 (r_arr3:Ref {id: 'ref:loanbook/path:L3/arrears-nov', ref: 'path:L3/arrears-nov', graph: 'loanbook'}),
 (r_cured:Ref {id: 'ref:loanbook/ev:L1/cured', ref: 'ev:L1/cured', graph: 'loanbook'}),
 (r_norec:Ref {id: 'ref:loanbook/claim:L3/no-recovery', ref: 'claim:L3/no-recovery', graph: 'loanbook'}),
 (r_noassets:Ref {id: 'ref:loanbook/claim:L3/no-other-assets', ref: 'claim:L3/no-other-assets', graph: 'loanbook'}),
 (r_proc1:Ref {id: 'ref:loanbook/process:arrears@1', ref: 'process:arrears@1', graph: 'loanbook'}),
// the AI's work — a drafted proposal, challenged; kept whatever is decided
 (prop:Proposal {id: 'proposal:L3', question: 'What should be done about loan L3, 44 days late after its grace period?', at: DATE '2026-12-14'}),
 (draft:Activity {id: 'activity:L3/draft', kind: 'draft', at: DATE '2026-12-13'}),
 (chal:Activity {id: 'activity:L3/challenge', kind: 'challenge', at: DATE '2026-12-14'}),
 (prop)-[:WAS_GENERATED_BY]->(draft), (draft)-[:ASSOCIATED_WITH]->(r_drafter),
 (prop)-[:CHALLENGED_BY]->(chal), (chal)-[:ASSOCIATED_WITH]->(r_challenger),
 (o_wo:Option {id: 'option:L3/write-off', title: 'Write off the balance'}),
 (o_re:Option {id: 'option:L3/restructure', title: 'Restructure into smaller instalments'}),
 (o_wait:Option {id: 'option:L3/wait', title: 'Wait another month'}),
 (prop)-[:CONSIDERED]->(o_wo), (prop)-[:CONSIDERED]->(o_re), (prop)-[:CONSIDERED]->(o_wait),
// the write-off — a person's decision, adopting the proposal, with its basis pinned
 (jw:Decision {id: 'decision:L3-write-off', title: 'Write off loan L3', statement: 'Write off the balance of loan L3', rationale: 'No payment since the grace period expired, recovery is likely to fail, and the borrower very likely has no other assets', at: DATE '2026-12-15', content_hash: '27d79974004c79cc'}),
 (jw)-[:ABOUT]->(r_L3), (jw)-[:DECIDED_BY]->(r_alice), (jw)-[:ADOPTS]->(prop), (jw)-[:CHOSE]->(o_wo),
 (jw)-[:REJECTED {why: 'the borrower has no income to restructure against'}]->(o_re),
 (jw)-[:REJECTED {why: 'a further month adds default interest that will not be paid'}]->(o_wait),
 (jw)-[:RESTS_ON {as_of: DATE '2026-12-15', reads: 'balance_cents, days_late', hash: '17eaf358646b81f4'}]->(r_L3),
 (jw)-[:RESTS_ON {as_of: DATE '2026-12-15', reads: 'kind, at', hash: '27d759be8114e7c0'}]->(r_grace),
 (jw)-[:RESTS_ON {as_of: DATE '2026-12-15', reads: 'altitude, name', hash: '3364b414a745aa93'}]->(r_arr3),
 (jw)-[:ASSUMES {as_of: DATE '2026-12-15', likelihood_then: 'likely'}]->(r_norec),
 (jw)-[:ASSUMES {as_of: DATE '2026-12-15', likelihood_then: 'very-likely'}]->(r_noassets),
 (jw)-[:UNDER {as_of: DATE '2026-12-15'}]->(r_proc1),
// keeping L1 on its schedule — decided by a person alone, no proposal
 (jk:Decision {id: 'decision:L1-keep', title: 'Keep loan L1 on its schedule', statement: 'Loan L1 stays on its normal schedule', rationale: 'The October arrears were cured within five days', at: DATE '2026-10-21', content_hash: '57cae93a496fc3c0'}),
 (jk)-[:ABOUT]->(r_L1), (jk)-[:DECIDED_BY]->(r_alice),
 (jk)-[:RESTS_ON {as_of: DATE '2026-10-21', reads: 'kind, at', hash: '772c36eebe16decb'}]->(r_cured),
 (jk)-[:RESTS_ON {as_of: DATE '2026-10-21', lens: 'lens:arrears@1', bucket: 'current'}]->(r_L1),
 (jk)-[:UNDER {as_of: DATE '2026-10-21'}]->(r_proc1)
```

## Types for servings

```gql
// graph: judgements · SOURCE · later — the judgement graph declares what a serving records (§24 H3)
MATCH (meta:GraphMeta {id: 'meta:judgements'})
INSERT (tSv:Meta:ElementType {id: 'meta:judgements:Serving', kind: 'node', name: 'Serving', origin: 'source', aligns_with: 'prov:Activity'}), (meta)-[:DECLARES]->(tSv),
 (eSd:Meta:ElementType {id: 'meta:judgements:SERVED', kind: 'edge', name: 'SERVED', origin: 'source', reading: 'served', reverse_name: 'was served in', aligns_with: 'prov:used'}), (meta)-[:DECLARES]->(eSd),
 (eUs:Meta:ElementType {id: 'meta:judgements:USED', kind: 'edge', name: 'USED', origin: 'source', reading: 'used', reverse_name: 'was used by', aligns_with: 'prov:used'}), (meta)-[:DECLARES]->(eUs)
```

## The serving

What the drafting model was shown before it drafted the proposal — written by the view server (§24 H3), not by hand: `ViewServer.record_block` in `zzSupport/_scripts/graph_spec.py`. **Every proposal a model generates must have used a serving** (§24 H3 rule 4); the proposal's pins are copied from it.

```gql
// graph: judgements · SOURCE · written by the view server — what serving:L3/draft showed the drafting model, and the proposal's basis copied from it
MATCH (r4:Ref {id: 'ref:loanbook/path:L3/arrears-nov'})
MATCH (r6:Ref {id: 'ref:loanbook/ev:L3/grace'})
MATCH (r7:Ref {id: 'ref:loanbook/loan:L3'})
MATCH (pp:Proposal {id: 'proposal:L3'})
INSERT
 (sv:Serving {id: 'serving:L3/draft', at: DATE '2026-12-13', consumer: 'model:drafter', consumer_kind: 'cloud', conditions_met: FALSE}),
 (r0:Ref {id: 'ref:loanbook/path:L3/life', ref: 'path:L3/life', graph: 'loanbook'}),
 (sv)-[:SERVED {reads: 'altitude, name, ordered_by', hash: 'a85410534743ead2', as_of: DATE '2026-12-13', classification: 'Own'}]->(r0),
 (r1:Ref {id: 'ref:loanbook/ev:L3/request', ref: 'ev:L3/request', graph: 'loanbook'}),
 (sv)-[:SERVED {reads: 'at, kind', hash: '66bc7375f58fefbe', as_of: DATE '2026-12-13', classification: 'Own'}]->(r1),
 (r2:Ref {id: 'ref:loanbook/ev:L3/sign', ref: 'ev:L3/sign', graph: 'loanbook'}),
 (sv)-[:SERVED {reads: 'at, kind', hash: '724549cbbe271480', as_of: DATE '2026-12-13', classification: 'Own'}]->(r2),
 (r3:Ref {id: 'ref:loanbook/ev:L3/drawdown', ref: 'ev:L3/drawdown', graph: 'loanbook'}),
 (sv)-[:SERVED {reads: 'at, kind', hash: 'b4eea5aff82e5234', as_of: DATE '2026-12-13', classification: 'Own'}]->(r3),
 (sv)-[:SERVED {reads: 'altitude, name, ordered_by', hash: '0da15fb864c28859', as_of: DATE '2026-12-13', classification: 'Own'}]->(r4),
 (r5:Ref {id: 'ref:loanbook/ev:L3/missed', ref: 'ev:L3/missed', graph: 'loanbook'}),
 (sv)-[:SERVED {reads: 'at, kind', hash: 'a1208ca8465660ca', as_of: DATE '2026-12-13', classification: 'Own'}]->(r5),
 (sv)-[:SERVED {reads: 'at, kind', hash: '27d759be8114e7c0', as_of: DATE '2026-12-13', classification: 'Own'}]->(r6),
 (sv)-[:SERVED {reads: 'balance_cents, days_late, servicer', hash: 'aaae1ecfc82d02ce', as_of: DATE '2026-12-13', classification: 'Own'}]->(r7),
 (pp)-[:USED]->(sv),
 (pp)-[:RESTS_ON {reads: 'balance_cents, days_late, servicer', hash: 'aaae1ecfc82d02ce', as_of: DATE '2026-12-13'}]->(r7),
 (pp)-[:RESTS_ON {reads: 'at, kind', hash: '27d759be8114e7c0', as_of: DATE '2026-12-13'}]->(r6),
 (pp)-[:RESTS_ON {reads: 'altitude, name, ordered_by', hash: '0da15fb864c28859', as_of: DATE '2026-12-13'}]->(r4)
```

## Later — a part payment arrives

```gql
// graph: loanbook · SOURCE · later — $2,000 paid on loan L3
MATCH (L3:Loan {id: 'loan:L3'})
INSERT (pay:Event {id: 'ev:L3/part-payment', kind: 'Repayment', at: DATE '2027-01-10', amount_cents: 200000}), (pay)-[:APPLIES_TO]->(L3)
SET L3.balance_cents = 300000, L3.days_late = 0
```

## Later — the servicer changes

```gql
// graph: loanbook · SOURCE · later — loan L3 moves to another collections team
MATCH (L3:Loan {id: 'loan:L3'}) SET L3.servicer = 'collections-b'
```

## Later — the grace date is corrected

```gql
// graph: loanbook · SOURCE · later — the grace period was 14 days, not 7
MATCH (grace:Event {id: 'ev:L3/grace'})
INSERT (fixed:Event {id: 'ev:L3/grace-corrected', kind: 'GraceExpired', at: DATE '2026-11-15'}), (fixed)-[:SUPERSEDES {why: 'the grace period was 14 days, not 7'}]->(grace)
```

## Later — recovery looks less hopeless

```gql
// graph: loanbook · SOURCE · later — Alice reassesses 'no recovery' after a call with the borrower
MATCH (norec:Claim {id: 'claim:L3/no-recovery'}) MATCH (alice:Person {id: 'person:alice'})
INSERT (as4:Assessment {id: 'assess:L3/no-recovery/3', at: DATE '2027-01-05', likelihood: 'even-chance'}), (as4)-[:ASSESSES]->(norec), (as4)-[:BY]->(alice)
SET norec.likelihood = 'even-chance'
```

## Later — a title search finds assets

```gql
// graph: loanbook · SOURCE · later — the borrower owns a car outright
MATCH (noassets:Claim {id: 'claim:L3/no-other-assets'})
INSERT (f:Finding {id: 'finding:L3/title-search', kind: 'title search', recorded_at: DATE '2027-01-08'}), (f)-[:REFUTES]->(noassets)
SET noassets.status = 'refuted'
```

## Later — the arrears process is revised

```gql
// graph: loanbook · SOURCE · later — a new version of the arrears process
MATCH (proc1:Process {id: 'process:arrears@1'})
INSERT (proc2:Process {id: 'process:arrears@2', name: 'arrears', version: 2}), (proc2)-[:SUPERSEDES {why: 'grace period extended to 14 days'}]->(proc1)
```

## Later — L1 falls behind again

```gql
// graph: loanbook · SOURCE · later — L1 misses its November instalment; its days late (a cache) move with it
MATCH (L1:Loan {id: 'loan:L1'})
INSERT (miss:Event {id: 'ev:L1/missed-nov', kind: 'InstalmentMissed', at: DATE '2026-11-15'}), (miss)-[:APPLIES_TO]->(L1)
SET L1.days_late = 40
```

## Later — the write-off is reaffirmed

```gql
// graph: judgements · SOURCE · later — after the part payment, Alice reaffirms the write-off of what remains
MATCH (jw:Decision {id: 'decision:L3-write-off'}) MATCH (r_L3:Ref {id: 'ref:loanbook/loan:L3'}) MATCH (r_alice:Ref {id: 'ref:loanbook/person:alice'})
MATCH (r_grace:Ref {id: 'ref:loanbook/ev:L3/grace'}) MATCH (r_arr3:Ref {id: 'ref:loanbook/path:L3/arrears-nov'})
MATCH (r_norec:Ref {id: 'ref:loanbook/claim:L3/no-recovery'}) MATCH (r_noassets:Ref {id: 'ref:loanbook/claim:L3/no-other-assets'})
MATCH (r_proc1:Ref {id: 'ref:loanbook/process:arrears@1'}) MATCH (o_wo:Option {id: 'option:L3/write-off'})
INSERT (jw2:Decision {id: 'decision:L3-write-off-2', title: 'Write off loan L3 — reaffirmed', statement: 'Write off the remaining balance of loan L3', rationale: 'The part payment reduced the balance; nothing else read has changed', at: DATE '2027-01-12', content_hash: '7f0b77f885d79b7c'}),
 (jw2)-[:SUPERSEDES {why: 'reaffirmed — basis moved: a part payment of $2,000 on 10 Jan 2027; the remaining $3,000 is still not expected to be recovered'}]->(jw),
 (jw2)-[:ABOUT]->(r_L3), (jw2)-[:DECIDED_BY]->(r_alice), (jw2)-[:CHOSE]->(o_wo),
 (jw2)-[:RESTS_ON {as_of: DATE '2027-01-12', reads: 'balance_cents, days_late', hash: '633ead328152b4c4'}]->(r_L3),
 (jw2)-[:RESTS_ON {as_of: DATE '2027-01-12', reads: 'kind, at', hash: '27d759be8114e7c0'}]->(r_grace),
 (jw2)-[:RESTS_ON {as_of: DATE '2027-01-12', reads: 'altitude, name', hash: '3364b414a745aa93'}]->(r_arr3),
 (jw2)-[:ASSUMES {as_of: DATE '2027-01-12', likelihood_then: 'likely'}]->(r_norec),
 (jw2)-[:ASSUMES {as_of: DATE '2027-01-12', likelihood_then: 'very-likely'}]->(r_noassets),
 (jw2)-[:UNDER {as_of: DATE '2027-01-12'}]->(r_proc1)
```

## Computed values

Every hash in this document is computed, never typed (§24 rule 4). Each is a recipe below; `zzSupport/_scripts/graph-spec-fill.py` fills each named placeholder — the name between double braces — from its recipe and records the value, and `--check` proves every value still matches.

```yaml
# fill — computed values (§24 H2)
H_L3: {basis: 'loan:L3', graph: loanbook, reads: 'balance_cents, days_late', load: ['#The data'], value: 17eaf358646b81f4, uses: 2}
H_GRACE: {basis: 'ev:L3/grace', graph: loanbook, reads: 'kind, at', load: ['#The data'], value: 27d759be8114e7c0, uses: 4}
H_ARR3: {basis: 'path:L3/arrears-nov', graph: loanbook, reads: 'altitude, name', load: ['#The data'], value: 3364b414a745aa93, uses: 2}
H_CURED: {basis: 'ev:L1/cured', graph: loanbook, reads: 'kind, at', load: ['#The data'], value: 772c36eebe16decb, uses: 1}
H_L3_PAID: {basis: 'loan:L3', graph: loanbook, reads: 'balance_cents, days_late', load: ['#The data', '#Later — a part payment arrives'], value: 633ead328152b4c4, uses: 2}
C_W: {judgement: 'decision:L3-write-off', graph: judgements, load: ['#The data', '#The judgements'], value: 27d79974004c79cc, uses: 1}
C_K: {judgement: 'decision:L1-keep', graph: judgements, load: ['#The data', '#The judgements'], value: 57cae93a496fc3c0, uses: 1}
C_W2: {judgement: 'decision:L3-write-off-2', graph: judgements, load: ['#The data', '#The judgements', '#Later — a part payment arrives', '#Later — the write-off is reaffirmed'], value: 7f0b77f885d79b7c, uses: 1}
```

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17). Each round loads the data and the judgements, then one later change.

```yaml
# conformance case
case: judgements
title: Judgements folded away until a rule brings them back
kind: graphs
rounds:
  - name: as decided
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving"]
    rules: [paths, section20, judgements]
    expect:
      review: [{test: G1, graph: judgements, of: {"decision:L3-write-off": [], "decision:L1-keep": []}}]
      why:
        - {test: G2, graph: judgements, data: loanbook, top: "path:L3/life", level: 3, judgements: ["decision:L3-write-off"]}
        - {test: G3, graph: judgements, data: loanbook, top: "path:L3/origination", level: 2, judgements: []}
        - {test: G4, graph: judgements, data: loanbook, top: "path:L1/arrears-oct", level: 1, judgements: ["decision:L1-keep"]}
    mutations:
      - {test: G12, name: "a judgement decided by a model", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: "(jw)-[:DECIDED_BY]->(r_alice)", with: "(jw)-[:DECIDED_BY]->(r_drafter)", expect_check: "§23 rule 1"}
      - {test: G13, name: "a pin read after the decision was made", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: "(jk)-[:RESTS_ON {as_of: DATE '2026-10-21'", with: "(jk)-[:RESTS_ON {as_of: DATE '2026-10-22'", expect_check: "§23 rule 2"}
      - {test: G14, name: "an assumption that is a fact, not a claim", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: "likelihood_then: 'likely'}]->(r_norec)", with: "likelihood_then: 'likely'}]->(r_grace)", expect_check: "§23 rule 3"}
      - {test: G15, name: "a stored review that disagrees with the rule", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: "(jk:Decision {id: 'decision:L1-keep',", with: "(jk:Decision {id: 'decision:L1-keep', review: 'shape-changed',", expect_check: "§23 rule 4"}
      - {test: G16, name: "the loan book links back into the judgements", document: "Judgement test — writing off loan L3", append: ",\n (back:Ref {id: 'ref:judgements/decision:L3-write-off', ref: 'decision:L3-write-off', graph: 'judgements'})", expect_check: "§23 rule 5"}
      - {test: G17, name: "a proposal that names no model", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: " (prop)-[:WAS_GENERATED_BY]->(draft), (draft)-[:ASSOCIATED_WITH]->(r_drafter),", with: "", expect_check: "§23 rule 6"}
      - {test: G20, name: "a lens pin that does not say which bucket", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: ", lens: 'lens:arrears@1', bucket: 'current'}", with: ", lens: 'lens:arrears@1'}", expect_check: "§23 rule 2"}
      - {test: G21, name: "a model's proposal that used no serving", document: "Judgement test — writing off loan L3#The serving", replace: " (pp)-[:USED]->(sv),\n", with: "", expect_check: "§24 H3 rule 4"}
      - {test: G18, name: "a pin edited in place instead of a new decision", document: "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", replace: "hash: '17eaf358646b81f4'", with: "hash: '633ead328152b4c4'", expect_check: "§23 rule 7"}
  - name: a part payment arrives
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — a part payment arrives"]
    rules: [section20, judgements]
    expect:
      review: [{test: G5, graph: judgements, of: {"decision:L3-write-off": [basis-moved], "decision:L1-keep": []}}]
  - name: the servicer changes
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — the servicer changes"]
    rules: [judgements]
    expect:
      review: [{test: G6, graph: judgements, of: {"decision:L3-write-off": [], "decision:L1-keep": []}}]
  - name: the grace date is corrected
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — the grace date is corrected"]
    rules: [judgements]
    expect:
      review: [{test: G7, graph: judgements, of: {"decision:L3-write-off": [basis-moved], "decision:L1-keep": []}}]
  - name: recovery looks less hopeless
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — recovery looks less hopeless"]
    rules: [section20, judgements]
    expect:
      review: [{test: G8, graph: judgements, of: {"decision:L3-write-off": [assumption-weakened], "decision:L1-keep": []}}]
  - name: a title search finds assets
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — a title search finds assets"]
    rules: [section20, judgements]
    expect:
      review: [{test: G9, graph: judgements, of: {"decision:L3-write-off": [assumption-weakened], "decision:L1-keep": []}}]
  - name: the arrears process is revised
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — the arrears process is revised"]
    rules: [judgements]
    expect:
      review: [{test: G10, graph: judgements, of: {"decision:L3-write-off": [shape-changed], "decision:L1-keep": [shape-changed]}}]
  - name: L1 falls behind again
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — L1 falls behind again"]
    rules: [judgements]
    expect:
      review: [{test: G19, graph: judgements, of: {"decision:L3-write-off": [], "decision:L1-keep": [basis-moved]}}]
  - name: the write-off is reaffirmed
    documents: ["Judgement test — writing off loan L3", "Judgement test — writing off loan L3#The judgements", "Judgement test — writing off loan L3#Types for servings", "Judgement test — writing off loan L3#The serving", "Judgement test — writing off loan L3#Later — a part payment arrives", "Judgement test — writing off loan L3#Later — the write-off is reaffirmed"]
    rules: [judgements]
    expect:
      review: [{test: G11, graph: judgements, of: {"decision:L3-write-off-2": [], "decision:L1-keep": []}}]
```
