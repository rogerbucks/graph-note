---
created: 2026-10-06T23:28
modified: 2026-10-06T23:28
status: active
test_class: Public
tags: [graph-model, conformance, test]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/2026-10-06 Completeness is declared in the schema and checked like any rule.decision]]"
    type: RELATED_TO
    direction: out
---

# Completeness test — planted gaps

**The test for §25 of [[Graph spec model]]: a small requirements graph with every kind of completeness gap planted, and the answers both checkers must give.** Written before the checkers, on 6 Oct 2026, so the tests could be seen to fail first. Run by `zzSupport/_scripts/graph-spec-conformance.py`, which compares the Python reader, the JavaScript checker and the expected answers below.

**Synthetic, and classified `Public`,** so it can also travel to the graph-note repo as a fixture.

## What is planted

- **Counts (`Cardinality`):**
	- `r_untested` has no test — a missing count
	- `r_two_sections` is part of two sections where one is allowed — a count over its maximum
	- `r_no_reason` neither serves an ask nor rests on a decision — a missing count across two alternative relationships
	- `r_parked_test` has no test, but a `Deferred` names the rule — parked, not missing
	- `ask_unmet` is met by nothing — missing; `ask_parked` is parked until December — deferred; `ask_overdue` was parked until September — overdue on the test's date, 6 Oct 2026
	- `broken_rule` names no relationship — a malformed rule, reported as such
- **The grid (`Coverage`), two features by three concerns:**
	- zoom × phone, export × phone — covered
	- zoom × failure — excused, with a reason
	- zoom × empty — excused **without** a reason, which is itself a gap
	- export × failure — parked by a `Deferred`
	- export × empty — missing
- **A `Deferred` that does not say why** — `bad_deferred`, reported as malformed

## The graph

