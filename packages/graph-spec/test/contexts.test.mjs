// Contexts: where links may join (editor spec §61): contexts.js. A context is a named boundary written as graph data.
// Each graph is in one. Guesses across contexts are off until turned on. Things in two contexts stay apart. A SAME_AS
// across them is a person's. Nothing leaks from a context the viewer cannot read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');

/** The world the blocks make, read into one store. */
function worldOf(...blocks) {
  const store = new C.Store();
  for (const b of blocks) store.apply(b);
  return C.worldFromStore(store);
}

const CONTEXTS = (across = 'FALSE') => `// graph: contexts
(client_a:Context {kind: 'client', guesses_across: ${across}}),
(client_b:Context {kind: 'client'}),
(drafts:Context {kind: 'folder', path: 'drafts'}),
(a_rates:Ref {graph: 'rates_a'}),
(b_rates:Ref {graph: 'rates_b'}),
(client_a)-[:CONTAINS]->(a_rates),
(client_b)-[:CONTAINS]->(b_rates)`;
const RATES_A = "// graph: rates_a\n(rate:Field {name: 'Rate', value: 7}),\n(term:Field {name: 'Term'})";
const RATES_B =
  "// graph: rates_b\n(rate:Field {name: 'Rate', value: 9}),\n(secret_plan:Plan {name: 'Merger with Acme'})";
const NOTES_A = "// graph: notes_a\n(rate:Field {name: 'Rate'})";
const NOTES = { rates_a: 'clients/a.md', rates_b: 'clients/b.md', notes_a: 'drafts/a.md', home: 'home.md' };
const HOME = "// graph: home\n(term:Field {name: 'Term'})";

const setUp = (across) => {
  const world = worldOf(CONTEXTS(across), RATES_A, RATES_B, NOTES_A, HOME);
  return { world, ctx: C.contextsOf(world, { notes: NOTES }) };
};

