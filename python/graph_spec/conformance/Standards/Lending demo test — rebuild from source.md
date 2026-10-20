---
created: 2026-10-04T23:50
modified: 2026-10-05T09:08
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Lending demo graph data]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Lending demo test — rebuild from source

**The lending demo's proofs, as a conformance case.** The data — every source block and every built block — is in [[Lending demo graph data]]; this document holds only the case. The core claim of [[Graph spec model]] (E8): **source plus engine re-creates everything else**. Result: [[Graph spec conformance — report]].

## Planted conditions

| Test | Checked | Expected |
|---|---|---|
| D1 | the engine, run on the source blocks alone | rebuilds the built ledger, process and decisions graphs identically — 186/342, 16/22, 26/34; the catalog is source only, 48/30 |
| D2 | the known-answer digest, recomputed by the rebuilt engine | equals the digest the catalog records, `3580531c5c2bf95b` |
| D3 | the source exported to Cypher | each graph loads identically from Cypher, and the engine rebuilds identically from the Cypher-loaded source |
| D4 | §5 on every graph | every element declared; every edge type with its reverse reading |
| D5 | §18 on every graph | the flat projection rebuilds it |
| D6 | one cent changed — in a built balance, then in a source payment | each caught; the built balance by the close proofs |
| D7 | back-dating — T8 entered on 5 November for 5 October, after October was closed | caught by the rule, read on what the engine rebuilt |
| D8 | posting | every loan's cached balance, status and cache-through equal a replay; every cash transaction has one source and one destination account |
| D9 | the scheduler | month-end interest at 23:59:59 on the last day, in the loan's own zone; missed instalments and grace expiries raised by the 09:00 Brisbane check on the right day |
| D10 | close proofs | every snapshot recomputes from the transactions up to its close; every published decision's content hash matches its text |
| D11 | the known answers, one by one | ten figures — instalment, interest, default interest, payout, four closing balances — each equal to the graph and named in the catalog |
| D12 | statements | every stored document's bytes hash to its `ni:` name; one payload and one rendition per statement; every delivery has an RFC 5322 Message-ID |
| D13 | provenance | everything the engine made names the run that made it (PROV-O) |
| D8–D13 | each feature check, tampered with in the published graphs | caught by that check — a cached balance, an interest charge an hour early, an edited decision, a known answer a cent out, a malformed Message-ID, a missing provenance link |
| D14 | a drawdown before the loan was signed | refused by the engine as an illegal move (§7), not posted |
| D15 | every statement payload | canonical JSON under RFC 8785, checked with the reference library — and a re-indented copy is told apart |

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: lending-demo
title: The lending demo — rebuild from source, round trips, known answers
kind: rebuild
engine: graph_spec_lending_engine.py
feature_checks: graph_spec_lending_checks
engine_graphs: [ledger, process, decisions]
sources: {ledger: "Lending demo graph data#Source — ledger", process: "Lending demo graph data#Source — process", decisions: "Lending demo graph data#Source — decisions", catalog: "Lending demo graph data#Source — catalog"}
built: {ledger: "Lending demo graph data#Built — ledger", process: "Lending demo graph data#Source — process", decisions: "Lending demo graph data#Built — decisions", catalog: "Lending demo graph data#Source — catalog"}
rounds:
  - name: rebuild, Cypher, types and projection
    expect:
      rebuild: {test: D1, counts: {ledger: [186, 342], process: [16, 22], decisions: [26, 34], catalog: [48, 30]}}
      known_answers: {test: D2, id: "known-answers:lending-demo@3"}
      cypher: {test: D3}
      types: {test: D4}
      projection: {test: D5}
      features:
        tests: {posting: D8, scheduler: D9, closes: D10, statements: D12, provenance: D13, canonical: D15}
        known_answers: "known-answers:lending-demo@3"
        figures:
          - {test: D11, figure: "L1's third instalment, the payout", element: "loan:L1/i3", property: amount_cents, value: 16284}
          - {test: D11, figure: "L3's October interest", element: "int:loan:L3:2026-10", property: amount_cents, value: 355}
          - {test: D11, figure: "L3's November interest", element: "int:loan:L3:2026-11", property: amount_cents, value: 397}
          - {test: D11, figure: "L3's December interest", element: "int:loan:L3:2026-12", property: amount_cents, value: 215}
          - {test: D11, figure: "L3's default interest", element: "dint:loan:L3:2026-12", property: amount_cents, value: 91}
          - {test: D11, figure: "L3's payout", element: "T18", property: amount_cents, value: 20062}
          - {test: D11, figure: "Alice's January close", element: "snap:2027-01/acct:alice-everyday", property: balance_cents, value: 201346}
          - {test: D11, figure: "Bob's January close", element: "snap:2027-01/acct:bob-everyday", property: balance_cents, value: 29716}
          - {test: D11, figure: "Carol's January close", element: "snap:2027-01/acct:carol-everyday", property: balance_cents, value: 66938}
          - {test: D11, figure: "Dan's January close", element: "snap:2027-01/acct:dan-everyday", property: balance_cents, value: 112000}
      rules:
        - test: D7
          graph: ledger
          why: "no event is dated inside a period that was already closed when it was recorded (§8, §11)"
          gql: |
            MATCH (e:Event), (c:Close)
            WHERE e.at <= c.as_of AND e.recorded_at > c.closed_at
            RETURN e.id AS event, c.id AS close
    mutations:
      - {test: D14, name: "a drawdown before the loan was signed — an illegal move", document: "Lending demo graph data#Source — ledger", replace: "(T8:Event:Drawdown:Transaction {id: 'T8', amount_cents: 60000, at: DATETIME '2026-10-05T10:00:00+10:00'", with: "(T8:Event:Drawdown:Transaction {id: 'T8', amount_cents: 60000, at: DATETIME '2026-09-15T10:00:00+10:00'", expect_message: "illegal move"}
      - {test: D6, name: "Alice's January closing balance in the built ledger changed by one cent", document: "Lending demo graph data#Built — ledger", replace: "snap:2027-01/acct:alice-everyday', balance_cents: 201346", with: "snap:2027-01/acct:alice-everyday', balance_cents: 201347", expect_check: "close proofs"}
      - {test: D8, name: "loan L1's cached balance set to one cent", document: "Lending demo graph data#Built — ledger", replace: "(loan_L1:Agreement:Loan {id: 'loan:L1', balance_cents: 0,", with: "(loan_L1:Agreement:Loan {id: 'loan:L1', balance_cents: 1,", expect_check: "posting"}
      - {test: D9, name: "L3's October interest charged an hour early", document: "Lending demo graph data#Built — ledger", replace: "amount_cents: 355, at: DATETIME '2026-10-31T22:59:59+10:00'", with: "amount_cents: 355, at: DATETIME '2026-10-31T21:59:59+10:00'", expect_check: "scheduler"}
      - {test: D10, name: "a decision's rationale edited without its hash", document: "Lending demo graph data#Built — decisions", replace: "rationale: 'Gives a missed payment time to be fixed before it costs more.'", with: "rationale: 'Gives a missed payment time to be fixed.'", expect_check: "content hash"}
      - {test: D11, name: "L3's October interest changed by one cent", document: "Lending demo graph data#Built — ledger", replace: "{id: 'int:loan:L3:2026-10', amount_cents: 355,", with: "{id: 'int:loan:L3:2026-10', amount_cents: 356,", expect_check: "known answer"}
      - {test: D12, name: "a delivery's Message-ID without its angle brackets", document: "Lending demo graph data#Built — ledger", replace: "message_id: '<stmt-loan-L1-2026-09.D1@lending-demo.example.com>'", with: "message_id: 'stmt-loan-L1-2026-09.D1@lending-demo.example.com'", expect_check: "Message-ID"}
      - {test: D13, name: "the September close no longer names the run that made it", document: "Lending demo graph data#Built — ledger", replace: " (close_2026_09)-[:WAS_GENERATED_BY]->(run_close_2026_09)", with: " (close_2026_09)-[:PRODUCED]->(run_close_2026_09)", expect_check: "provenance"}
      - {test: D7, name: "T8 entered on 5 November for 5 October — back-dated into October after October was closed", document: "Lending demo graph data#Source — ledger", replace_regex: "(\\(T8:Event:Drawdown:Transaction \\{[^}]*recorded_at: DATETIME )'2026-10-05T10:00:00\\+10:00'", with_regex: "\\g<1>'2026-11-05T10:00:00+10:00'"}
      - {test: D6, name: "the payout in the source changed by one cent", document: "Lending demo graph data#Source — ledger", replace: "(T12:Event:Repayment:Transaction {id: 'T12', amount_cents: 15284,", with: "(T12:Event:Repayment:Transaction {id: 'T12', amount_cents: 15285,"}
```
