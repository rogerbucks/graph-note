---
created: 2026-10-14T22:15
modified: 2026-10-14T22:15
status: active
test_class: Public
tags: [test, graph-model]
human_reviewed: false
edges:
  - target: "[[Standards/Graph spec model]]"
    type: RELATED_TO
    direction: out
  - target: "[[Standards/Graph spec conformance suite]]"
    type: RELATED_TO
    direction: out
---

# Reader test — what the readers keep, own and refuse

A conformance case for the graph spec's reading rules (§3, §14, §26, §27). It doesn't hold one graph. Each test is a short block, read by the portable readers, and also by the engine route where a rule is about the engine. It was added on 14 Oct 2026, when graph-spec 0.4.3 was vendored, to prove rules that had been pending until a release carried them.

- **Run by** `zzSupport/_scripts/graph-spec-conformance.py`, as a case of kind `reader`.
- **Both readers.** The Python reader (`gql_profile`) and the JavaScript one (`graph-spec-check.js`, through `graph-spec-check-node.js`) must give the same notes and `//@` lines for every block (Y20).
- **The engine route** is the library's `load`: it reads with the reader first, then gives Grafeo the reader's corrected text.

## Planted conditions

| Test | What is written | What must happen |
|---|---|---|
| Y1 | a node whose id is a number | refused, with the fix that quotes it (§3, ids are text) |
| Y2 | a SET that changes a node's id | refused, with the fix: write the right node, then link or supersede |
| Y3 | an escape GQL does not name, `\q` | refused, with the fix that doubles the backslash |
| Y4 | the escapes GQL names, a tab and a backslash | read as GQL reads them |
| Y5 | each block Y1 to Y3 refuses, sent down the engine route | refused there with the reader's own words; the engine is given nothing |
| Y6 | a block with comments, no INSERT, a missing id and no commas | the engine is given the block line for line |
| Y7 | comment lines between the code | each reaches the engine on the same line, as a comment it reads |
| Y8 | two things on separate lines with no comma between | the engine gets the comma at the end of the code on its line, and both things |
| Y9 | `///x`, four slashes, then `/// real` | only the three-slash line with a space is a note |
| Y10 | a note, a blank line, then a thing | the blank line ends the note; it is owned by nothing |
| Y11 | a note, an ordinary comment, then a thing | the comment ends the note |
| Y12 | a note above a line holding two things | the line owns no note |
| Y13 | notes with a `//@` line among them | the `//@` line doesn't end the note; one run, one owner |
| Y14 | a bare `///` between note lines | a paragraph break; the summary is the first paragraph |
| Y15 | trailing spaces, a CR before the LF, and `///` followed only by spaces | none of it is note text; the spaces-only line is a paragraph break |
| Y16 | a note line inside an element's brackets | the line below it begins inside an element, so it owns nothing |
| Y17 | the `// graph:` line and two-slash comments | never notes |
| Y18 | `//@ colour: red` above a thing, and `//@ nokey` | the first is the thing's tag; the second is malformed, an ordinary comment |
| Y19 | a block holding `//@` lines, sent down the engine route | the engine ignores them and builds the same things |
| Y20 | every block of Y9 to Y18 | the JavaScript reader gives exactly the Python reader's notes and tags |
| Y21 | the library with no engine installed | reads, checks and recomputes filled values; a call that needs the engine names the extra to install |

## Conformance case

