// A lens as graph data (editor spec §33, lens_is_saved_query). Its Python twin is graphspec/engine/lenses/
// saved_lenses.py, and test/saved-lens-cases.json holds both to the same answers.
//
// A lens is a Lens thing: a name, a saved query and, if it likes, a default altitude. It is graph data, so it joins
// and can be contested like any claim. It holds no data of its own. Its answer is worked out each time it runs, from
// the graph as it is then, so a lens opened after an edit answers fresh.
//
// A query names a kind, or * for every thing, and may add WHERE and a guard-language test of each thing's
// properties: `Decision WHERE status == 'open'`. A thing lacking a property the test names does not match.
//
// A lens may name the schemas it depends on, written as comma-separated text such as
// `schemas: 'decision@1, risk@2'`. When the graph now names another
// version of one, the lens is flagged, never changed.
'use strict';

const { guardHolds } = require('../rules/guards.js');

/** The properties a lens may have. Any other is data, which a lens never holds. */
const LENS_PROPS = [
  'id',
  'name',
  'query',
  'altitude',
  'schemas',
  'likelihood',
  'likelihood_to',
  'confidence',
  'status',
];
const QUERY = /^\s*(\*|[A-Za-z_]\w*)(?:\s+WHERE\s+([\s\S]+?))?\s*$/;
const base = (schema) => String(schema).replace(/@[^@]*$/, '');

/** A saved query read: the kind it asks for, or null for every thing, and its test. Null when it cannot be read. */
function queryOf(text) {
  const m = typeof text === 'string' ? QUERY.exec(text) : null;
  if (!m) return null;
  return { kind: m[1] === '*' ? null : m[1], where: m[2] ?? null };
}

/** The lens things of a graph, each with what it asks and what is flagged on it, by id. */
function lensesOf(graph, options = {}) {
  const now = options.schemas || {};
  return graph
    .labelled('Lens')
    .sort()
    .map((id) => {
      const p = graph.p(id),
        flags = [];
      const query = queryOf(p.query);
      if (typeof p.name !== 'string' || !p.name) flags.push(['lens-unnamed', '']);
      if (query === null) flags.push(['query-unreadable', String(p.query ?? '')]);
      const extra = Object.keys(p)
        .filter((k) => !LENS_PROPS.includes(k))
        .sort();
      if (extra.length) flags.push(['lens-holds-data', extra.join(', ')]);
      for (const e of graph.out(id)) flags.push(['lens-holds-data', `${e[1]} ${e[2]}`]);
      const schemas =
        typeof p.schemas === 'string'
          ? p.schemas
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      for (const s of schemas)
        if (Object.hasOwn(now, base(s)) && now[base(s)] !== s)
          flags.push(['schema-changed', `${s} -> ${now[base(s)]}`]);
      return {
        id,
        name: p.name ?? null,
        query: p.query ?? null,
        altitude: p.altitude ?? null,
        schemas,
        topics: query && query.kind ? [query.kind] : [],
        flags,
      };
    });
}

/**
 * A lens run on the graph as it is now: the things its query finds, in the graph's order, its default altitude and its
 * flags. `schemas` gives the version the graph now names for each schema, by name without its version.
 */
function runLens(graph, lensId, options = {}) {
  const lens = lensesOf(graph, options).find((l) => l.id === lensId);
  if (!lens) throw new Error(`refused: ${lensId} is not a lens (editor spec §33)`);
  const query = queryOf(lens.query);
  const things = [];
  if (query)
    for (const [id, [labels, props]] of graph.nodes) {
      if (labels.has('Lens') || (query.kind !== null && !labels.has(query.kind))) continue;
      let hit = true;
      if (query.where !== null)
        try {
          hit = guardHolds(query.where, props);
        } catch {
          hit = false;
        }
      if (hit) things.push(id);
    }
  return { lens: lens.id, things, altitude: lens.altitude, flags: lens.flags };
}

module.exports = { lensesOf, runLens };
