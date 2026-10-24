// The words of the core's proposals, in UK English (editor spec §42, words_catalogue). They say why a proposal or one
// of its changes is refused, and where a proposal came from. They also say why a change cannot be written, accepted,
// rejected or undone. GQL and names stay inside the sentence as written. What is written into a note is never here:
// those are its bytes. source-words.ts keeps these with every other word.

/** The words of the core's proposals, by key, in UK English. */
export const PROPOSAL_SOURCE_WORDS = {
  // a change that cannot be part of a proposal (proposals.ts)
  'proposing.fault.addition-one':
    'change {change}: an addition is one thing, or one link or path, as a block writes it; write each as its own change',
  'proposing.fault.addition-line':
    'change {change}: an addition is on one line: a line break outside a text is not part of it',
  'proposing.fault.set-names':
    'change {change}: a change of a property names a thing and a property (not its id), each one word',
  'proposing.fault.set-value': 'change {change}: a change of a property gives its value, on one line',
  'proposing.fault.set-one-value':
    'change {change}: a change of a property gives one value, and nothing else: {value} reads as more, or as something wrong',
  'proposing.fault.removal-names': 'change {change}: a removal names the thing, one word',
  'proposing.fault.link-removal-names':
    'change {change}: a removal of a link names where it is from, its type and where it goes to, each one word',
  'proposing.fault.kind-word': 'change {change}: a kind a statement names is one word',
  'proposing.fault.group-line': 'change {change}: a group is named on one line',
  'proposing.fault.reason-line': 'change {change}: a reason is given on one line',
  // a proposal refused as a whole (proposals.ts)
  'proposing.refused.id': 'a proposal has an id of one word',
  'proposing.refused.graph': 'a proposal names the graph it is for, one word',
  'proposing.refused.by': 'say who proposed it: a name of one word, as a change set’s header holds it',
  'proposing.refused.basis':
    'say which state of the graph it was made against: sixteen hexadecimal digits (basisOf gives them)',
  'proposing.refused.day': 'say when it was proposed as a day, YYYY-MM-DD, with the time if known',
  'proposing.refused.no-change': 'a proposal holds at least one change',
  'proposing.refused.twice': 'two changes are the same change: a change is proposed once',
  // where a proposal came from, as its change set says (proposals.ts)
  'proposing.said-by.model': 'The change set says it was proposed by {name}, a model.',
  'proposing.said-by.person': 'The change set says it was proposed by {name}, a person.',
  'proposing.said-by.step': 'The change set says it was proposed by {name}, a graph step.',
  'proposing.said-by.unknown': 'The change set says it was proposed by {name}, of a kind it does not say.',
  'proposing.said-on': 'It says it was proposed on {day}.',
  'proposing.said-on.time': 'It says it was proposed on {day}, {time}.',
  'proposing.said-on.utc': 'It says it was proposed on {day}, {time} UTC.',
  'proposing.said-on.none': 'It does not say when it was proposed.',
  'proposing.said-read': 'It says it read: {read}.',
  'proposing.said-read.none': 'It does not say what it read.',
  // a change that cannot be written into the blocks (proposals-apply.ts)
  'proposing.apply.not-written': '{thing} is not written in a block of this graph: edit it where it is written',
  'proposing.apply.link-not-alone':
    'the link {from} {type} {to} is not written by itself in a block: edit it in the text',
  'proposing.apply.thing-not-alone': '{thing} is not written by itself in a block: edit it in the text',
  'proposing.apply.in-path': '{thing} is also named in a longer path: edit it in the text',
  'proposing.apply.not-kind': "{thing} is not a {kind}: the statement's MATCH names a kind it does not have",
  'proposing.apply.still-linked':
    '{thing} still has links: a DELETE without DETACH leaves none without its end; write DETACH DELETE to take them too',
  'proposing.apply.no-block': 'graph {graph} has no block to write into',
  // a change written that did not take effect (proposals-apply.ts)
  'proposing.taken.not-read': 'graph {graph} was not read',
  'proposing.taken.thing-missing': '{thing} is not in the graph after it was written',
  'proposing.taken.link-missing': 'the link {from} {type} {to} is not in the graph after it was written',
  'proposing.taken.value-missing': '{thing}.{key} is not {value} after it was written',
  'proposing.taken.thing-left': '{thing} is still in the graph',
  'proposing.taken.link-left': 'the link {from} {type} {to} is still in the graph',
  // an accept, a reject or an undo refused (proposals-review.ts, proposals-author.ts, proposals-needs.ts)
  'proposing.review.empty': 'this change set holds no change',
  'proposing.review.no-group': 'no group called {group}',
  'proposing.review.no-change': 'no change {id} in this proposal',
  'proposing.review.already-accepted': '{id} was already accepted by {who}',
  'proposing.review.already-rejected': '{id} was already rejected by {who}',
  'proposing.review.name-taken': '{name} is already a name in graph {graph}: choose another',
  'proposing.review.cannot-write': '{id} cannot be written: {why}',
  'proposing.review.not-taken': '{id} did not take effect: {why}',
  'proposing.review.new-problem': 'it would leave the graph with a problem: {problem}',
  'proposing.review.nowhere': 'the decision could not be recorded: the note has nowhere to write it',
  'proposing.review.nothing-to-undo': 'nothing to undo',
  'proposing.undo.block-changed': 'the block has changed since the decision was made, so it cannot be undone',
  'proposing.undo.judgement-changed':
    'the judgement block has changed since the decision was made, so it cannot be undone',
  'proposing.undo.change-set-changed': 'the change set has changed since the decision was made, so it cannot be undone',
  'proposing.decider.unnamed': 'a person decides: say who is deciding',
  'proposing.decider.proposer': '{proposer} proposed this, and is not a person: a person decides',
  'proposing.declaration.waits':
    'declares who proposed this, so that the graph spec’s check knows its author: reject the changes that wait too, or accept one of them',
  'proposing.needs.accept-first': '{id} needs {other}, which adds {name}: accept {other} first',
  'proposing.needs.missing': '{id} needs {name}, which is not in the graph',
  'proposing.needs.reject-too': '{id} needs {name}, which {other} adds: reject {id} too, or leave {other}',
  // the graph moved since, and the graph spec's check (proposals-basis.ts, proposals-check.ts)
  'proposing.stale':
    'The graph has changed since this was proposed (it was made against state {was}, and the graph is now {now}). Check each change against the graph as it is before accepting it.',
  'proposing.check.nothing-waits': 'nothing waits in it, so there is nothing to check',
  'proposing.check.cannot-load': 'the note’s graphs load for the check (line {line}: {why})',
  'proposing.check.fails': 'the graph spec’s check of this change set fails: {failed}',
  // a statement or a block that is not read as a change set (proposals-statements.ts, proposals-text.ts)
  'proposing.statement.link-set': 'a SET of a link’s property is not one the editor lists: edit it in the text',
  'proposing.statement.one-set':
    'a SET gives one property: write each as its own statement, as `SET thing.key = value`',
  'proposing.text.not-change-set':
    'this is not a change set: its first line reads `// graph: <graph> · CHANGE SET <id> · against <state> · by <author>`',
  'proposing.text.old-form':
    'this change set is in the editor’s old form, where removals, ids and decisions were comments that other tools skip, so a rejected change stayed live. It is not read: remove the block and ask for the proposal again',
  // what a change does to what it marks, said in a word and in a line, never by colour alone (proposals-marks.ts)
  'proposal.mark.add': 'Added',
  'proposal.mark.change': 'Changed',
  'proposal.mark.remove': 'Removed',
  'proposal.mark.add-within': 'added',
  'proposal.mark.change-within': 'changed',
  'proposal.mark.remove-within': 'removed',
  'proposal.said.add': 'Added: {change}',
  'proposal.said.change': 'Changed: {change}',
  'proposal.said.remove': 'Removed: {change}',
  // a change to a type that its instances suggest (type-suggestion.ts)
  'proposal.type-suggestion': 'Type suggestion: {thing}.{key} = {value}, as {count} of {of} instances say',
} as const;
