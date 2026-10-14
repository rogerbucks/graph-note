// Graph steps (editor spec §20, graph_step_io, step_inputs_checked, run_declared_only, step_output_proposal): a step is
// a query block named as a step, `// graph: <graph> · QUERY step <name>`, that declares the named points it takes a graph
// at (`// takes <point>: (:Kind), [:TYPE]`) and is a GQL query over graph data — MATCH a pattern, then INSERT the links
// it implies — never code or a named action. Each input, a whole graph or part of one such as a queried path, is
// checked against its point before the rule runs; the output is a graph, offered as a proposal (§17) and written only
// when a person accepts it. Nothing here runs a step unasked: a host calls `runStep` when the user presses Run.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind, gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { linkChange, thingChange } from '../src/proposals.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { viewBlock, viewQuery } from '../src/view-write.ts';
import { checkInputs, inputsFor, MOST_STEP_CHARACTERS, runStep, stepOf, stepsOf } from '../src/steps.ts';
import { ruleTokens } from '../src/steps-rule.ts';

const TEAM = `// graph: team
(ada:Person {name: 'Ada'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(atlas:Project {name: 'Atlas'}),
(ada)-[:WORKS_ON]->(atlas), (bob)-[:WORKS_ON]->(atlas), (cy)-[:WORKS_ON]->(atlas)`;
const STEP = `// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)`;
const note = (...blocks) => `# Team\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const texts = (n) => gqlBlocks(n).map((b) => b.text);
const AT = '2026-10-14T10:00:00Z';
const stepIn = (n, i = 0) => stepsOf(texts(n))[i];
const run = (n, given, i = 0) => runStep(n, stepIn(n, i), given, { at: AT });
const pairs = (out) => out.links.map((l) => l.join(' ')).sort();

describe('a step takes graphs in at named points and gives a graph out', () => {
  // proves: graph_step_io
  test('a step block names its graph, its points and what each takes, and is never read as data', () => {
    const n = note(TEAM, STEP);
    const [step] = stepsOf(texts(n));
    assert.equal(step.name, 'colleagues');
    assert.equal(step.graph, 'team');
    assert.equal(step.block, 1);
    assert.deepEqual(step.points, [{ name: 'people', kinds: ['Person', 'Project'], types: ['WORKS_ON'] }]);
    assert.equal(dataKind(STEP), null);
    assert.deepEqual(readNote(texts(n)).graphs, readNote(texts(note(TEAM))).graphs);
    assert.deepEqual(readNote(texts(n)).problems, []);
  });

  // proves: graph_step_io
  test('given the whole graph at its point, it gives a graph: the links its rule implies, between the things matched', () => {
    const r = run(note(TEAM, STEP), { people: { graph: 'team' } });
    assert.deepEqual(r.output.things, ['ada', 'bob', 'cy']);
    assert.deepEqual(pairs(r.output), [
      'ada WORKS_WITH bob',
      'ada WORKS_WITH cy',
      'bob WORKS_WITH ada',
      'bob WORKS_WITH cy',
      'cy WORKS_WITH ada',
      'cy WORKS_WITH bob',
    ]);
  });

  // proves: graph_step_io
  test('given part of a graph, a queried path, it works on that part alone', () => {
    const path = viewBlock(
      'team',
      'ada_to_cy',
      viewQuery('reaches', { from: 'ada', to: 'cy', steps: 2, directed: false }),
    );
    const r = run(note(TEAM, path, STEP), { people: { graph: 'team', view: 'ada_to_cy' } });
    assert.deepEqual(pairs(r.output), ['ada WORKS_WITH cy', 'cy WORKS_WITH ada']);
    assert.deepEqual(r.proposal.provenance.read, ['people: view ada_to_cy of team']);
  });

  // proves: graph_step_io
  test('two points, each given its own graph, are read together, and what the target lacks is proposed with it', () => {
    const skills = `// graph: skills\n(ada:Person {name: 'Ada'}),\n(gql:Skill {name: 'GQL'}),\n(ada)-[:KNOWS]->(gql)`;
    const step = `// graph: team · QUERY step needs
// takes staff: (:Person), (:Project), [:WORKS_ON]
// takes known: (:Skill), [:KNOWS]
MATCH (s:Skill)<-[:KNOWS]-(a:Person)-[:WORKS_ON]->(p:Project)
INSERT (p)-[:NEEDS]->(s)`;
    const r = run(note(TEAM, skills, step), { staff: { graph: 'team' }, known: { graph: 'skills' } });
    assert.deepEqual(pairs(r.output), ['atlas NEEDS gql']);
    assert.deepEqual(
      r.proposal.changes.map(({ op, gql }) => ({ op, gql })),
      [thingChange('gql', 'Skill', { name: 'GQL' }), linkChange('atlas', 'NEEDS', 'gql')].map(({ op, gql }) => ({
        op,
        gql,
      })),
    );
    assert.deepEqual(r.proposal.provenance.read, ['staff: graph team', 'known: graph skills']);
  });

  // proves: graph_step_io
  test('a link may be matched either way, and a pattern uses each link once, as GQL matches it', () => {
    const step = `// graph: team · QUERY step shared
// takes people: (:Person), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]-(p)-[:WORKS_ON]-(b:Person)
INSERT (a)-[:SHARES_WITH]->(b)`;
    const r = run(note(TEAM, step), { people: { graph: 'team' } });
    assert.equal(pairs(r.output).length, 6);
    assert.ok(!pairs(r.output).some((p) => /^(\w+) SHARES_WITH \1$/.test(p)), 'no one shares with themselves');
  });
});

