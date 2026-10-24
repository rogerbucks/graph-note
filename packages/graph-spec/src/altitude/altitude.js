// Altitude and audience profiles (editor spec §32). Its Python twin is graphspec/engine/altitude/altitude.py, and
// test/altitude-cases.json holds both to the same answers.
//
// Two axes, kept apart (altitude_composition_apart):
// - Composition: how things nest. A Path holds its steps (graph spec §22) and a Cluster its members. Each has a level:
//   a path's altitude, or a cluster's altitude if written, else how deep its clusters nest. Altitude is a query
//   parameter over these levels (altitude_query_parameter). At a level, each part over it opens. Each part at or under
//   it shows as one thing: a path as itself, a cluster as its centroid. Links between shown things are bundled.
// - Audience: who a view is for. A Profile thing names one, by three criteria: vocabulary depth, prerequisite knowledge
//   and the ratio of metaphor to mechanism (audience_profiles_named). A board, a risk team or a university class all
//   use the same three (one_profile_mechanism).
// A thing's place on the audience axis is a link, never a property of the thing alone (altitude_relative_to_lens). A
// PROJECTED_FOR link to a profile holds the text that profile reads. An AT_ALTITUDE link to a lens or profile holds the
// level it shows the thing at. So switching lens or profile re-projects the view and edits nothing.
'use strict';

const { centroidId } = require('../clusters/centroids.js');

/** The criteria every profile is defined by, business and teaching alike. */
const CRITERIA = ['vocabulary_depth', 'prerequisite_knowledge', 'metaphor_to_mechanism'];
/** The properties that would put a thing's audience altitude on the thing alone. They are flagged. */
const ON_THING = ['band', 'audience', 'audience_altitude'];
/** The links that make the composition, never drawn as links between shown things. */
const STRUCTURE = ['STEP', 'MEMBER_OF'];

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The parts of the composition: each Path and Cluster, its members and its level. */
function partsOf(graph) {
  const members = new Map();
  for (const id of graph.labelled('Path'))
    members.set(
      id,
      graph.out(id, 'STEP').map((e) => e[2]),
    );
  for (const id of graph.labelled('Cluster'))
    if (!members.has(id))
      members.set(
        id,
        graph.inc(id, 'MEMBER_OF').map((e) => e[0]),
      );
  const level = new Map();
  // A part's level: its written altitude, else one more than the deepest part inside it. A loop counts as level 1.
  const levelOf = (id, open = new Set()) => {
    if (level.has(id)) return level.get(id);
    const a = graph.p(id).altitude;
    if (typeof a === 'number') return level.set(id, a).get(id);
    if (open.has(id)) return 1;
    open.add(id);
    let deepest = 0;
    for (const m of members.get(id)) if (members.has(m)) deepest = Math.max(deepest, levelOf(m, open));
    open.delete(id);
    return level.set(id, deepest + 1).get(id);
  };
  for (const id of members.keys()) levelOf(id);
  const parent = new Map();
  for (const [id] of graph.nodes)
    if (members.has(id))
      for (const m of members.get(id)) if (!parent.has(m) && graph.nodes.has(m) && m !== id) parent.set(m, id);
  return { members, level, parent };
}

/**
 * What a query shows at altitude `level` (altitude_query_parameter). Each thing shows as the highest part holding it
 * at or under the level, and the parts over it open. The links between what is shown are bundled with a count. Level 0
 * shows every thing.
 */
function atAltitude(graph, level) {
  const { members, level: levels, parent } = partsOf(graph);
  const shownAs = (id) => (graph.has(id, 'Path') || !members.has(id) ? id : centroidId(id));
  const rep = new Map();
  for (const [id] of graph.nodes) {
    if (members.has(id) && levels.get(id) > level) continue;
    let best = id;
    const seen = new Set([id]);
    for (let at = parent.get(id); at !== undefined && !seen.has(at); at = parent.get(at)) {
      seen.add(at);
      if (levels.get(at) <= level) best = at;
    }
    rep.set(id, shownAs(best));
  }
  const things = [...new Set(rep.values())];
  const bundled = new Map();
  for (const [a, type, b] of graph.edges) {
    if (STRUCTURE.includes(type) || !rep.has(a) || !rep.has(b)) continue;
    const ra = rep.get(a),
      rb = rep.get(b);
    if (ra === rb) continue;
    const key = JSON.stringify([ra, type, rb]);
    bundled.set(key, (bundled.get(key) || 0) + 1);
  }
  const links = [...bundled]
    .map(([k, n]) => [...JSON.parse(k), n])
    .sort((x, y) => byText(JSON.stringify(x), JSON.stringify(y)));
  const replaced = Object.fromEntries([...rep].filter(([id, r]) => id !== r).sort(([a], [b]) => byText(a, b)));
  return { level, things, links, shown_as: replaced };
}

