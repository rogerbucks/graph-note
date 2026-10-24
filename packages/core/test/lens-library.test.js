// The lenses a person can open (editor spec §33, lens_library). Ready-made lenses are listed. A lens written by the
// person, or accepted from an AI's proposal, joins the list; a proposal not yet accepted does not.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { acceptLens, lensLibrary, lensText, proposeLens, readyLenses, writeLens } from '../src/lens-library.ts';

const graph = new gs.Graph(
  new Map([
    ['late_work', [new Set(['Lens']), { id: 'late_work', name: 'Late work', query: 'Task WHERE late == True' }]],
    ['t1', [new Set(['Task']), { id: 't1', late: true }]],
  ]),
  [],
);

describe('lens_library', () => {
  test('the ready-made lenses are listed first, each named and with its topics', () => {
    const ready = readyLenses();
    assert.ok(ready.length >= 5);
    assert.ok(ready.every((l) => l.origin === 'ready-made' && l.name.length > 0));
    assert.deepEqual(ready.find((l) => l.id === 'ready_decisions')?.topics, ['Decision']);
    const library = lensLibrary(graph);
    assert.deepEqual(library.slice(0, ready.length), ready);
    assert.equal(library.at(-1)?.id, 'late_work');
    assert.equal(library.at(-1)?.origin, 'graph');
  });

  test('a lens the person writes in the session is listed, with the line that saves it', () => {
    const { library, text } = writeLens(lensLibrary(graph), {
      id: 'open_risks',
      name: "Risks we've not closed",
      query: "Risk WHERE status == 'open'",
      altitude: 'board',
    });
    assert.equal(library.at(-1)?.id, 'open_risks');
    assert.equal(library.at(-1)?.by, 'person');
    assert.equal(
      text,
      "(open_risks:Lens {name: 'Risks we\\'ve not closed', query: 'Risk WHERE status == \\'open\\'', altitude: 'board'})",
    );
    // the saved line reads back as the same lens
    const store = new gs.Store();
    const name = store.apply(`// graph: work\n${text}`);
    const [read] = gs.lensesOf(gs.worldFromStore(store)[name]);
    assert.equal(read.query, "Risk WHERE status == 'open'");
    assert.equal(read.name, "Risks we've not closed");
  });

  test("an AI's lens joins the list only once a person accepts its proposal", () => {
    const before = lensLibrary(graph);
    const proposal = proposeLens({ id: 'stale_claims', name: 'Stale claims', query: 'Claim' });
    assert.equal(proposal.by, 'ai');
    assert.ok(!before.some((l) => l.id === 'stale_claims'));
    const { library } = acceptLens(before, proposal);
    const lens = library.find((l) => l.id === 'stale_claims');
    assert.equal(lens?.by, 'ai');
    assert.equal(lens?.origin, 'session');
    assert.equal(proposal.text, lensText(proposal.lens));
  });

  test('a lens with a taken id, no name or a query that cannot be read is refused', () => {
    const library = lensLibrary(graph);
    assert.throws(() => writeLens(library, { id: 'late_work', name: 'Again', query: 'Task' }), /taken/);
    assert.throws(() => writeLens(library, { id: 'nameless', name: '', query: 'Task' }), /lens-unnamed/);
    assert.throws(
      () => writeLens(library, { id: 'broken', name: 'Broken', query: 'two words here' }),
      /query-unreadable/,
    );
  });
});