describe('each input is checked against what the step declares it takes, before it runs', () => {
  // proves: step_inputs_checked
  test('a point given nothing is refused, naming it, and nothing is run', () => {
    const r = run(note(TEAM, STEP), {});
    assert.deepEqual(r.refused, ['Nothing is given at people: choose a graph or a view for it.']);
    assert.ok(!('output' in r) && !('proposal' in r), 'the rule never ran');
  });

  // proves: step_inputs_checked
  test('an input lacking a kind or a type its point takes is refused, naming each, before the rule runs', () => {
    const only = viewBlock('team', 'people_only', viewQuery('kinds', { kinds: ['Person'] }));
    const n = note(TEAM, only, STEP);
    const r = run(n, { people: { graph: 'team', view: 'people_only' } });
    assert.deepEqual(r.refused, [
      'people takes (:Project) things, and view people_only of team holds none.',
      'people takes [:WORKS_ON] links, and view people_only of team holds none.',
    ]);
    assert.ok(!('output' in r));
    const step = stepIn(n, 0);
    const given = inputsFor(step, { people: { graph: 'team', view: 'people_only' } }, texts(n));
    assert.deepEqual(checkInputs(step, given.inputs), r.refused);
  });

  // proves: step_inputs_checked
  test('a view that matches nothing, a graph the note does not hold, and a point not declared are each refused', () => {
    const none = viewBlock('team', 'nobody', viewQuery('picked', { ids: ['zed'] }));
    const n = note(TEAM, none, STEP);
    assert.match(
      run(n, { people: { graph: 'team', view: 'nobody' } }).refused[0],
      /^view nobody of team, given at people, matches nothing: No thing is called zed/,
    );
    assert.deepEqual(run(n, { people: { graph: 'trips' } }).refused, [
      'graph trips, given at people, is not in this note.',
    ]);
    assert.deepEqual(run(n, { people: { graph: 'team' }, extra: { graph: 'team' } }).refused, [
      'The step takes nothing at extra: it takes people.',
    ]);
  });

  // proves: step_inputs_checked
  test('a rule matching a kind or a type no point says it takes is a fault of the step itself, so it never runs', () => {
    const step = STEP.replace('// takes people: (:Person), (:Project), [:WORKS_ON]', '// takes people: (:Person)');
    const s = stepOf(step, 1);
    assert.match(s.fault, /the rule matches \(:Project\) and \[:WORKS_ON\], which no point says it takes/);
    const r = runStep(note(TEAM, step), s, { people: { graph: 'team' } }, { at: AT });
    assert.match(r.refused[0], /^Step colleagues cannot run: /);
    const none = stepOf('// graph: team · QUERY step bare\nMATCH (a:Person)-[:X]->(b) INSERT (a)-[:Y]->(b)');
    assert.match(
      none.fault,
      /a step says what it takes: write \/\/ takes <point>: \(:Kind\), \[:TYPE\] above its MATCH/,
    );
  });
});

describe('a step is a query or a declared rule, never code or a named action', () => {
  const takes = '// graph: team · QUERY step s\n// takes people: (:Person)\n';
  // proves: run_declared_only
  for (const [written, said] of [
    ['CALL algo.pageRank()', /never calls a procedure or a named action/],
    ['MATCH (a:Person) RETURN a', /gives a graph: write INSERT/],
    ['MATCH (a:Person) DETACH DELETE a', /never changes or removes anything itself/],
    ["MATCH (a:Person) SET a.name = 'x'", /never changes or removes anything itself/],
    ['colleagues()', /never calls a procedure or a named action/],
    ['const f = () => fetch(url)', /a query, never code/],
    ['MATCH (a:Person)-[:K]->(b:Person) INSERT (a)-[:K]->(c)', /INSERT names c, which the MATCH does not/],
    ["MATCH (a:Person) INSERT (a:Person {name: 'x'})", /INSERT adds links between things the MATCH found/],
  ])
    test(`“${written}” is not a step, and says why`, () => {
      const s = stepOf(`${takes}${written}`);
      assert.match(s.fault, said);
      assert.match(s.fault, /MATCH \(a:Person\)-\[:WORKS_ON\]->\(p:Project\)<-\[:WORKS_ON\]-\(b:Person\) INSERT/);
      const r = runStep(note(TEAM, `${takes}${written}`), s, { people: { graph: 'team' } }, { at: AT });
      assert.ok(r.refused && !('output' in r), 'never run');
    });

  // proves: run_declared_only
  test('only a block declared as a step is one: a view, a plain query and a data block are not', () => {
    const view = viewBlock('team', 'friends', viewQuery('picked', { ids: ['ada'] }));
    assert.deepEqual(stepsOf([TEAM, view, '// graph: team · QUERY\nMATCH (n) RETURN n']), []);
    assert.equal(stepOf(view), null);
    const unnamed = stepOf('// graph: team · QUERY step\nMATCH (a) INSERT (a)-[:X]->(a)');
    assert.match(unnamed.fault, /a step needs a name: write it after step, as QUERY step <name>/);
  });
});