/** The audience profiles: each Profile's name, domain and three criteria, and any criterion it lacks. */
function profilesOf(graph) {
  return graph
    .labelled('Profile')
    .sort(byText)
    .map((id) => {
      const p = graph.p(id);
      const criteria = Object.fromEntries(CRITERIA.filter((c) => p[c] !== undefined).map((c) => [c, p[c]]));
      return {
        id,
        name: typeof p.name === 'string' ? p.name : id,
        domain: typeof p.domain === 'string' ? p.domain : null,
        criteria,
        missing: CRITERIA.filter((c) => p[c] === undefined),
      };
    });
}

/** A profile found by its id or name. */
const profileNamed = (profiles, name) => profiles.find((p) => p.id === name || p.name === name);

/**
 * Each thing as the profiles passed to a lens read it (audience_profiles_named). A thing may carry several. For each
 * domain, the first profile passed that has a projection of the thing gives it. Profiles of one domain so combine.
 */
function audienceProjection(graph, names) {
  const profiles = profilesOf(graph),
    asked = names.map((n) => profileNamed(profiles, n)).filter(Boolean);
  const out = {};
  for (const [id] of graph.nodes) {
    const links = graph.out(id, 'PROJECTED_FOR');
    if (!links.length) continue;
    const seen = {};
    for (const p of asked) {
      const domain = p.domain ?? p.id;
      if (Object.hasOwn(seen, domain)) continue;
      const link = links.find((e) => e[2] === p.id);
      if (link) seen[domain] = { profile: p.id, text: link[3].text ?? null };
    }
    if (Object.keys(seen).length) out[id] = seen;
  }
  return out;
}

/**
 * The level a lens or profile shows each thing at: its AT_ALTITUDE link, else the lens's own default altitude. The
 * things that put their audience altitude on themselves alone are flagged (altitude_relative_to_lens).
 */
function altitudesIn(graph, lens) {
  const fallback = typeof graph.p(lens).altitude === 'number' ? graph.p(lens).altitude : null;
  const levels = {},
    flags = [];
  for (const [id, [labels, props]] of graph.nodes) {
    if (id === lens || labels.has('Lens') || labels.has('Profile')) continue;
    for (const k of ON_THING) if (Object.hasOwn(props, k)) flags.push(['altitude-on-thing', id, k]);
    if (labels.has('Path') || labels.has('Cluster')) continue;
    const link = graph.out(id, 'AT_ALTITUDE').find((e) => e[2] === lens);
    const at = link && typeof link[3].level === 'number' ? link[3].level : fallback;
    if (at !== null) levels[id] = at;
  }
  return { lens, levels, flags };
}

/** A thing's composition level: its written composition, a part's level, or 0 for a plain thing. */
function compositionOf(graph, parts, id) {
  const c = graph.p(id).composition;
  if (c !== undefined) return c;
  return parts.members.has(id) ? parts.level.get(id) : 0;
}

/**
 * The things on one axis or both (altitude_composition_apart). `composition` keeps those at that composition level.
 * `audience` keeps those a profile of that name projects or places. Given both, a thing must match both.
 */
function byAxes(graph, query = {}) {
  const parts = partsOf(graph),
    profiles = profilesOf(graph);
  const audience = query.audience === undefined ? null : profileNamed(profiles, query.audience);
  const out = [];
  for (const [id, [labels]] of graph.nodes) {
    if (labels.has('Profile') || labels.has('Lens')) continue;
    if (query.composition !== undefined && compositionOf(graph, parts, id) !== query.composition) continue;
    if (query.audience !== undefined) {
      if (!audience) continue;
      const linked = graph
        .out(id)
        .some((e) => (e[1] === 'PROJECTED_FOR' || e[1] === 'AT_ALTITUDE') && e[2] === audience.id);
      if (!linked) continue;
    }
    out.push(id);
  }
  return out;
}

module.exports = { CRITERIA, atAltitude, profilesOf, audienceProjection, altitudesIn, byAxes };
