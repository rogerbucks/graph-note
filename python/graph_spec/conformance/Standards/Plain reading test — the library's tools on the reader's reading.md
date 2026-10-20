---
created: 2026-10-14T22:48
modified: 2026-10-14T22:48
status: active
test_class: Public
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Reader test — what the readers keep, own and refuse]]"
    type: RELATED_TO
    direction: out
---

# Plain reading test — the library's tools on the reader's reading

A conformance case for the rules that say the library's tools work from the portable reader's reading, held to the reference engine, Grafeo. This covers the process engine, the SCXML export, the loan-balance figure, the view server and the hash filler (§3, §7, §18, §21, §24). It also covers the extension rules of §27. It was added on 14 Oct 2026, when graph-spec 0.4.3 was vendored, as a companion to [[Reader test — what the readers keep, own and refuse]].

- **Run by** `zzSupport/_scripts/graph-spec-conformance.py`, as a case of kind `reader`.
- **It reuses other cases' documents and data**: the sub-flow, certainty and view-server cases. It names them, and reads no other document, so their planted tests stay theirs.
- **Each tool runs twice**: once on the reader's plain graph, or its whole world for the view server, and once on Grafeo, the database a host may ask for. The two answers must be identical.

## Planted conditions

| Test | What is checked | What must happen |
|---|---|---|
| Z1 | the library with no host setting, and a GQL constraint with a named twin | the portable reader is the default; the constraint runs as its twin under either parser |
| Z2 | the process engine, on the sub-flow case's flat and sub-flow processes | from the reader's reading it behaves exactly as from Grafeo, in every reachable state, event and guard case |
| Z3 | the SCXML export of both processes | the same XML from the reader's reading as from Grafeo |
| Z4 | the loan-balance figure, in every round of the certainty case | the same figure from the reader's reading as from Grafeo |
| Z5 | a loan with no principal, and a repayment with no amount | the figure says incomplete and names both; it never raises and never counts a missing value as zero |
| Z6 | every serving in the view-server case: what is served, zoomed, refused and recorded | the same from the reader's world as from Grafeo, step by step |
| Z7 | the hash and id filler, on every document with recipes | the same values with the portable reader as with Grafeo |
| Z8 | every block of every case document, read with its comment lines and without them | the same graph either way, so no extension that changes the graph lives in a comment |
| Z9 | a `//@ reading:` line above a link, beside a schema that declares the reading | the schema's reading stands; the comment changes nothing |
| Z10 | a draft link with a `//@ reverse_name:` line above it | the guessed readings stand; the comment changes nothing |
| Z11 | a nudge written in the data graph, and the same nudge in the note's style graph | only the style graph's is read as style |
| Z12 | a process with `///` notes on two States and on a transition, one note holding `-->`, `<!--` and a backslash | the SCXML export keeps each note as an XML comment directly before its element, and the comments change no element (§26, req:26.plain) |

## Conformance case

```yaml
# conformance case
case: plain-reading
title: The library's tools on the reader's reading
kind: reader
rounds:
  - name: tools on the reader's reading
    checks:
      - test: Z1
        parser_default: profile
        twin: {why: "one start", gql: "MATCH (s:Start) RETURN count(s) AS n", reference: one-start}
      - test: Z2
        machine: {case: subflow-equivalence, configuration: subflow}
      - test: Z3
        scxml: {case: subflow-equivalence}
      - test: Z4
        figure: {case: certainty, graph: credit, loan: "loan:L2"}
      - test: Z5
        block: |-
          // graph: ledger
          INSERT (l:Loan {id: 'loan:L9', currency: 'AUD'}),
            (r:Repayment {id: 'rep:R9'}),
            (r)-[:REPAYS]->(l)
        incomplete: {loan: "loan:L9", names: ["loan:L9", "rep:R9"]}
      - test: Z6
        view_server: {case: view-server}
      - test: Z7
        fill_parsers: true
      - test: Z8
        comments_change_nothing: true
      - test: Z9
        block: |-
          // graph: org
          INSERT (ann:Person {id: 'ann'}), (bob:Person {id: 'bob'}),
          //@ reading: manages
            (bob)-[:REPORTS_TO]->(ann),
            (meta:GraphMeta {id: 'meta', graph: 'org', schema: 'org@1'}),
            (kind_person:Meta:ElementType {id: 'kind_person', name: 'Person', kind: 'node', origin: 'source'}),
            (link_reports_to:Meta:ElementType {id: 'link_reports_to', name: 'REPORTS_TO', kind: 'edge', origin: 'source', reading: 'reports to', reverse_name: 'is reported to by'}),
            (meta)-[:DECLARES]->(kind_person), (meta)-[:DECLARES]->(link_reports_to)
        readings: {REPORTS_TO: ["reports to", "is reported to by"]}
      - test: Z10
        block: |-
          // graph: org
          INSERT (ann:Person {id: 'ann'}), (bob:Person {id: 'bob'}),
          //@ reverse_name: bosses
            (bob)-[:REPORTS_TO]->(ann)
        readings: {REPORTS_TO: ["reports to", "is reported to by"]}
      - test: Z11
        style_only_from_style_graph:
          data: |-
            // graph: g
            INSERT (a:Thing {id: 'a'}), (b:Thing {id: 'b'}), (n1:Nudge {id: 'n1', word: 'beside', thing: 'a', other: 'b'})
          plain_data: |-
            // graph: g
            INSERT (a:Thing {id: 'a'}), (b:Thing {id: 'b'})
          style: |-
            // graph: gs · STYLE g
            INSERT (n1:Nudge {id: 'n1', word: 'beside', thing: 'a', other: 'b'})
      - test: Z12
        scxml_notes:
          block: |-
            // graph: loan_process
            /// Where every loan starts.
            (applied:State {id: 'loan/applied', flow: 'loan', initial: TRUE}),
            /// Closed for good: --> <!-- a -- b --- c -
            /// \ back\slash
            (closed:State {id: 'loan/closed', flow: 'loan', final: TRUE}),
            /// Scored above 600.
            (applied)-[:TRANSITION {event: 'assess', guard: 'score > 600'}]->(closed),
            (applied)-[:TRANSITION {event: 'assess', guard: 'else'}]->(closed)
          notes:
            - ["loan_applied", "Where every loan starts."]
            - ["assess", "Scored above 600."]
            - ["loan_closed", "Closed for good: --> <!-- a -- b --- c -\n\\ back\\slash"]
```
