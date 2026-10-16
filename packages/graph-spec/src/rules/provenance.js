// W3C PROV is normative for provenance (graph spec §11, §12, §24): a derivation links to its rule with HAD_PLAN
// (req:11.had-plan), who proposed, decided or wrote a thing is WAS_ATTRIBUTED_TO an agent (req:24.prov-attributed), and
// a revision is generated after what it supersedes (req:12.prov-revision). Each rule is given only where the graph holds
// what it is about, so a graph without provenance gains no check. The twin of provenance.py.
'use strict';

const { isTime } = require('../values/times.js');
const { resolve } = require('./judgements.js');

// the agent types: a Model counts as a SoftwareAgent wherever one is accepted (decided 16 Oct 2026)
const AGENT_LABELS = ['Person', 'Organization', 'SoftwareAgent', 'Model'];
/** Whether labels type an agent: a Person, an Organization, a SoftwareAgent, or a Model, which counts as one. */
const isAgent = (labels) => AGENT_LABELS.some((x) => labels.has(x));
/** Whether an activity HAD_PLAN a rule: it carries out one, so what it generated is a cache (§24). */
const hadPlan = (g, a) => g.out(a, 'HAD_PLAN').length > 0;
// whether a thing is the rule named: its id is it, or it says so in its `rule`, or it is a Ref to it (a rule's id is
// often not a name a statement can write, as rule:total@1 is not)
const namesRule = (g, thing, rule) => {
  const p = g.p(thing);
  return thing === rule || p.rule === rule || (g.has(thing, 'Ref') && p.ref === rule);
};
// the instant a value says, to compare as text: a date is its midnight
const when = (v) => (isTime(v) ? (v.kind === 'date' ? v.s + 'T00:00:00' : v.s) : null);

/** The provenance rules that apply to graph `name` of world `w`, as [label, ok]. */
function provRules(w, name) {
  const g = w[name],
    out = [];
  const derives = g.labelled('Activity').filter((a) => typeof g.p(a).rule === 'string' && g.p(a).rule !== '');
  if (derives.length)
    out.push([
      '§11 req:11.had-plan: every activity that derives an element by a rule links to that rule with HAD_PLAN',
      derives.every((a) => g.out(a, 'HAD_PLAN').some((e) => namesRule(g, e[2], g.p(a).rule))),
    ]);
  const attributed = g.edges.filter((e) => e[1] === 'WAS_ATTRIBUTED_TO');
  if (attributed.length)
    out.push([
      '§24 req:24.prov-attributed: every WAS_ATTRIBUTED_TO link goes to a Person, Organization or SoftwareAgent (a Model counts as one)',
      attributed.every((e) => isAgent(g.has(e[2], 'Ref') ? resolve(w, g.p(e[2]))[1] : g.nodes.get(e[2])[0])),
    ]);
  const revisions = g.edges
    .filter((e) => e[1] === 'SUPERSEDES')
    .map((e) => [when(g.p(e[0]).generated_at), when(g.p(e[2]).generated_at)])
    .filter(([successor, predecessor]) => successor !== null && predecessor !== null);
  if (revisions.length)
    out.push([
      '§12 req:12.prov-revision: every successor was generated after what it supersedes',
      revisions.every(([successor, predecessor]) => successor >= predecessor),
    ]);
  return out;
}

module.exports = { AGENT_LABELS, isAgent, hadPlan, provRules };
