// check(): every rule that applies to a graph, with drafts' near-duplicate names (graph_rules.py).
'use strict';

const { schemaFor } = require('../graph/graph.js');
const { SPEC_NODES, typed } = require('./types.js');
const { projectsBack } = require('./projection.js');
const { section20 } = require('./certainty.js');
const { pathsRules } = require('./paths.js');
const { judgementsRules } = require('./judgements.js');
const { servedRules } = require('./servings.js');
const { provRules } = require('./provenance.js');

// §23 applies to a graph that declares the judgement basis (RESTS_ON), or holds proposals or servings — as graph_rules.py
const isJudgementGraph = (g) =>
  g.labelled('ElementType').some((t) => g.p(t).name === 'RESTS_ON') ||
  g.labelled('Proposal').length > 0 ||
  g.labelled('Serving').length > 0;
// §5 drafts (6 Oct 2026), as graph_rules.py: a graph with no schema — none of its own, none named — has its kinds and types worked out from the data
const isDraft = (w, name) => !w[name].labelled('ElementType').length && !(w.__named || {})[name];
const drafted = (g) => [
  [...new Set([...g.nodes.values()].flatMap(([labels]) => [...labels].filter((x) => !SPEC_NODES.includes(x))))].sort(),
  [...new Set(g.edges.map((e) => e[1]))].sort(),
];
function lev(a, b) {
  const row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] !== b[j - 1] ? 1 : 0));
      prev = t;
    }
  }
  return row[b.length];
}
const nearDuplicates = (names) => {
  const n = (x) => x.replace(/_/g, '').toLowerCase(),
    out = [];
  names.forEach((a, i) =>
    names.slice(i + 1).forEach((b) => {
      if (lev(n(a), n(b)) <= (Math.min(n(a).length, n(b).length) >= 8 ? 2 : 1)) out.push([a, b]);
    }),
  );
  return out;
};
// Every rule that applies to graph `name`, as [label, ok] pairs: §5 (near-duplicate names for a draft, else declared
// types), §18, §20, §22 and provenance always; §23 only for a judgement graph, and §24 H3 only when a serving matrix
// is given. A §18 refusal (a list or a `type` property) fails the rule rather than throwing; `sw` holds switches.
function check(w, name, matrix, sw = new Set()) {
  const g = w[name],
    shared = g.labelled('ElementType').length ? undefined : schemaFor(w, name)[1];
  const [kinds, typeNames] = drafted(g);
  const t5 = isDraft(w, name)
    ? [
        "§5: a draft's kinds and relationship types hold no near-duplicates",
        !nearDuplicates(kinds).length && !nearDuplicates(typeNames).length,
      ]
    : ['§5: every element has a declared type', typed(g, shared)];
  let back;
  try {
    back = projectsBack(g, name);
  } catch (e) {
    if (!/^refused: §18/.test(String(e && e.message))) throw e;
    back = false;
  }
  let out = [t5, ['§18: the flat projection rebuilds the graph', back]];
  out = out.concat(section20(g, sw), pathsRules(g), provRules(w, name));
  if (isJudgementGraph(g)) out = out.concat(judgementsRules(w, name), matrix ? servedRules(w, name, matrix) : []);
  return out;
}

module.exports = { check };
