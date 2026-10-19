---
created: 2026-10-06T15:52
modified: 2026-10-06T23:32
status: active
test_class: Own
tags: [graph-model, schema, specification]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec requirements]]"
    type: RELATED_TO
    direction: out
---

# Graph spec meta-schema

**The graph spec's own vocabulary, written in the graph spec's own format.** §5 of [[Graph spec model]] says every graph carries its own schema. This schema declares the types used to write every other schema: `GraphMeta`, `ElementType`, `Meta` and `DECLARES`. Decided 6 Oct 2026 — [[2026-10-06 The graph spec describes itself — its vocabulary and its rules are graphs.decision]].

- **It checks against its own declarations alone.** With the checkers' built-in types switched off, every node and edge in the block below is declared by the block itself.
- **The checkers keep a built-in copy**, because a browser page or an Office add-in has no vault to read this note from. `zzSupport/_scripts/graph-spec-trace.py` proves that the copies in `graph_rules.py`, `graph_spec.py` and `graph-spec-check.js` equal what this block declares. The conformance suite runs it.
- **`Meta` is a marker**, not a type. It labels a node as part of a schema, and never types a node by itself. A node labelled only `Meta` is untyped.
- **Version 3, 16 Oct 2026**, adds W3C PROV's agents and links (§11, §12, §24): `Person`, `Organization` and `SoftwareAgent`, and `USED`, `HAD_PLAN` and `WAS_ATTRIBUTED_TO`.
- **Changing this vocabulary is a change to the spec.** Raise the version, `graph-spec@3`, and change the checkers' built-in copy in the same edit. The conformance case fails until both agree.

```gql
// graph: schema · SCHEMA graph-spec@3 · the types every schema is written in (§5)
INSERT
 (meta:Meta:GraphMeta {id: 'meta:schema/graph-spec@3', graph: 'schema', schema: 'graph-spec@3', owner_engine: 'engine:mac14', as_of: DATE '2026-10-16', written_by: 'ea/sara@mac14'}),
 (t_GraphMeta:Meta:ElementType {id: 'meta:graph-spec@3:GraphMeta', kind: 'node', name: 'GraphMeta', origin: 'source', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_GraphMeta),
 (t_ElementType:Meta:ElementType {id: 'meta:graph-spec@3:ElementType', kind: 'node', name: 'ElementType', origin: 'source', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_ElementType),
 (t_Meta:Meta:ElementType {id: 'meta:graph-spec@3:Meta', kind: 'node', name: 'Meta', origin: 'source', marker: TRUE, proved_by: 'graph-spec-trace.py: a node labelled only Meta is untyped'}), (meta)-[:DECLARES]->(t_Meta),
 (t_Cardinality:Meta:ElementType {id: 'meta:graph-spec@3:Cardinality', kind: 'node', name: 'Cardinality', origin: 'source', proved_by: 'graph-spec-conformance.py: §25 completeness, the planted-gaps test'}), (meta)-[:DECLARES]->(t_Cardinality),
 (t_Coverage:Meta:ElementType {id: 'meta:graph-spec@3:Coverage', kind: 'node', name: 'Coverage', origin: 'source', proved_by: 'graph-spec-conformance.py: §25 completeness, the planted-gaps test'}), (meta)-[:DECLARES]->(t_Coverage),
 (t_Person:Meta:ElementType {id: 'meta:graph-spec@3:Person', kind: 'node', name: 'Person', origin: 'source', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_Person),
 (t_Organization:Meta:ElementType {id: 'meta:graph-spec@3:Organization', kind: 'node', name: 'Organization', origin: 'source', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_Organization),
 (t_SoftwareAgent:Meta:ElementType {id: 'meta:graph-spec@3:SoftwareAgent', kind: 'node', name: 'SoftwareAgent', origin: 'source', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_SoftwareAgent),
 (t_USED:Meta:ElementType {id: 'meta:graph-spec@3:USED', kind: 'edge', name: 'USED', origin: 'source', reading: 'used', reverse_name: 'was used by', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_USED),
 (t_HAD_PLAN:Meta:ElementType {id: 'meta:graph-spec@3:HAD_PLAN', kind: 'edge', name: 'HAD_PLAN', origin: 'source', reading: 'had plan', reverse_name: 'is the plan of', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_HAD_PLAN),
 (t_WAS_ATTRIBUTED_TO:Meta:ElementType {id: 'meta:graph-spec@3:WAS_ATTRIBUTED_TO', kind: 'edge', name: 'WAS_ATTRIBUTED_TO', origin: 'source', reading: 'was attributed to', reverse_name: 'is responsible for', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_WAS_ATTRIBUTED_TO),
 (t_DECLARES:Meta:ElementType {id: 'meta:graph-spec@3:DECLARES', kind: 'edge', name: 'DECLARES', origin: 'source', reading: 'declares', reverse_name: 'is declared by', proved_by: 'graph-spec-trace.py: the meta-schema types itself'}), (meta)-[:DECLARES]->(t_DECLARES)
```
