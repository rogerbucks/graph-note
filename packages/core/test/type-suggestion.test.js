// A change to a type that its instances suggest (editor spec §27, type_suggestion_bundle): type-suggestion.ts. It
// waits in the review as a labelled proposal. Only a person applies it, in one step, and it is undone in one step. It
// never applies by itself, and a type that grants permissions or is kept as history is marked for a closer look.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalReview } from '../src/proposals-review.ts';
import { typeSuggestions, TYPE_SUGGESTER, withSuggestion } from '../src/type-suggestion.ts';

const noteOf = (graph) => `# Desks\n\n\`\`\`gql\n${graph}\n\`\`\`\n`;
const DESKS = `// graph: desks
(e_reader:Kind {name: 'E-reader', weight: 200}),
(a:Item {serial: 'A1', weight: 180}),
(b:Item {serial: 'B2', weight: 180}),
(c:Item {serial: 'C3', weight: 180}),
(d:Item {serial: 'D4'}),
(a)-[:INSTANCE_OF]->(e_reader),
(b)-[:INSTANCE_OF]->(e_reader),
(c)-[:INSTANCE_OF]->(e_reader),
(d)-[:INSTANCE_OF]->(e_reader)`;
const NOTE = noteOf(DESKS);
const ROGER = { name: 'roger' };
const AT = '2026-10-24T09:00:00Z';

describe('type_suggestion_bundle', () => {
  test('strong evidence is offered as a labelled proposal, and the note is left as it was', () => {
    const [s, ...more] = typeSuggestions(NOTE, 'desks', { at: AT });
    assert.equal(more.length, 0);
    assert.equal(s.label, 'Type suggestion: e_reader.weight = 180, as 3 of 4 instances say');
    assert.deepEqual(s.evidence, { type: 'e_reader', key: 'weight', value: 180, instances: ['a', 'b', 'c'], of: 4 });
    assert.deepEqual(s.proposal.provenance.by, TYPE_SUGGESTER);
    assert.deepEqual(s.proposal.provenance.read, ['desks/a', 'desks/b', 'desks/c']);
    const change = s.proposal.changes.find((c) => c.op === 'set');
    assert.equal(change.group, s.label);
    assert.deepEqual([change.op, change.thing, change.key, change.value], ['set', 'e_reader', 'weight', '180']);
    assert.deepEqual(s.closerLook, []);
  });

  test('weak evidence, or too few instances, offers nothing', () => {
    assert.deepEqual(typeSuggestions(NOTE, 'desks', { least: 0.8 }), []);
    assert.deepEqual(typeSuggestions(NOTE, 'desks', { fewest: 5 }), []);
  });

  test('it waits in the note as a change set, which a person applies in one step and undoes in one step', () => {
    const [s] = typeSuggestions(NOTE, 'desks', { at: AT });
    const waiting = withSuggestion(NOTE, s);
    assert.match(waiting, /CHANGE SET/);
    assert.match(waiting, /\(e_reader:Kind \{name: 'E-reader', weight: 200\}\)/, 'the type is as it was until then');
    const review = ProposalReview.fromChangeSet(waiting.split('```gql\n')[2].split('\n```')[0], waiting);
    assert.deepEqual(
      review.pending(),
      s.proposal.changes.map((c) => c.id),
    );
    const r = review.accept(waiting, { all: true }, ROGER, { at: AT });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.note, /\(e_reader:Kind \{name: 'E-reader', weight: 180\}\)/);
    assert.match(r.note, /type_suggestions/, 'who proposed it is kept with the decision');
    assert.match(r.note, /roger/, 'and who accepted it');
    const back = review.undo(r.note);
    assert.equal(back.ok, true);
    assert.equal(back.note, waiting);
  });

  test('a type that grants permissions, or is kept as history, is marked for a closer look', () => {
    const roles = noteOf(
      DESKS.replace(
        "(e_reader:Kind {name: 'E-reader', weight: 200})",
        "(e_reader:Role {name: 'E-reader', weight: 200})",
      ),
    );
    assert.deepEqual(typeSuggestions(roles, 'desks')[0].closerLook, ['permission']);
    const old = noteOf(DESKS.replace('weight: 200})', "weight: 200, valid_to: DATE '2025-01-01'})"));
    assert.deepEqual(typeSuggestions(old, 'desks')[0].closerLook, ['historical']);
  });
});
