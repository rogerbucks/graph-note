// Which things in different graphs are one (editor spec §27, same_as_across_graphs; risk ARCH-6). Inside a graph, a
// thing's name is its id, in every note that holds a block of it. Across graphs, two things are one only when a
// written SAME_AS link says so. It goes from a thing to a Ref naming the other (`ref` and `graph`, as §23's Refs do).
// Things of the same name in two graphs with no such link stay two: they are listed as a guess, never joined. A Ref
// that names nothing is listed too. Its Python twin is graphspec/engine/mesh/same_as.py, and test/same-as-cases.json
// holds both to the same answers.
'use strict';

/** A thing's name across the world: its graph and its key, `graph/key`. */
const where = (graph, key) => `${graph}/${key}`;

/** The graphs of a world by name, shared schemas and named ones left out. */
const graphsOf = (world) => Object.keys(world).sort();

/**
 * The things the world's SAME_AS links make one, each set as sorted `graph/key` names. Also the Refs that name
 * nothing (`unresolved`), and the names held by things in two or more graphs with no link between them (`guesses`).
 */
function sameAs(world) {
  const parent = new Map();
  const find = (x) => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  const join = (a, b) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const [ra, rb] = [find(a), find(b)].sort();
    parent.set(rb, ra);
  };
  const unresolved = [];
  for (const graph of graphsOf(world)) {
    const g = world[graph];
    for (const [from, type, to] of g.edges) {
      if (type !== 'SAME_AS') continue;
      if (!g.has(to, 'Ref')) {
        join(where(graph, from), where(graph, to));
        continue;
      }
      const ref = g.p(to);
      const there = world[ref.graph];
      if (there && there.nodes.has(ref.ref)) join(where(graph, from), where(ref.graph, ref.ref));
      else unresolved.push({ graph, thing: from, ref: String(ref.ref), in: String(ref.graph) });
    }
  }
  const sets = new Map();
  for (const x of parent.keys()) sets.set(find(x), [...(sets.get(find(x)) ?? []), x].sort());
  const ones = [...sets.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // the same name in two graphs, with no SAME_AS joining them: a guess for a person to confirm
  const byKey = new Map();
  for (const graph of graphsOf(world))
    for (const [key, [labels]] of world[graph].nodes)
      if (!labels.has('Ref')) byKey.set(key, [...(byKey.get(key) ?? []), where(graph, key)]);
  const guesses = [...byKey]
    .filter(([, at]) => at.length > 1 && new Set(at.map((x) => find(x))).size > 1)
    .map(([name, at]) => ({ name, things: at }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  return { ones, unresolved, guesses };
}

module.exports = { sameAs };
