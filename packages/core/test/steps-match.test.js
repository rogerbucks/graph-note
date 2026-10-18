// A step's pattern matched within bounds (editor spec §20 graph_step_io; spec §9). Every link looked at counts against
// MOST_TRIES, the ones a thing at its far end does not fit among them. A step that finds more than MOST_MATCHES matches
// is stopped. Either way nothing is given, and the run says why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { MOST_MATCHES, MOST_TRIES, matchesOf } from '../src/steps-match.ts';
import { readRule } from '../src/steps-rule.ts';
import { runStep, stepsOf } from '../src/steps.ts';

/** A star: `leaves` things each linked to one hub by R, every thing of kind T. */
function star(leaves) {
  const things = new Map([['hub', { kinds: new Set(['T']), props: {} }]]),
    links = [];
  for (let i = 0; i < leaves; i++) {
    things.set(`l${i}`, { kinds: new Set(['T']), props: {} });
    links.push([`l${i}`, 'R', 'hub']);
  }
  return { things, links };
}

describe('the work of matching a step’s pattern is bounded', () => {
  // proves: graph_step_io
  test('every link looked at counts, those whose far end does not fit among them: past MOST_TRIES it stops', () => {
    // from each leaf to the hub, then back out along every other leaf's link, none of which fits (:Nope)
    const rule = readRule('MATCH (a)-[:R]->(h)<-[:R]-(b:Nope) INSERT (a)-[:S]->(b)');
    const leaves = Math.ceil(Math.sqrt(MOST_TRIES)) + 10;
    const r = matchesOf(rule, star(leaves));
    assert.equal(r.over, true, `${leaves} × ${leaves} links looked at is over ${MOST_TRIES}`);
    assert.deepEqual(r.found, []);
    // a control: the same pattern over a small star looks at few links, and is not stopped
    assert.deepEqual(matchesOf(rule, star(50)), { found: [], over: false });
  });

  // proves: graph_step_io
  test('a step finding more than MOST_MATCHES matches is stopped, gives nothing, and says so', () => {
    const people = Math.ceil(Math.sqrt(MOST_MATCHES)) + 2;
    const lines = ['// graph: team', "(atlas:Project {name: 'Atlas'}),"];
    for (let i = 0; i < people; i++) lines.push(`(p${i}:Person {name: 'P${i}'}),`, `(p${i})-[:WORKS_ON]->(atlas),`);
    const team = lines.join('\n').replace(/,$/, '');
    const step = `// graph: team · QUERY step colleagues
// takes people: (:Person), (:Project), [:WORKS_ON]
MATCH (a:Person)-[:WORKS_ON]->(p:Project)<-[:WORKS_ON]-(b:Person)
INSERT (a)-[:WORKS_WITH]->(b)`;
    const note = `# Team\n\n\`\`\`gql\n${team}\n\`\`\`\n\n\`\`\`gql\n${step}\n\`\`\`\n`;
    const [s] = stepsOf(gqlBlocks(note).map((b) => b.text));
    const r = runStep(note, s, { people: { graph: 'team' } }, { at: '2026-10-14' });
    assert.deepEqual(r, {
      refused: [
        'Step colleagues found more than 10,000 matches, so it was stopped: give it a smaller part of the graph.',
      ],
    });
  });
});
