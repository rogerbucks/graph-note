# R-01 Proposal on the phone

**You should see:** on the phone, the changes of a proposal listed in a sheet at the bottom of the screen, one to a row, each in plain English with its own Accept and Reject, every button easy to hit with a thumb; and the drawing above marking what is added, changed and removed, in words as well as in its outlines. Nothing is written until you press Accept.

**Test diagram:**

```gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS]->(question)
```

```gql
// graph: reader · CHANGE SET cs1 · against 05d75fdcbdb1d37b · by ada
// proposer kind: model
// proposed: 2026-10-13T09:00:00Z
// read: reader
//@ change: c1
//@ group: New Option
(small_reader:Option {name: 'Small reader'}),
//@ change: c2
//@ group: New ANSWERS links
(small_reader)-[:ANSWERS]->(question),
//@ change: c3
//@ group: Changed price
SET large_reader.price = 4

//@ change: c4
//@ group: Removed ANSWERS links
//@ remove: link large_reader ANSWERS question

//@ change: c5
//@ group: Removed things
//@ remove: thing alice
```

<!-- expect: clean -->

**Do this:**

0. Open this note in Live Preview (not reading view): reading view shows the proposal and offers no Accept or Reject.
1. On the phone, look at the card under the second graph block. Check the five changes are listed in a sheet at the bottom of the screen, one to a row, each with Accept and Reject, and each button easy to hit with a thumb.
2. Look at the drawing above the sheet: Small reader marked "+ added", Large reader "~ changed", Alice "− removed", and the two links drawn differently (a heavier line for the added link, a dotted one for the removed link).
3. Press Accept on "Added: Small reader is an Option". Check that Small reader is written into the first block, nothing else is, and the row now says it was accepted.
4. Press Reject on "Changed: Large reader: price is 4". Check the first block's price is still 3, and the change set now records the rejection above that change.
5. Press Undo. Check the note is as it was before the rejection.
6. Change the price in the first block to 5 by hand. Check the card now shows a notice that the graph has changed since this was proposed, and that Accept stays off until you press "I have read this".

**Checklist line:**

> **R-01** Phone: a change set proposed against a graph (`// graph: reader · CHANGE SET …`), in Live Preview.
>
> - The changes are listed in a sheet at the bottom of the screen, one to a row. Each is in plain language, with its own Accept and Reject. Every button is easy to hit with a thumb.
> - The drawing above marks what is added, changed and removed, in words as well as in its outlines.
> - Accept one change: only it is written into the graph, and its row says it was accepted. Reject another: the graph block is the same, and the change set records it. Undo takes the last decision back.
> - A graph changed since the proposal was made shows a notice first. Accept stays off until the notice is marked read.

**Back to the checklist:** [R-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for R-01 in its list.
