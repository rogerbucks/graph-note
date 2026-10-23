// Lasting types and the instances of them (editor spec §27, type_instance_split and instance_inherits_type). A type is a
// thing like any other, such as a reader model. An instance, such as the reader on one desk, links to its type with
// INSTANCE_OF. The type may be in another graph: the link then goes to a Ref naming it (§23), as SAME_AS does
// (same-as.js). A query asks about the type in general, or about one instance.
//
// An instance has every property of its type, unless it sets its own. Its own value wins, and changes neither the type
// nor any other instance. A type may itself be an instance of a broader type: the nearest value wins. Its Python twin
// is graphspec/engine/mesh/types_instances.py, and test/types-instances-cases.json holds both to the same answers.
'use strict';

/** The type `key` of `graph` is an instance of, as {graph, key}; null when it has none, or names nothing. */
function typeOf(world, graph, key) {
  const g = world[graph];
  const [link] = g ? g.out(key, 'INSTANCE_OF') : [];
  if (!link) return null;
  const to = link[2];
  if (!g.has(to, 'Ref')) return { graph, key: to };
  const ref = g.p(to);
  const there = world[ref.graph];
  return there && there.nodes.has(ref.ref) ? { graph: String(ref.graph), key: String(ref.ref) } : null;
}

/** The instances of the type `key` of `graph`, in any graph of the world, sorted by graph, then key. */
function instancesOf(world, graph, key) {
  const out = [];
  for (const name of Object.keys(world).sort())
    for (const id of world[name].nodes.keys()) {
      const t = typeOf(world, name, id);
      if (t && t.graph === graph && t.key === key) out.push({ graph: name, key: id });
    }
  return out.sort((a, b) => (a.graph === b.graph ? (a.key < b.key ? -1 : 1) : a.graph < b.graph ? -1 : 1));
}

/**
 * The properties of `key` of `graph`, its own and those it inherits from its type and the types above, the nearest
 * value winning. Its id is its own, never its type's. `from` says where each came from, as `graph/key`.
 */
function inherited(world, graph, key) {
  const props = {},
    from = {};
  const seen = new Set();
  for (let at = { graph, key }; at && !seen.has(`${at.graph}/${at.key}`); at = typeOf(world, at.graph, at.key)) {
    seen.add(`${at.graph}/${at.key}`);
    const g = world[at.graph];
    if (!g || !g.nodes.has(at.key)) break;
    for (const [k, v] of Object.entries(g.p(at.key)))
      // a thing's id is its own: a type's is never inherited
      if (!(k in props) && !(k === 'id' && at.key !== key)) {
        props[k] = v;
        from[k] = `${at.graph}/${at.key}`;
      }
  }
  return { props, from };
}

module.exports = { inherited, instancesOf, typeOf };
