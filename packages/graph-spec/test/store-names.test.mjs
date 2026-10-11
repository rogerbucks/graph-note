// Names in the reader's store (graph spec §3): a graph, a shared schema or a thing may be called anything a name may be,
// a word JavaScript gives every object among them (constructor, toString, __proto__ …), and is read as any other name.
// The Python reader reads them so already: its graphs and names are dicts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');

/** Words every plain JavaScript object answers to, and so the names a store keyed by plain objects mistakes. */
const WORDS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'];

describe('a name JavaScript gives every object', () => {
  test('names a graph like any other: its things are read into it, and the world holds it', () => {
    for (const word of WORDS) {
      const store = gs.read([`// graph: ${word}\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(a)-[:R]->(b)`]);
      assert.deepEqual(
        [...store.graph(word).nodes.values()].map((n) => n.props.id),
        ['a', 'b'],
        word,
      );
      const world = gs.worldFromStore(store);
      assert.deepEqual(Object.keys(world), [word], word);
      assert.deepEqual(world[word].labelled('T'), ['a', 'b'], word);
      assert.equal(world[word].out('a', 'R').length, 1, word);
    }
  });

  test('names a thing like any other: written once, it is no thing "written twice", and a link reaches it', () => {
    for (const word of WORDS) {
      const store = gs.read([`// graph: g\n(${word}:T {name: 'W'}),\n(b:T {name: 'B'}),\n(${word})-[:R]->(b)`]);
      const world = gs.worldFromStore(store);
      assert.deepEqual(world.g.labelled('T'), [word, 'b'], word);
      assert.deepEqual(world.g.out(word, 'R'), [[word, 'R', 'b', {}]], word);
    }
  });

  test('a graph not in the world is not found there, whatever it is called', () => {
    const world = gs.worldFromStore(gs.read(["// graph: g\n(a:T {name: 'A'})"]));
    for (const word of WORDS) assert.equal(world[word], undefined, word);
  });

  test('names a shared schema like any other, and the graph that names it finds it', () => {
    const store = gs.read([
      "// graph: s · SCHEMA toString\n(m:GraphMeta {graph: 's'})",
      "// graph: g · schema toString\n(a:T {name: 'A'})",
    ]);
    const world = gs.worldFromStore(store);
    const [name, schema] = gs.schemaFor(world, 'g');
    assert.equal(name, 'toString');
    assert.deepEqual(schema.labelled('GraphMeta'), ['m']);
    assert.deepEqual(gs.schemaFor(world, 'constructor'), [undefined, undefined]);
  });

  test('after a block that cannot be read is undone, a graph called toString is still read as any other', () => {
    // the undoing copies the store's tables: a copy that is a plain object again would find toString before it is written
    const store = new gs.Store();
    store.apply("// graph: g\n(a:T {name: 'A'})");
    assert.throws(() => store.apply('// graph: g\n(nobody)-[:R]->(a)'), gs.ProfileError);
    assert.doesNotThrow(() => store.apply("// graph: toString\n(b:T {name: 'B'})"));
    const world = gs.worldFromStore(store);
    assert.deepEqual(Object.keys(world).sort(), ['g', 'toString']);
    assert.deepEqual(world.g.labelled('T'), ['a']);
    assert.deepEqual(world.toString.labelled('T'), ['b']);
  });

  test('a graph naming a shared schema called constructor, which the note lacks, reads its own links alone', () => {
    // a type without its colon is looked for in the shared schema the graph names: one not written is no graph at all
    const store = gs.read([
      "// graph: g · schema constructor\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(a)-[:R]->(b),\n(a)-[r]->(b)",
    ]);
    const world = gs.worldFromStore(store);
    assert.deepEqual(Object.keys(world), ['g']);
    assert.deepEqual(
      world.g.out('a').map((e) => e[1]),
      ['R', 'R'],
    );
  });
});