```yaml
# conformance case
case: reader
title: The readers — what they keep, own and refuse
kind: reader
rounds:
  - name: reading rules
    checks:
      - test: Y1
        block: |-
          // graph: g
          INSERT (a:A {id: 7})
        refused: {message: "id 7 is not text", fix: "write id: '7'"}
      - test: Y2
        block: |-
          // graph: g
          INSERT (a:A {id: 'a'})
          SET a.id = 'b'
        refused: {message: "id never changes", fix: "supersede"}
      - test: Y3
        block: |-
          // graph: g
          INSERT (a:A {id: 'a', t: 'x\qy'})
        refused: {message: "is not an escape GQL names", fix: "double the backslash"}
      - test: Y4
        block: |-
          // graph: g
          INSERT (a:A {id: 'a', t: 'tab\tx', u: 'back\\slash'})
        values: {a: {t: "tab\tx", u: "back\\slash"}}
      - test: Y5
        engine_refuses_as_reader: [Y1, Y2, Y3]
      - test: Y6
        block: |-
          // graph: g
          // things
          (a:A {name: 'x'})
          (b:B {id: 'b'})
          // a link
          (a)-[:R]->(b)
        engine_lines: true
      - test: Y7
        block: |-
          // graph: g
          // things
          (a:A {name: 'x'})
          (b:B {id: 'b'})
          // a link
          (a)-[:R]->(b)
        engine_comments: [1, 2, 5]
      - test: Y8
        block: |-
          // graph: g
          INSERT (a:A {id: 'a'})
          (b:B {id: 'b'})
        engine_commas: {lines: [2], ids: [a, b]}
      - test: Y9
        block: |-
          // graph: g
          ///x
          //// four
          /// real
          (a:A {id: 'a'})
        owned: {owned: [{line: 5, element: {thing: a}, tags: [], note: [real], summary: real}], unowned: [], malformed: []}
      - test: Y10
        block: |-
          // graph: g
          /// n1

          (a:A {id: 'a'})
        owned: {owned: [], unowned: [2], malformed: []}
      - test: Y11
        block: |-
          // graph: g
          /// n1
          // plain
          (a:A {id: 'a'})
        owned: {owned: [], unowned: [2], malformed: []}
      - test: Y12
        block: |-
          // graph: g
          /// two
          (a:A {id: 'a'}), (b:B {id: 'b'})
        owned: {owned: [], unowned: [2], malformed: []}
      - test: Y13
        block: |-
          // graph: g
          /// A note
          //@ colour: red
          /// after the tag
          (a:A {id: 'a'})
        owned: {owned: [{line: 5, element: {thing: a}, tags: [[colour, red]], note: [A note, after the tag], summary: "A note\nafter the tag"}], unowned: [], malformed: []}
      - test: Y14
        block: |-
          // graph: g
          /// First paragraph
          ///
          /// Second paragraph
          (a:A {id: 'a'})
        owned: {owned: [{line: 5, element: {thing: a}, tags: [], note: [First paragraph, "", Second paragraph], summary: First paragraph}], unowned: [], malformed: []}
      - test: Y15
        block: "// graph: g\n/// one  \r\n///   \n/// two\n(a:A {id: 'a'})"
        owned: {owned: [{line: 5, element: {thing: a}, tags: [], note: [one, "", two], summary: one}], unowned: [], malformed: []}
      - test: Y16
        block: |-
          // graph: g
          (a:A {id: 'a',
          /// stray note
            name: 'x'})
        owned: {owned: [], unowned: [3], malformed: []}
      - test: Y17
        block: |-
          // graph: g
          // an ordinary comment
          (a:A {id: 'a'})
        owned: {owned: [], unowned: [], malformed: []}
      - test: Y18
        block: |-
          // graph: g
          //@ nokey
          //@ colour: red
          (a:A {id: 'a'})
        owned: {owned: [{line: 4, element: {thing: a}, tags: [[colour, red]], note: [], summary: ""}], unowned: [], malformed: [2]}
      - test: Y19
        block: |-
          // graph: g
          //@ colour: red
          INSERT (a:A {id: 'a'}),
          //@ weight: heavy
            (b:B {id: 'b'})
        engine_ids: [a, b]
      - test: Y20
        two_readers: [Y9, Y10, Y11, Y12, Y13, Y14, Y15, Y16, Y17, Y18]
      - test: Y21
        no_engine: true
```