```gql
// graph: completeness_test · SOURCE · a draft carrying its completeness rules (§25)
// ── The rules ──
(req_has_test:Meta:Cardinality {kind: 'Requirement', relationship: 'PROVED_BY', direction: 'out', min: 1, says: 'every requirement is proved by a test'}),
(req_one_section:Meta:Cardinality {kind: 'Requirement', relationship: 'PART_OF', direction: 'out', min: 1, max: 1, says: 'every requirement is part of exactly one section'}),
(req_has_reason:Meta:Cardinality {kind: 'Requirement', relationship: 'SERVES|DECIDED_IN', direction: 'out', min: 1, says: 'every requirement serves an ask or rests on a decision'}),
(asks_met:Meta:Cardinality {kind: 'Ask', relationship: 'SERVES', direction: 'in', min: 1, says: 'every ask is met by at least one requirement'}),
(broken_rule:Meta:Cardinality {kind: 'Requirement', direction: 'out', min: 1, says: 'a rule that forgot its relationship'}),
(feature_grid:Meta:Coverage {rows: 'Feature', columns: 'Concern', of: 'Requirement', row_link: 'ABOUT', column_link: 'ADDRESSES', excused_by: 'NOT_APPLICABLE', says: 'every feature is covered for every concern'}),

// ── Sections, tests, decisions, asks ──
(sec_view:Section {title: 'Viewing'}),
(sec_export:Section {title: 'Export'}),
(t_zoom:Test {title: 'zoom gestures'}),
(d_zoom:Decision {title: 'zoom by pinch and wheel'}),
(ask_zoom:Ask {text: 'zoom like a map'}),
(ask_unmet:Ask {text: 'a feature nobody specified'}),
(ask_parked:Ask {text: 'something for later'}),
(ask_overdue:Ask {text: 'something parked too long'}),

// ── The grid ──
(zoom:Feature {title: 'Zoom'}),
(export:Feature {title: 'Export'}),
(phone:Concern {title: 'On a phone'}),
(failure:Concern {title: 'When it fails'}),
(empty:Concern {title: 'When it is empty'}),
(zoom)-[:NOT_APPLICABLE {reason: 'zoom cannot fail without the drawing failing first'}]->(failure),
(zoom)-[:NOT_APPLICABLE]->(empty),

// ── Requirements ──
(r_zoom_phone:Requirement {text: 'pinch zooms on a phone'}),
(r_zoom_phone)-[:PART_OF]->(sec_view), (r_zoom_phone)-[:PROVED_BY]->(t_zoom), (r_zoom_phone)-[:SERVES]->(ask_zoom),
(r_zoom_phone)-[:ABOUT]->(zoom), (r_zoom_phone)-[:ADDRESSES]->(phone),
(r_untested:Requirement {text: 'export opens the share sheet'}),
(r_untested)-[:PART_OF]->(sec_export), (r_untested)-[:DECIDED_IN]->(d_zoom),
(r_untested)-[:ABOUT]->(export), (r_untested)-[:ADDRESSES]->(phone),
(r_two_sections:Requirement {text: 'a rule written in two places'}),
(r_two_sections)-[:PART_OF]->(sec_view), (r_two_sections)-[:PART_OF]->(sec_export),
(r_two_sections)-[:PROVED_BY]->(t_zoom), (r_two_sections)-[:DECIDED_IN]->(d_zoom),
(r_no_reason:Requirement {text: 'a rule with no reason'}),
(r_no_reason)-[:PART_OF]->(sec_export), (r_no_reason)-[:PROVED_BY]->(t_zoom),
(r_parked_test:Requirement {text: 'a rule whose test is parked'}),
(r_parked_test)-[:PART_OF]->(sec_export), (r_parked_test)-[:DECIDED_IN]->(d_zoom),

// ── Parked on purpose ──
(park_test:Deferred {what: 'write the test', why: 'the export code is not written yet', rule: 'req_has_test'}),
(park_test)-[:DEFERS]->(r_parked_test),
(park_ask:Deferred {what: 'decide whether to build it', why: 'waiting on the first slice', rule: 'asks_met', revisit_by: DATE '2026-12-01'}),
(park_ask)-[:DEFERS]->(ask_parked),
(late_ask:Deferred {what: 'decide whether to build it', why: 'waiting on a supplier', rule: 'asks_met', revisit_by: DATE '2026-09-01'}),
(late_ask)-[:DEFERS]->(ask_overdue),
(park_grid:Deferred {what: 'say what export does when it fails', why: 'export is a later slice', revisit_by: DATE '2026-12-01'}),
(park_grid)-[:ABOUT]->(export), (park_grid)-[:ADDRESSES]->(failure),
(bad_deferred:Deferred {what: 'something'}),
(bad_deferred)-[:DEFERS]->(ask_zoom)
```

## The answers

Both checkers must give exactly these, on the date given. `met` counts things that meet the rule; for the grid, `met` counts covered pairings and `excused` the pairings excused with a reason. A pairing is written `row × column`.

```yaml
# completeness case
graph: completeness_test
today: 2026-10-06
rules:
  asks_met:        {kind: cardinality, counted: 4, met: 1, excused: 0, missing: [ask_unmet], deferred: [ask_parked], overdue: [ask_overdue], malformed: false}
  broken_rule:     {kind: cardinality, counted: 0, met: 0, excused: 0, missing: [], deferred: [], overdue: [], malformed: true}
  feature_grid:    {kind: coverage, counted: 6, met: 2, excused: 1, missing: [export × empty, zoom × empty], deferred: [export × failure], overdue: [], malformed: false}
  req_has_reason:  {kind: cardinality, counted: 5, met: 4, excused: 0, missing: [r_no_reason], deferred: [], overdue: [], malformed: false}
  req_has_test:    {kind: cardinality, counted: 5, met: 3, excused: 0, missing: [r_untested], deferred: [r_parked_test], overdue: [], malformed: false}
  req_one_section: {kind: cardinality, counted: 5, met: 4, excused: 0, missing: [r_two_sections], deferred: [], overdue: [], malformed: false}
deferred_malformed: [bad_deferred]
```
