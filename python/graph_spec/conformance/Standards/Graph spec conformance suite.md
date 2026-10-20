---
created: 2026-10-04T23:26
modified: 2026-10-06T16:03
status: active
test_class: Own
tags: [graph-model, specification, test]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec conformance — report]]"
    type: RELATED_TO
    direction: out
---

# Graph spec conformance suite

**The tests are part of the specification.** §17 of [[Graph spec model]] makes passing this suite a condition of conformance: an implementation must reproduce every expected answer in every case. Decided by Roger on 4 Oct 2026: *"make the tests part of the spec."*

## How the suite is built

- **A case is a set of test documents plus their expected answers, written as data.** The case sits in a `yaml` block that starts `# conformance case`, in the case's lead document. It names its documents, its configuration, any findings, and what must come out.
- **The documents are ordinary documents** with a GQL block (§3). Each one's *planted conditions* table explains the case in prose. The test ids in those tables must match the test ids in the case data, so the prose cannot drift from what is checked.
- **Configurations are declared data**, below — the unit maps, restatements, limits and rules a join reads. In a deployment they would sit in the catalog (§4). **Rules are GQL text** where GQL can express them — five of the six. Each names the checker's own logic as its reference, and every case checks that the two agree. The sixth, §16 rule 3 at every level, stays as named checker logic, because it walks up through a computed link that GQL's path patterns cannot follow.
- **Every case is also checked for the general properties**, with no need to list them:
  - every element has a declared type (§5);
  - the join gives the same result in any document order, and a document joined with itself changes nothing;
  - nothing any document said is lost, and nothing is invented;
  - the flat projection rebuilds the graph (§18);
  - nothing that is asserted breaks §7, §12, §16 or a declared rule.
- **Every tampered document must be caught** — and, where it matters, by the right check. A case may list *mutations*: a deliberate change to one of its documents. The suite must then fail, and a mutation may name the check (`expect_check`) or the message (`expect_message`) that must catch it.
- **A block that names no graph is refused**, with the reason (§3). **Things a reader should know but that are not failures** — such as how many of Word's curly quotes were straightened — are listed as *notices* in the report.
- **Every safeguard must be shown to be necessary.** The runner switches each one off in turn, and at least one case must then fail. A safeguard no case needs is either redundant or untested.
- **Runner:** `zzSupport/_scripts/graph-spec-conformance.py`, using `zzSupport/_scripts/graph_spec.py`, with Grafeo 0.5.43 in `~/.venvs/graphspec`. The result is [[Graph spec conformance — report]], which is generated and never hand-edited.

```bash
~/.venvs/graphspec/bin/python zzSupport/_scripts/graph-spec-conformance.py
```

## Cases

