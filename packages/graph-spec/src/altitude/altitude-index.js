// The altitude and topic index (editor spec §32, altitude_topic_index). Its Python twin is
// graphspec/engine/altitude/altitude_index.py, and test/altitude-index-cases.json holds both to the same answers.
//
// Each thing is indexed by its topic tags and its altitudes. An altitude is the level a lens or profile shows it at.
// The index also names the profiles that project it. A search finds a tag exactly, or by likeness of spelling. It
// ranks what it finds by the certainty sort key from the thing's words (mesh-join.js `certaintyOf`). A contested
// thing is marked. The index
// is derived, never written: built again from the same text it is the same, its hash included.
'use strict';

const { certaintyOf } = require('../mesh/mesh-join.js');
const { jcs } = require('../hashing/canonical-json.js');
const { sha256hex } = require('../hashing/sha256.js');
const { named } = require('../hashing/named.js');

/** The kinds that frame a view rather than being things to find. */
const FRAME = ['Lens', 'Profile'];
/** How alike two spellings must be, from 0 to 1, for a search by likeness to find one. */
const ALIKE = 0.3;

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A thing's topic tags: its `topic`, and each comma-separated part of its `topics`, once each and sorted. */
function tagsOf(props) {
  const tags = [];
  if (typeof props.topic === 'string') tags.push(props.topic);
  if (typeof props.topics === 'string') for (const t of props.topics.split(',')) if (t.trim()) tags.push(t.trim());
  return [...new Set(tags)].sort(byText);
}

/** The index of a graph: one entry per thing, in the graph's order, and the hash of them all. */
function altitudeIndex(graph) {
  const entries = [];
  for (const [id, [labels, props]] of graph.nodes) {
    if (FRAME.some((l) => labels.has(l))) continue;
    const altitudes = graph
      .out(id, 'AT_ALTITUDE')
      .filter((e) => typeof e[3].level === 'number')
      .map((e) => [e[2], e[3].level])
      .sort((a, b) => byText(a[0], b[0]));
    const profiles = [...new Set(graph.out(id, 'PROJECTED_FOR').map((e) => e[2]))].sort(byText);
    const tags = tagsOf(props);
    if (!tags.length && !altitudes.length && !profiles.length) continue;
    const c = certaintyOf(props);
    entries.push({
      id,
      tags,
      altitudes,
      profiles,
      contested: props.status === 'contested',
      sort_key: c === null ? null : c.sort_key,
    });
  }
  return { entries, hash: named(sha256hex(jcs(entries))) };
}

/** The letter triples of a text, lower case and padded, as a likeness of spelling compares them. */
function triples(text) {
  const t = `  ${String(text).toLowerCase()} `;
  const out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** How alike two spellings are: the share of letter triples they have in common, from 0 to 1. */
function alike(a, b) {
  const x = triples(a),
    y = triples(b);
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/**
 * The entries a search finds, ranked by certainty sort key, highest first, then by how alike, then by id. `topic`
 * finds a tag exactly. `like` finds tags alike in spelling. `lens` with `level` keeps those it shows at that level, and
 * `profile` those it projects. Each answer says if it is contested.
 */
function searchIndex(index, query = {}) {
  const out = [];
  for (const e of index.entries) {
    let score = 1;
    if (query.topic !== undefined && !e.tags.includes(query.topic)) continue;
    if (query.like !== undefined) {
      score = e.tags.reduce((best, t) => Math.max(best, alike(query.like, t)), 0);
      if (score < ALIKE) continue;
    }
    if (query.lens !== undefined && !e.altitudes.some(([l, n]) => l === query.lens && n === query.level)) continue;
    if (query.profile !== undefined && !e.profiles.includes(query.profile)) continue;
    out.push({ id: e.id, score, sort_key: e.sort_key, contested: e.contested });
  }
  const key = (x) => (x.sort_key === null ? -Infinity : x.sort_key);
  return out.sort((a, b) => key(b) - key(a) || b.score - a.score || byText(a.id, b.id));
}

module.exports = { altitudeIndex, searchIndex };
