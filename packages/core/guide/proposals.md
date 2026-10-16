# Proposals (spec §17)

Purpose: proposed changes to a graph (from an AI, a graph step or anyone), shown over the graph, checked, decided and recorded in the note. Part of the [core guide](../GUIDE.md).

A proposal is changes to a graph that somebody other than the person reading proposes: an AI's answer (§19), a graph
step's output (§20), or anyone. It is data, whatever its source; nothing here knows where it came from. It is shown over
the graph and never written until a person accepts a change, and then written as an ordinary edit.

- `proposals.ts` — the data: `makeProposal` checks a proposal (who proposed it, the state of the graph it was made against,
  at least one change, each change written as a block writes it) and gives each change its derived id (from its statement,
  never written by a source, so one change proposed twice is refused) and a group; `Provenance`
  (who, when, what it read, the basis); a change is an addition (one item of GQL), a change of a property (`set`) or a
  removal of a thing or a link; `thingChange` and `linkChange` build additions from parts for a source whose answer is data;
  `groupsOf` and `provenanceLines`; `BIG_PROPOSAL`, above which a proposal is reviewed in groups.
- `proposals-basis.ts` — `basisOf`: the state of a graph as graph-spec's change sets name it (`against`), and `staleness`,
  whether the graph has moved since.
- `proposals-statements.ts` — a change as the statement a change set holds: an addition's item, a `SET thing.key = value`, a
  `DELETE` of one thing (`DETACH DELETE`, which lists the links it takes) or one link. `statementOf` writes it,
  `readStatement` reads it with graph-spec's own `readChange`, and `changeIdOf` gives the id the library derives
  (`changeId`, the one `checkChangeset` reports; an addition's is a hash of its tokens).
- `proposals-text.ts` — a proposal as graph-spec's change set (§24): the header (the graph, the id, `against`, and `by`,
  the only place either is said), `// proposed:` and `// read:` comments its readers pass over, the additions, then a
  statement for each other change, so every tool that reads GQL reads it and `checkChangeset` passes it. An optional
  `//@ reason:` line sits directly above a change and a `//@ group:` line above it when the group is not the one its kind
  gives. Nothing a person decided is in it. `changeSetText` writes it, `readChangeSet` reads it as the check does
  (`splitChangeset`), refusing a statement of more than one target and the editor's old form (removals, ids and decisions
  as comments), which it does not read.
- `proposals-judgement.ts` — what was decided, kept in the note (cs-rejected-out, decider_named): a `Decision` for each
  change in the note's judgement graph, a block whose graph is `judgements` (or ends `_judgements`), reused when the note
  has one and added after the change set when not. It holds the statement, who proposed it (`proposed_by`), who decided
  (`decided_by`, plain text exactly as set, or "you": `deciderName`) and when, and the place the change had. It also
  writes the W3C PROV attributions (the graph spec's req:24.prov-attributed): the Decision is `WAS_ATTRIBUTED_TO`
  the proposer (a Model for a model, a Person for a person or a step, none when the kind is not known) and the person who
  decided (a Person), each an agent of the judgement graph named for its kind and exact name and written once.
  `decidedIn` reads them back; `withDecisions` and `withoutDecisions` write and take them back.
- `proposals-record.ts` — recording a decision in the note: the change set written again with only the changes still
  waiting and, after an accept, `against` the graph's new state; the Decisions in the judgement graph; and taking both back.
- `proposals-check.ts` — `checkProposal`: graph-spec's own `checkChangeset` run on the change set as the note holds it,
  against the note's other graphs, every line of its answer kept (proposals_checked); `proposerKind`, what the note's graphs
  say the proposer is (a Model, a Person or a Step).
  An accept is refused while the check fails on the change set the note holds (the "moved" line aside once the stale
  notice is seen), `noteWithProposal` writes a proposal only if the check passes it, a plain `DELETE` stays plain
  (refused for a thing that has links) and the kinds a MATCH names are held to, and only a data block is a judgement block.
- `proposals-author.ts` — the proposer, declared by the editor in the proposal itself: `withProposer` puts the declaration
  (a Model for an AI model, a Person that is a Step for a step) first among the additions when a proposal is written, unless
  the note declares it; it is a change on the card like the others, written with the first change accepted
  (`acceptedWith`) and removed with the last rejected (`rejectedWith`). A model's answer can never add a Person, a Model or
  a Step (`ai-request.ts`), so only the editor's declaration can make an author known to the check, which accepts an author
  the set declares itself.
- `proposals-needs.ts` — what a change needs of the others: a link needs the things it joins before it is accepted, and
  a change that adds what another needs is not rejected alone.
- `proposals-apply.ts` — one change written as text on the blocks' texts (an addition after the graph's last block of data, a
  property changed where it is written, a removal of the item that wrote the thing or link), `notTaken` (a change read back to
  see it took effect) and `newProblems` (what a change leaves wrong that was not before). Not exported by the entry: only a
  review writes a change.
- `proposals-marks.ts` — which boxes and links each change adds, changes or removes (`MARK_WORDS` says it in words, never by
  colour alone), and each change read back in plain English as the text pane reads a line (`readBack`).
- `proposals-review.ts` — `ProposalReview`: `show` (the proposal laid over the graph, rows, groups, marks, provenance, whether
  the graph has moved; writes nothing), `accept` and `reject` (a person, by name, one change, some, a group or all; accepted
  changes are written through `PaneSession`, so they are checked as any edit is, then read back, and refused whole if one does
  not take effect or leaves a new problem; a graph that has moved is refused until its notice is seen), and `undo`. It works
  on the note's text and hands the new text back; the host writes it. `show` also carries the graph spec's check of the
  change set (`checked`). A decision is recorded in the note's judgement graph, and the change leaves the change set; it is
  decided in memory only when the note holds no change set. `fromChangeSet(block, note)` reads a proposal with what the
  note says was decided of it and who the proposer is.
- `proposals-shown.ts` — the shapes a review hands a host: `ProposalShown`, its `ChangeRow`s, who decides (`Person`), which
  changes (`Which`) and what came of it (`Reviewed`).
