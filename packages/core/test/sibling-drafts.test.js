// Drafts of a thing at the bands next to its own (editor spec §32, sibling_drafts). Drafts at neighbouring bands arrive
// as proposals marked as drafts, nothing applies unaccepted, and an accepted correction updates the band's criteria.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { acceptDraft, draftRequests, neighbourBands, siblingDrafts } from '../src/sibling-drafts.ts';

const ORDER = ['board', 'risk', 'analyst'];
const crit = (v) => ({ vocabulary_depth: v, prerequisite_knowledge: v, metaphor_to_mechanism: v });
const BANDS = [
  { band: 'board', criteria: crit('plain'), examples: [] },
  { band: 'risk', criteria: crit('working'), examples: [] },
  { band: 'analyst', criteria: crit('technical'), examples: [] },
];

describe('sibling_drafts', () => {
  test('a thing written at its band asks for drafts at the bands next to it, from their criteria', () => {
    assert.deepEqual(neighbourBands(ORDER, 'risk'), ['board', 'analyst']);
    assert.deepEqual(neighbourBands(ORDER, 'board'), ['risk']);
    const requests = draftRequests('loan', 'risk', 'Credit exposure with collateral', ORDER, BANDS);
    assert.deepEqual(
      requests.map((r) => [r.from, r.to, r.criteria.vocabulary_depth]),
      [
        ['risk', 'board', 'plain'],
        ['risk', 'analyst', 'technical'],
      ],
    );
  });

  test('drafts arrive as proposals marked as drafts, and nothing applies unaccepted', async () => {
    const requests = draftRequests('loan', 'risk', 'Credit exposure', ORDER, BANDS);
    const asked = [];
    const drafts = await siblingDrafts(requests, async (r) => {
      asked.push(r.to);
      return `draft for ${r.to}`;
    });
    assert.deepEqual(asked, ['board', 'analyst']);
    assert.ok(drafts.every((d) => d.draft === true && d.by === 'ai'));
    assert.deepEqual(BANDS[0].examples, []);
  });

  test("an accepted correction updates the band's criteria, and an accepted draft as it is does not", () => {
    const proposal = { thing: 'loan', band: 'board', text: 'Money we lend out', draft: true, by: 'ai' };
    const asIs = acceptDraft(BANDS, proposal);
    assert.equal(asIs.line, "(loan)-[:PROJECTED_FOR {text: 'Money we lend out'}]->(board)");
    assert.deepEqual(asIs.bands, BANDS);
    const fixed = acceptDraft(BANDS, proposal, "Money we lend, and when it's paid back");
    assert.equal(fixed.line, "(loan)-[:PROJECTED_FOR {text: 'Money we lend, and when it\\'s paid back'}]->(board)");
    assert.deepEqual(fixed.bands[0].examples, [
      { draft: 'Money we lend out', corrected: "Money we lend, and when it's paid back" },
    ]);
    assert.deepEqual(BANDS[0].examples, []);
    const next = draftRequests('rate', 'risk', 'The price of the risk', ORDER, fixed.bands);
    assert.equal(next[0].examples.length, 1);
  });
});