| Case | Lead document | Covers |
|---|---|---|
| The lending demo | [[Lending demo test — rebuild from source]] | E8, E13 — rebuild from source, the Cypher round trip, the known answers one by one, §5 and §18 on every graph, back-dating; the engine feature by feature — posting, scheduler, close proofs, statements, provenance |
| Lenses and zoom | [[Lens test — renovation portfolio]] | E12 — two lenses, stored membership proved, zoom links resolving |
| Certainty | [[Certainty test — claims about loan L2]] | E14 — claims beside facts, the likelihood scale, counted confidence, derived ranges; the receipt added by a second document |
| Combining two claims | [[Certainty test — claims about loan L2]] | E14a — the range arithmetic, checked against brute force |
| Calibration | [[Calibration test — a settled history]] | E14b — calibration, source reliability, the derived marker, corroboration |
| Sub-flow equivalence | [[Sub-flow test — loan with arrears as a sub-flow]] | E15 — the sub-flow against the flat process, the SCXML export against the W3C schema |
| Two documents | [[Join test A — lender's notes]] | §21 — restatements, value, identity, duplicates, three kinds of paradox, an undeclared unit, an invalid input; a second round after investigation |
| Three documents | [[Join test C — broker's notes]] | §21 — two-to-one support, compatible and incompatible values, a paradox only all three form |
| Two revisions of one version | [[Join test A2 — lender's notes, revised]] | §21 — one-sided edits and removals, both changed, removals that meet a change |
| A Word document | [[Join test B — borrower's notes (Word).docx]] | §3 — a block read from a Word content control, curly quotes straightened, joining identically |
| Two process views | [[Join test P1 — loan process, operations view]] | §21 with §7 |
| Two process views with sub-flows | [[Join test P3 — servicing with an arrears sub-flow, operations view]] | §21 with §16 |
| Nested sub-flows | [[Join test P5 — nested sub-flows, operations view]] | §16 rule 3 at every level; `done` passing up two levels |
| A nesting loop | [[Join test P7 — recovery opens back into servicing]] | §16 — three views that close a loop only when all are joined; the loop held as one paradox; the engine told which flow to run |
| Paths and altitude | [[Altitude test — loan L3 at four altitudes]] | E19, §22 — lift, view at each altitude, sideways through a concept, lifting a concept, and a mutation per rule |
| Judgements | [[Judgement test — writing off loan L3]] | E20, §23 — judgements beside a loan book, a round per trigger, the why layer at altitudes, and a mutation per rule; its hashes are computed from recipes (§24 H2) |
| The view server | [[View test — loan L3 served to a model]] | E21, §24 H3 — serve and fold within a budget, zoom only to what was shown, the fence, classification refusals read from the matrix, the stored Serving and the proposal's copied pins; three mutations |
| Change sets | [[Change set test — additions proposed for loan L3]] | E22, §24 H4 — three sets offered, seven refused, each for its own reason and saying what to change; the cache refresh an engine would make |
| The AI tasks' grader | `zzSupport/_scripts/graph-spec-ai-bench.py --self-test` | §24 H9 — for each of six tasks, a right answer passes and a wrong one fails, with no model called; model runs are recorded in [[Graph spec AI conformance — results]] |
| The spec describes itself | [[Graph spec meta-schema]] · [[Graph spec requirements]] | §5, §17, §24 H6 — the meta-schema types itself and equals every checker's built-in copy, in Python, JavaScript and Grafeo; every *must* and *should* line is quoted by a requirement, every quote is still in its section, and every named test exists; each drift check caught on a tampered copy. `zzSupport/_scripts/graph-spec-trace.py` |
| The dialect linter | [[Dialect test — seven traps in Grafeo 0.5.43]] | §24 H1, E10 — four queries with known answers; each of seven traps caught by the linter; the four silent ones proved silent without it |

**Every proof in the specification's examples is in the suite.** A full run takes about 20 seconds.

## Configurations

```yaml
# configuration: ledger
unit_maps:
  ledger@1: {principal: [principal_cents, 100], amount: [amount_cents, 100]}
time_restatements: {employer: EMPLOYED_BY}
acyclic: [SUPERSEDES, PART_OF]
at_most_one:
  - {type: SUPERSEDES, side: in, rule: "a decision has at most one successor (§12)"}
  - {type: BORROWER, side: out, rule: "a loan has one borrower"}
constraints:
  - why: "repaid before it was drawn down"
    reference: repaid-after-drawn
    gql: |
      MATCH (r)-[:REPAYS]->(l)
      WHERE r.at IS NOT NULL AND l.drawn_at IS NOT NULL AND r.at < l.drawn_at
      RETURN [[r.id, 'at'], [l.id, 'drawn_at']] AS slots
vocabulary:
  Loan: [id, principal_cents, currency, fee_cents, drawn_at]
  Repayment: [id, amount_cents, at]
  Person: [id, name, customer_since]
  Organisation: [id, name]
  Project: [id, name]
  Decision: [id, title]
types:
  nodes: [Party, Person, Organisation, Loan, Repayment, Project, Decision]
  edges: {LENDER: lends on, BORROWER: borrows on, ARRANGED_BY: arranges, REPAYS: is repaid by, PART_OF: contains, SUPERSEDES: is superseded by, EMPLOYED_BY: employs}
readings: {LENDER: has lender, BORROWER: has borrower, ARRANGED_BY: is arranged by, REPAYS: repays, PART_OF: is part of, SUPERSEDES: supersedes, EMPLOYED_BY: is employed by}
```

```yaml
# configuration: process
identified_by: {TRANSITION: [event, guard]}
vocabulary_maps:
  - {type: TRANSITION, attribute: event, map: {Payment: Repayment}}
guard_cases:
  Repayment:
    - {balance_after: 0, arrears_cleared: true}
    - {balance_after: 500, arrears_cleared: true}
    - {balance_after: 500, arrears_cleared: false}
constraints:
  - why: "a flow has one start state"
    reference: one-start
    gql: |
      MATCH (s:State) WHERE s.initial = TRUE
      WITH s.flow AS flow, collect([s.id, 'initial']) AS slots, count(s) AS n
      WHERE n > 1
      RETURN slots
  - why: "a final state has no way out"
    reference: final-is-final
    gql: |
      MATCH (s:State)-[t:TRANSITION]->(x:State) WHERE s.final = TRUE
      RETURN [[s.id, 'final']] AS slots, [{from: s.id, type: 'TRANSITION', to: x.id, event: t.event, guard: t.guard}] AS edges
types:
  nodes: [State]
  edges: {TRANSITION: is entered from}
readings: {TRANSITION: moves to}
```

```yaml
# configuration: subflow
extends: process
at_most_one:
  - {type: DETAILED_IN, side: out, rule: "a state opens into one sub-flow"}
  - {type: DETAILED_IN, side: in, rule: "a sub-flow opens from one parent"}
constraints:
  # Rule 3 at every level walks up an unknown number of sub-flow levels through a computed link (a state's flow,
  # then the state that opens it). GQL's quantified paths follow edges, not computed links, so this rule stays as
  # named checker logic; the parent-only form below is GQL and is what the 'rule3-every-level' safeguard falls back to.
  - {rule: else-over-ancestor, why: "an else in a sub-flow pre-empts a state above it (§16 rule 3, every level)"}
  # Like rule 3 at every level, the nesting loop follows a computed link (a state's flow), so it is named checker logic too.
  - {rule: subflow-nesting-acyclic, why: "sub-flows never nest in a loop (§16)"}
  - why: "a sub-flow that can end needs done on its parent (§16 rule 4)"
    reference: subflow-needs-done
    gql: |
      MATCH (p:State)-[:DETAILED_IN]->(c:State), (a:State)-[t:TRANSITION]->(e:State)
      WHERE e.flow = c.flow AND e.final = TRUE AND NOT EXISTS { MATCH (p)-[d:TRANSITION]->() WHERE d.event = 'done' }
      WITH p, collect({from: a.id, type: 'TRANSITION', to: e.id, event: t.event, guard: t.guard}) AS edges
      RETURN edges
guard_cases:
  done: [{}]
types:
  edges: {DETAILED_IN: details}
readings: {DETAILED_IN: is detailed in}
```