describe('contexts', () => {
  test('a graph with no context named belongs to its vault, one named by note, folder or client belongs to that one, and the context is read back from the graph data', () => {
    const { ctx } = setUp();
    assert.deepEqual(ctx.byGraph, { home: 'vault', notes_a: 'drafts', rates_a: 'client_a', rates_b: 'client_b' });
    assert.deepEqual(ctx.contexts.drafts, { kind: 'folder', guessesAcross: false });
    const note = C.contextsOf(worldOf("// graph: contexts\n(mine:Context {kind: 'note', path: 'home.md'})", HOME), {
      notes: NOTES,
      vault: 'my_vault',
    });
    assert.deepEqual(note.byGraph, { home: 'mine' });
    assert.deepEqual(C.contextsOf(worldOf(HOME)).byGraph, { home: 'vault' });
  });

  test('two contexts with a same-named field show no guess until one context turns guesses on, and guesses inside one context are unchanged', () => {
    const off = setUp();
    assert.deepEqual(C.contextGuesses(off.world, off.ctx), []);
    const on = setUp('TRUE');
    assert.deepEqual(C.contextGuesses(on.world, on.ctx), [
      { name: 'rate', things: ['notes_a/rate', 'rates_a/rate', 'rates_b/rate'], across: true },
      { name: 'term', things: ['home/term', 'rates_a/term'], across: true },
    ]);
    // inside one context a guess stays as §27 lists it, whatever the setting
    const one = worldOf(
      "// graph: contexts\n(c:Context {kind: 'client'}),\n(r1:Ref {graph: 'g1'}),\n(r2:Ref {graph: 'g2'}),\n(c)-[:CONTAINS]->(r1),\n(c)-[:CONTAINS]->(r2)",
      '// graph: g1\n(x:T)',
      '// graph: g2\n(x:T)',
    );
    assert.deepEqual(C.contextGuesses(one, C.contextsOf(one)), [
      { name: 'x', things: ['g1/x', 'g2/x'], across: false },
    ]);
  });

  test('a view filter turns cross-context guesses on and off over the default, and the note text is byte for byte the same after', () => {
    const blocks = [CONTEXTS(), RATES_A, RATES_B, NOTES_A, HOME];
    const before = blocks.join('\n');
    const world = worldOf(...blocks);
    const ctx = C.contextsOf(world, { notes: NOTES });
    assert.equal(C.contextGuesses(world, ctx, { acrossContexts: true }).length, 2);
    assert.deepEqual(C.contextGuesses(world, ctx, { acrossContexts: false }), []);
    const on = setUp('TRUE');
    assert.deepEqual(C.contextGuesses(on.world, on.ctx, { acrossContexts: false }), []);
    assert.equal(blocks.join('\n'), before);
  });

  test('two clients with a Rate field are never compared, unless both name decision@1 or a SAME_AS link joins them', () => {
    const { world, ctx } = setUp('TRUE');
    assert.equal(C.comparable(world, ctx, 'rates_a/rate', 'rates_b/rate'), false, 'shown as a guess is not compared');
    const typed = worldOf(
      CONTEXTS(),
      RATES_A.replace('// graph: rates_a', '// graph: rates_a · schema decision@1'),
      RATES_B.replace('// graph: rates_b', '// graph: rates_b · schema decision@1'),
    );
    assert.equal(C.comparable(typed, C.contextsOf(typed), 'rates_a/rate', 'rates_b/rate'), true);
    const linked = worldOf(
      CONTEXTS(),
      `${RATES_A},\n(b_rate:Ref {graph: 'rates_b', ref: 'rate'}),\n(rate)-[:SAME_AS]->(b_rate)`,
      RATES_B,
    );
    assert.equal(C.comparable(linked, C.contextsOf(linked), 'rates_a/rate', 'rates_b/rate'), true);
    assert.equal(C.comparable(world, ctx, 'rates_a/rate', 'rates_a/term'), true, 'one context compares freely');
  });

  test('a SAME_AS across contexts proposed by an AI or a join waits for a person, and once written shows in both contexts', () => {
    const { ctx } = setUp();
    const from = { graph: 'rates_a', thing: 'rate' };
    const to = { graph: 'rates_b', thing: 'rate' };
    for (const kind of ['model', 'join', 'step'])
      assert.equal(C.proposeSameAs(ctx, from, to, { kind, name: 'ada' }).status, 'waiting', kind);
    const written = C.proposeSameAs(ctx, from, to, { kind: 'person', name: 'roger' });
    assert.equal(written.status, 'write');
    assert.equal(
      C.proposeSameAs(ctx, { ...from, thing: 'rate}) DETACH' }, to, { kind: 'person', name: 'r' }).status,
      'refused',
    );
    const world = worldOf(CONTEXTS(), `${RATES_A},\n${written.text}`, RATES_B);
    const listed = (c) => C.sameAsAcross(world, C.contextsOf(world), c);
    assert.deepEqual(listed('client_a'), [
      { from: 'rates_a/rate', to: 'rates_b/rate', contexts: ['client_a', 'client_b'] },
    ]);
    assert.deepEqual(listed('client_b'), listed('client_a'));
  });

  test('a viewer without access to client B sees no name or value from B in guesses, suggestions or search, and an AI asked in A reads nothing from B', () => {
    const { world, ctx } = setUp('TRUE');
    const canRead = (context) => context !== 'client_b';
    const guesses = JSON.stringify(C.contextGuesses(world, ctx, {}, canRead));
    assert.equal(guesses.includes('rates_b'), false);
    assert.deepEqual(C.searchContexts(world, ctx, 'merger', canRead), []);
    assert.deepEqual(C.searchContexts(world, ctx, 'merger'), ['rates_b/secret_plan']);
    assert.deepEqual(C.searchContexts(world, ctx, 'rate', canRead), ['notes_a/rate', 'rates_a/rate']);
    const forAi = C.worldIn(world, ctx, 'client_a');
    assert.deepEqual(Object.keys(forAi), ['rates_a']);
    assert.equal(JSON.stringify([...forAi.rates_a.nodes]).includes('Acme'), false);
  });
});
