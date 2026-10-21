// The words of the graph spec's change-set check, in UK English (editor spec §42, words_catalogue). The check says
// each thing it checked as a line of UK English. Each word here is one of those lines, word for word. A rule the check
// runs on the graph after the set is said after `check.after`. check-words.test.js holds them equal to the graph spec's
// own lines. source-words.ts keeps these with every other word.

/** The words of the change-set check's own lines, by key, in UK English. */
export const CHECK_SOURCE_WORDS = {
  // the set itself: its header, its author and how it is written
  'check.names-header': 'the change set names its graph, its id, the state it was made against, and its author',
  'check.author-from-session':
    'its author is the session that sent it, not a name written in its header (editor spec §51)',
  'check.state-named':
    'the state it was made against names its algorithm: against sha-256-64:<digits> (editor spec §51)',
  'check.dialect': 'it passes the dialect linter (§24 H1)',
  'check.header-alone': 'only the header says what it was made against and who made it (§24)',
  'check.one-target': 'each DELETE and SET is its own statement and names exactly one target (§24)',
  'check.graph-in-base': "its graph {graph} is one of the base's",
  'check.made-against-now': 'it was made against the graph as it stands',
  'check.author-known': 'its author {by} is a known person or model',
  'check.loads': 'it loads',
  // what the set adds
  'check.only-adds': 'it only adds — nothing removed, nothing already there changed (§12)',
  'check.adds-no-cache': "it adds no cache — a claim's likelihood, confidence and status are the engine's (§24 rule 5)",
  'check.generated-own':
    "an added WAS_GENERATED_BY comes from a thing the set adds, to an activity of the set's own author (§24)",
  'check.plan-added':
    'an added HAD_PLAN comes from an Activity the set adds, and never from a model or software agent (§24)',
  'check.association-added': 'an added ASSOCIATED_WITH comes from an Activity the set adds (§24)',
  // what stops a DELETE or a SET
  'check.change.finds-target': 'each DELETE and SET finds its one target in the graph (§24)',
  'check.change.no-dangling':
    'a DELETE leaves no link without its end; DETACH DELETE removes a thing with its links (§24)',
  'check.change.keeps-records': 'it never removes or changes a record or a cache (§24 rule 4)',
  // what a model may add
  'check.model-adds-no-record': 'a model adds no record and no cache (§24 rule 5)',
  'check.model-own-assessments': "a model's assessments are its own",
  // a rule the check runs on the graph as the set leaves it
  'check.after': 'after it, {rule}',
  // §5 and §18: types and the flat projection
  'check.rule.draft-near-duplicates': "§5: a draft's kinds and relationship types hold no near-duplicates",
  'check.rule.declared-types': '§5: every element has a declared type',
  'check.rule.projection-rebuilds': '§18: the flat projection rebuilds the graph',
  // §20: certainty
  'check.rule.likelihood-band': '§20: every likelihood is a band declared in the graph',
  'check.rule.likelihood-latest': "§20: each claim's likelihood is its latest assessment",
  'check.rule.confidence-counted': "§20: each claim's confidence is counted from its evidence",
  'check.rule.status-follows': "§20: each claim's status follows its confirmations and refutations",
  'check.rule.derived-combine': "§20: each derived claim's range and confidence equal rule:combine@1 on its inputs",
  'check.rule.claim-assessed': '§20: every claim not derived by a rule has an assessment',
  'check.rule.calibration': '§20: every calibration record equals rule:calibration@1 on the settled claims',
  'check.rule.source-reliability': "§20: every source's reliability equals rule:source-reliability@1",
  'check.rule.corroborate': "§20: every corroborated claim's range equals rule:corroborate@1, one vote per source",
  // §22: paths
  'check.rule.path-no-loop': '§22 rule 1: altitude falls at every step into a path — no path contains itself',
  'check.rule.path-numbered': "§22 rule 2: each path's steps are numbered 1 to n",
  'check.rule.path-grounds': '§22 rule 3: every path grounds out in facts',
  'check.rule.path-order': '§22 rule 4: a path that declares an order keeps it',
  // provenance
  'check.rule.plan-is-rule': '§11 req:11.had-plan: every HAD_PLAN link goes to a Rule, or to a Ref to one',
  'check.rule.attributed-agent':
    '§24 req:24.prov-attributed: every WAS_ATTRIBUTED_TO link goes to a Person, Organization or SoftwareAgent (a Model counts as one)',
  'check.rule.revision-after': '§12 req:12.prov-revision: every successor was generated after what it supersedes',
  // §23: judgements
  'check.rule.judgement-by-person': '§23 rule 1: every judgement is decided by a person, never a model',
  'check.rule.basis-pins':
    '§23 rule 2: every basis pin resolves, says what it read (or which lens bucket), and was read no later than the decision',
  'check.rule.assumption-claim': '§23 rule 3: every assumption is a claim (§20), never a fact',
  'check.rule.review-equals': '§23 rule 4: a stored review equals rule:judgement-review@1',
  'check.rule.judgements-apart':
    '§23 rule 5: nothing in a data graph links into the judgement graph — judgements stay out of view',
  'check.rule.proposal-attributed': '§23 rule 6: every proposal is attributed to the model that proposed it',
  'check.rule.judgement-unedited':
    '§23 rule 7: no judgement is edited — each content hash, covering its pins, still matches (rule:judgement-hash@1)',
  // §24 H3: servings
  'check.rule.pins-served':
    '§24 H3 rule 1: every pin of a proposal was served to its model — same item, same properties, same hash, same time',
  'check.rule.serving-classification':
    '§24 H3 rule 2: no serving crossed its classification — the consumer was allowed every item served',
  'check.rule.proposal-used-serving':
    '§24 H3 rule 4: every proposal a model generated used a serving — it drafted from what it was shown',
  'check.rule.serving-unedited':
    '§24 H3 rule 5: no serving is edited — each content hash, covering what it served, still matches (rule:serving-hash@1)',
} as const;
