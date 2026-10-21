// A graph step a plug-in adds, run from a note (editor spec §20, plugin_step_named; §54, trust_source_joined). A step
// block names it by its id, `· QUERY step example.sample.chain`, and says what it takes, with no rule of its own. The
// inputs are checked first and given as the person's own graphs. What the plug-in gives back is untrusted, and its new
// links are offered as a proposal, never written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { joinedGraph } from '../src/plugin-sources.ts';
import { runStep, stepsOf } from '../src/steps.ts';
import { inputText, runPluginStep } from '../src/steps-plugin.ts';

const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park)`;
const STEP = '// graph: trip · QUERY step example.sample.chain\n// takes places: (:Place)';
const note = (...blocks) => `# Trip\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const stepIn = (n) => stepsOf(gqlBlocks(n).map((b) => b.text))[0];
const LEVELS = ['Public', 'Internal'];
const AT = '2026-10-21T10:00:00Z';

/** A plug-in step that links each thing it is given to the next, and the inputs it was given. */
function chain() {
  const given = [];
  const run = async (id, inputs) => {
    given.push({ id, inputs });
    // each thing as it was given, then each linked to the next
    const things = inputs[0].text
      .split('\n')
      .filter((l) => /^\(\w+:/.test(l))
      .map((l) => l.replace(/,$/, ''));
    const ids = things.map((l) => /^\((\w+)/.exec(l)[1]);
    const links = ids.slice(1).map((x, i) => `(${ids[i]})-[:NEXT]->(${x})`);
    const text = `// graph: chain\n${[...things, ...links].join(',\n')}`;
    const g = joinedGraph({ text }, { plugin: 'example.sample', place: `step ${id}` }, inputs, LEVELS);
    return { ok: true, value: g };
  };
  return { run, given };
}

describe('a step a plug-in adds (plugin_step_named)', () => {
  test('is named by its id and holds what it takes, with no rule; one with a rule is refused', () => {
    const n = note(TRIP, STEP);
    assert.deepEqual(stepIn(n).plugin, 'example.sample');
    assert.deepEqual(stepIn(n).points, [{ name: 'places', kinds: ['Place'], types: [] }]);
    assert.match(stepIn(note(TRIP, `${STEP}\nMATCH (a) INSERT (a)-[:X]->(a)`)).fault, /which its plug-in runs/);
    assert.match(stepIn(note(TRIP, '// graph: trip · QUERY step a.b\n// takes p:')).fault, /not one word/);
  });

  test('is given its inputs as the person’s own graphs, and its new links are offered as a proposal', async () => {
    const n = note(TRIP, STEP),
      { run, given } = chain();
    const r = await runPluginStep(n, stepIn(n), { places: { graph: 'trip' } }, { at: AT, level: 'Public', run });
    assert.equal(given[0].id, 'example.sample.chain');
    assert.equal(given[0].inputs[0].trust, 'own');
    assert.match(given[0].inputs[0].text, /\(home:Place \{name: 'Home'\}\)/);
    assert.deepEqual(
      r.proposal.changes.map((c) => c.gql),
      ['(home)-[:NEXT]->(park)', '(park)-[:NEXT]->(cafe)'],
    );
    assert.equal(r.proposal.provenance.by.name, 'example_sample_chain');
  });

  test('checks the inputs before the plug-in is asked, and says when no plug-in on adds it', async () => {
    const n = note(TRIP, STEP.replace('(:Place)', '(:City)')),
      { run, given } = chain();
    const checked = await runPluginStep(n, stepIn(n), { places: { graph: 'trip' } }, { at: AT, level: 'Public', run });
    assert.ok(checked.refused.length);
    assert.equal(given.length, 0);
    const none = await runPluginStep(
      note(TRIP, STEP),
      stepIn(note(TRIP, STEP)),
      { places: { graph: 'trip' } },
      {
        at: AT,
        level: 'Public',
        run: async () => null,
      },
    );
    assert.match(none.refused[0], /no plug-in that is turned on adds it/);
    assert.match(runStep(n, stepIn(n), {}, { at: AT }).refused[0], /only the plug-in that adds it runs it/);
  });

  test('writes each input as a graph block of plain ids, kinds and properties', () => {
    const g = {
      things: new Map([['a', { kinds: new Set(['K']), props: { n: 1, 'odd key': 2 } }]]),
      links: [['a', 'T', 'a']],
    };
    assert.equal(inputText('p', g), '// graph: p\n(a:K {n: 1}),\n(a)-[:T]->(a)');
  });
});
