---
created: 2026-10-06T15:52
modified: 2026-10-14T22:51
status: active
test_class: Own
tags: [graph-model, specification, requirements]
human_reviewed: false
bundle: Graph spec requirements
bundle_role: source
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec meta-schema]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec conformance suite]]"
    type: RELATED_TO
    direction: out
---

# Graph spec requirements

**The rules of [[Graph spec model]], written as a graph in the spec's own format.** Each requirement is a node: one line saying what it requires, the exact words it quotes from the spec, and links to its section, the decision that made it, the standards it cites, and the conformance case and planted test that prove it. Decided 6 Oct 2026 — [[2026-10-06 The graph spec describes itself — its vocabulary and its rules are graphs.decision]].

> [!tip] Read it through the report
> **[[Graph spec requirements — trace report]]** is the readable view: every rule, one line each, grouped by section, with what proves it and what does not yet. It is §24's helper H6, the *rule card*. This note is the source the report is built from.

## How it stays true to the spec

- **The prose is authoritative for meaning.** This graph is an index of it, never a replacement. Where the two disagree, the prose wins and this graph is corrected.
- **Every line in §§1–24 that uses *must* or *should* is quoted here** — by a `Requirement`, or by a `Wording` node that says why the line states no requirement of its own. So is every item in a list that a *must* line introduces, such as §17's checks and the numbered *Rules* lists of §§22–24. Statements that are normative without the keyword, such as §7's determinism rules, are included where they are checked; the coverage check does not find those for you.
- **Every quote must still be found in the section the requirement is part of.** If the spec is reworded, the quote stops matching and the check fails, naming the requirement.
- **Every proof must exist.** A `PROVED_BY` edge names a conformance case and the planted test in it (`test`). The test must be in that case's data. `test: 'general'` points at the checks the suite runs on every case, or once over the whole suite. `partial: TRUE` means the test proves part of the requirement only.
- **That a named test exists is checked; that it proves its rule is a judgement.** The proofs were assigned on 6 Oct 2026 by reading each case's planted-conditions table against the rule. Treat a link as *fairly sure*, and correct it here when a test turns out to prove something narrower.
- **`RESTATES`** links a rule stated twice — usually §17's checklist repeating a rule from its own section — so the rule card shows one rule with two mentions.
- **A decision's id is its note's file name**, with any apostrophe left out, because GQL text here avoids apostrophes. The check finds the note.
- **The check:** `zzSupport/_scripts/graph-spec-trace.py`, run by the conformance suite. It writes the report.

```bash
python3 zzSupport/_scripts/graph-spec-trace.py            # check, and write the trace report
python3 zzSupport/_scripts/graph-spec-trace.py --check    # check only; exit 1 on any failure
```

## Schema

```gql
// graph: schema · SCHEMA spec-requirements@1 · the graph spec's own rules, as a graph (§5)
INSERT
 (meta:Meta:GraphMeta {id: 'meta:schema/spec-requirements@1', graph: 'schema', schema: 'spec-requirements@1', owner_engine: 'engine:mac14', as_of: DATE '2026-10-06', written_by: 'ea/sara@mac14'}),
 (t_Section:Meta:ElementType {id: 'meta:spec-requirements@1:Section', kind: 'node', name: 'Section', origin: 'source'}), (meta)-[:DECLARES]->(t_Section),
 (t_Requirement:Meta:ElementType {id: 'meta:spec-requirements@1:Requirement', kind: 'node', name: 'Requirement', origin: 'source'}), (meta)-[:DECLARES]->(t_Requirement),
 (t_Wording:Meta:ElementType {id: 'meta:spec-requirements@1:Wording', kind: 'node', name: 'Wording', origin: 'source'}), (meta)-[:DECLARES]->(t_Wording),
 (t_Decision:Meta:ElementType {id: 'meta:spec-requirements@1:Decision', kind: 'node', name: 'Decision', origin: 'reference'}), (meta)-[:DECLARES]->(t_Decision),
 (t_Standard:Meta:ElementType {id: 'meta:spec-requirements@1:Standard', kind: 'node', name: 'Standard', origin: 'reference'}), (meta)-[:DECLARES]->(t_Standard),
 (t_ConformanceCase:Meta:ElementType {id: 'meta:spec-requirements@1:ConformanceCase', kind: 'node', name: 'ConformanceCase', origin: 'reference'}), (meta)-[:DECLARES]->(t_ConformanceCase),
 (t_PART_OF:Meta:ElementType {id: 'meta:spec-requirements@1:PART_OF', kind: 'edge', name: 'PART_OF', origin: 'source', reading: 'is part of', reverse_name: 'contains', aligns_with: 'dcterms:isPartOf'}), (meta)-[:DECLARES]->(t_PART_OF),
 (t_DECIDED_IN:Meta:ElementType {id: 'meta:spec-requirements@1:DECIDED_IN', kind: 'edge', name: 'DECIDED_IN', origin: 'source', reading: 'was decided in', reverse_name: 'decides'}), (meta)-[:DECLARES]->(t_DECIDED_IN),
 (t_REFERENCES:Meta:ElementType {id: 'meta:spec-requirements@1:REFERENCES', kind: 'edge', name: 'REFERENCES', origin: 'source', reading: 'references', reverse_name: 'is referenced by', aligns_with: 'dcterms:references'}), (meta)-[:DECLARES]->(t_REFERENCES),
 (t_PROVED_BY:Meta:ElementType {id: 'meta:spec-requirements@1:PROVED_BY', kind: 'edge', name: 'PROVED_BY', origin: 'source', reading: 'is proved by', reverse_name: 'proves', identified_by: 'test'}), (meta)-[:DECLARES]->(t_PROVED_BY),
 (t_RESTATES:Meta:ElementType {id: 'meta:spec-requirements@1:RESTATES', kind: 'edge', name: 'RESTATES', origin: 'source', reading: 'restates', reverse_name: 'is restated by'}), (meta)-[:DECLARES]->(t_RESTATES)
```

## The requirements

The requirements graph itself is kept in the repository, in `requirements/graph-spec.gql`. The suite reads it from there, in place of this line:

<!-- the requirements graph: requirements/graph-spec.gql -->

```gql
// graph: requirements_style · STYLE requirements
// The style of graph requirements: how it is drawn, never its data (editor spec §2).
(diagram_1:Diagram {type: 'flow'})
```