describe('the output is a proposal, written only when a person accepts it', () => {
  // proves: step_output_proposal
  test('the run gives a proposal from the step, against the state of its graph, and writes nothing itself', () => {
    const n = note(TEAM, STEP);
    const r = run(n, { people: { graph: 'team' } });
    assert.equal(r.proposal.graph, 'team');
    assert.equal(r.proposal.id, 'colleagues_1');
    assert.deepEqual(r.proposal.provenance.by, { name: 'colleagues', kind: 'step' });
    assert.equal(r.proposal.provenance.basis, basisOf(n, 'team'));
    assert.equal(r.proposal.provenance.at, AT);
    assert.equal(r.proposal.changes.length, 6);
    assert.equal(r.proposal.changes[0].gql, '(ada)-[:WORKS_WITH]->(bob)');
    assert.match(
      r.proposal.changes[0].reason,
      /^found by step colleagues: \(ada\)-\[:WORKS_ON\]->\(atlas\)<-\[:WORKS_ON\]-\(bob\)$/,
    );
    assert.ok(!('note' in r), 'no note is handed back');
  });

  // proves: step_output_proposal
  test('written into the note it is a change set beside the graph, the graph untouched; accepted, the link is written', () => {
    const n = note(TEAM, STEP);
    const r = run(n, { people: { graph: 'team' } });
    const proposed = noteWithProposal(n, r.proposal);
    assert.equal(texts(proposed)[0], TEAM, 'the graph block is as it was');
    assert.equal(readNote(texts(proposed)).graphs.get('team').links.length, 3);
    const review = ProposalReview.fromChangeSet(texts(proposed)[1]);
    const accepted = review.accept(proposed, ['c1'], { name: 'you' });
    assert.ok(accepted.ok, accepted.reason);
    const links = readNote(texts(accepted.note)).graphs.get('team').links;
    assert.ok(links.some((l) => l.from === 'ada' && l.type === 'WORKS_WITH' && l.to === 'bob'));
    assert.equal(links.length, 4, 'only the change accepted');
  });

  // proves: step_output_proposal
  test('a run that works out nothing new proposes nothing, and says so; a later run has an id of its own', () => {
    const done = `${TEAM},\n(ada)-[:WORKS_WITH]->(bob), (bob)-[:WORKS_WITH]->(ada)`;
    const step = STEP.replace(
      'MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)',
      "MATCH (a:Person {name: 'Ada'})-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person {name: 'Bob'})",
    );
    const r = run(note(done, step), { people: { graph: 'team' } });
    assert.match(r.nothing, /Step colleagues works out nothing new: every link it gives is already in team/);
    assert.ok(!('proposal' in r));
    const n = note(TEAM, STEP);
    const once = noteWithProposal(n, run(n, { people: { graph: 'team' } }).proposal);
    assert.equal(run(once, { people: { graph: 'team' } }).proposal.id, 'colleagues_2');
  });

  // proves: step_output_proposal
  test('a step whose graph is not written in the note has nowhere to propose into, and says so', () => {
    const r = run(note(STEP), { people: { graph: 'team' } });
    assert.match(
      r.refused.join(' '),
      /graph team is not written in this note, so the step has nowhere to propose its output/,
    );
  });
});

describe('a step never holds the editor, however it is written (spec §9)', () => {
  // proves: run_declared_only
  test('a step longer than MOST_STEP_CHARACTERS is refused before its rule is read', () => {
    const long = `${STEP}\n${' '.repeat(MOST_STEP_CHARACTERS)}`;
    const s = stepOf(long);
    assert.match(s.fault, /a step is at most 8,192 characters long, and this one is \d[\d,]+: shorten it/);
    const adversarial = `// graph: team · QUERY step s\n// takes people: (:Person)\n${"'\\".repeat(100_000)}`;
    assert.match(stepOf(adversarial).fault, /a step is at most 8,192 characters long/);
  });

  // proves: run_declared_only
  test('the rule is read no further than its first mark that cannot be read: 200 KB of open quotes is one token', () => {
    const adversarial = "'\\".repeat(100_000);
    assert.equal(adversarial.length, 200_000);
    assert.deepEqual(ruleTokens(adversarial), [{ kind: 'bad', text: "'" }]);
    assert.deepEqual(ruleTokens(`MATCH (a ${'§'} ${"'".repeat(1000)}`).length, 4, 'MATCH, (, a and the mark');
  });

  // proves: run_declared_only
  test('a text in a pattern ends at its line: a quote left open is never read on into the next line', () => {
    const toks = ruleTokens("MATCH (a {k: 'x\n'})");
    assert.deepEqual(toks.at(-1), { kind: 'bad', text: "'" });
    assert.equal(toks.length, 7, 'MATCH ( a { k : then the open quote, and nothing after it');
  });
});
