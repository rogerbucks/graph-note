---
created: 2026-10-04T23:56
modified: 2026-10-05T19:18
status: active
test_class: Own
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Join test B — borrower's notes]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
---

# Join test B — borrower's notes (Word).docx

**Companion note for a Word test document**, `Join test B — borrower's notes (Word).docx`, beside this note. The Word file holds the same graph as [[Join test B — borrower's notes]], embedded as §3 of [[Graph spec model]] says a Word document carries one: a plain-text content control tagged `spec:gql`. It deliberately contains the curly quotes Word's autocorrect inserts, which §3 says are straightened when the block is extracted. Result: [[Graph spec conformance — report]].

**File identity.** The Word file's RFC 6920 name is `ni:///sha-256;eG86PgC5HkHVCwZAoYSnwbgCcuRWi2oeFDpvkuUdJ6w` — computed from its bytes by `zzSupport/_scripts/graph-spec-fill.py`, never typed (§24 H2), so the suite fails if the file changes and this note is not refilled.

```yaml
# fill — computed values (§24 H2)
NI_DOCX: {ni: Standards/Join test B — borrower's notes (Word).docx, value: 'ni:///sha-256;eG86PgC5HkHVCwZAoYSnwbgCcuRWi2oeFDpvkuUdJ6w', uses: 1}
```

## Planted conditions

| Test | Planted | Expected |
|---|---|---|
| W1 | the GQL block, read out of the Word content control | it loads and joins — the principal agrees at 150,000 cents after restating units |
| W2 | every quote in the block is Word's curly quote | straightened on extraction, so strings such as *Pier Logistics* read correctly — and the reader is told how many |
| W3 | Markdown A joined with Word B | identical to Markdown A joined with Markdown B |

## Conformance case

Read by the conformance suite ([[Graph spec conformance suite]], spec §17).

```yaml
# conformance case
case: word-document
title: A Word document joins exactly as its Markdown twin
documents: ["Join test A — lender's notes", "Join test B — borrower's notes (Word).docx"]
configuration: ledger
rounds:
  - name: as written
    expect:
      same_as: {test: W3, case: two-documents, round: as written}
      asserted:
        - {test: W1, element: "loan:L1", property: principal_cents, value: 150000}
        - {test: W2, element: "org:pier", property: name, value: Pier Logistics}
      notices:
        - {test: W2, contains: "curly quotes straightened"}
```
