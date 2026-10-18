// The project's ethos (spec §41, ethos_checked): reads requirements/ethos.gql, each principle with its reason and its
// rules, finds a rule that names no check or a requirement that does not exist, and writes the body of the wiki's Ethos
// page, with each rule's state taken from the requirements' own proof. scripts/wiki.mjs adds the page to the wiki.
import { createRequire } from 'node:module';

const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

/** The kinds of check a rule may name in place of requirements. */
export const CHECKS = ['person', 'not yet'];

/** The ethos: {principles: [{id, order, name, why, rules}], rules: [{id, text, requirements, check, how}]}. */
export function readEthos(text) {
  const store = read([text]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const rules = new Map();
  const principles = new Map();
  for (const [key, n] of graph.nodes) {
    if (n.labels.has('Rule'))
      rules.set(key, {
        id: n.props.id,
        text: String(n.props.text ?? ''),
        requirements: String(n.props.requirements ?? '')
          .split(/\s+/)
          .filter(Boolean),
        check: n.props.check === undefined ? undefined : String(n.props.check),
        how: String(n.props.how ?? ''),
        principle: undefined,
      });
    if (n.labels.has('Principle'))
      principles.set(key, {
        id: n.props.id,
        order: Number(n.props.order),
        name: String(n.props.name ?? ''),
        why: String(n.props.why ?? ''),
        rules: [],
      });
  }
  for (const [from, type, to] of graph.edges) {
    if (type !== 'HAS_RULE' || !principles.has(from) || !rules.has(to)) continue;
    principles.get(from).rules.push(rules.get(to));
    rules.get(to).principle = principles.get(from).id;
  }
  return {
    principles: [...principles.values()].sort((a, b) => a.order - b.order),
    rules: [...rules.values()],
  };
}

/** Each fault of the ethos, as a line naming the rule or principle: `requirements` are [{id}] as readBoard gives them. */
export function ethosProblems(ethos, requirements) {
  const known = new Set(requirements.map((r) => r.id));
  const problems = [];
  for (const r of ethos.rules) {
    if (!r.principle) problems.push(`${r.id}: the rule belongs to no principle: link one to it with HAS_RULE`);
    if (r.check !== undefined && !CHECKS.includes(r.check))
      problems.push(`${r.id}: the check "${r.check}" is not one of ${CHECKS.map((c) => `"${c}"`).join(', ')}`);
    else if (!r.requirements.length && r.check === undefined)
      problems.push(`${r.id}: the rule names no check: name its requirements, or say check: 'person' or 'not yet'`);
    for (const id of r.requirements)
      if (!known.has(id)) problems.push(`${r.id}: no requirement ${id} in requirements/editor-requirements.gql`);
  }
  for (const p of ethos.principles) if (!p.rules.length) problems.push(`${p.id}: the principle has no rule`);
  return problems;
}

/** A rule's state, in words, from the proof of the requirements it names. */
function stateOf(rule, status) {
  if (rule.check === 'person') return '👤 Checked by a person';
  if (rule.check === 'not yet') return '⚪ Not checked yet';
  const proved = rule.requirements.filter((id) => status.get(id) === 'proved').length;
  return proved === rule.requirements.length
    ? '✅ Checked automatically'
    : `🟡 Being built (${proved} of ${rule.requirements.length} proved)`;
}

const cell = (text) => String(text).replace(/[\\|]/g, '\\$&');

/** The Ethos page's Markdown, without the footer the wiki adds. */
export function ethosPage(ethos, requirements) {
  const status = new Map(requirements.map((r) => [r.id, r.status]));
  const auto = ethos.rules.filter((r) => stateOf(r, status).startsWith('✅')).length;
  const sections = ethos.principles.map((p, i) => {
    const rows = p.rules.map((r) => {
      const how = r.requirements.length ? r.requirements.map((id) => `\`${id}\``).join(', ') : cell(r.how);
      return `| ${cell(r.text)} | ${stateOf(r, status)} | ${how} |`;
    });
    return [`## ${i + 1}. ${p.name}`, '', p.why, '', '| Rule | State | Checked by |', '|---|---|---|', ...rows].join(
      '\n',
    );
  });
  return (
    `# Ethos\n\nWhat Thoughtknot stands for, and the rules that follow from it. Each rule says how it is checked, ` +
    `so anyone can see whether it holds. ${auto} of ${ethos.rules.length} rules checked automatically.\n\n` +
    `${sections.join('\n\n')}\n\nA name in the last column is a requirement in ` +
    `[\`requirements/editor-requirements.gql\`](https://github.com/rogerbucks/graph-note/blob/main/requirements/editor-requirements.gql), ` +
    `proved by the tests it names.\n`
  );
}
