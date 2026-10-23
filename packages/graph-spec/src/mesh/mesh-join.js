// The graph mesh's join (editor spec §28 and §30): graphs from many notes joined, with what the join found. It is
// built on the §21 join (joins/), which already keeps both sides of a clash as contested claims. This adds:
// - each conflict with both sides and who states each (conflicts_flagged_kept);
// - the gaps: what one graph states that another, holding the same thing, does not (mesh_join_reports_gaps);
// - each claim's certainty in words, its range and a sort key made from them, never read from the text
//   (certainty_in_words, certainty_query_dimension);
// - each thing's standing, where a dispute lowers only the thing disputed (doubt_stays_local), unless a view asks to
//   spread it across a cluster;
// - a marker on each link between a contested thing and a well-supported one (contested_link_marker);
// - hand-made clusters, asserted until a join disagrees about a member (hand_clusters_contestable);
// - states with the same name in joined process machines. They match only as a guess, until the user says the two are
//   in one domain (state_names_start_doubtful).
// Its Python twin is graphspec/engine/mesh/mesh_join.py, and test/mesh-join-cases.json holds both to the same answers.
'use strict';

const { norm } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { jcs } = require('../hashing/canonical-json.js');
const { RANGE, bandRank } = require('../rules/certainty.js');
const { joinedOf } = require('../joins/join-docs.js');

// The confidence words, weakest first; a claim's sort key counts them after its likelihood.
const CONFIDENCE = ['low', 'moderate', 'high'];
// The properties that hold a certainty. Each must be a word: a number here is flagged (certainty_in_words).
const CERTAINTY_PROPS = ['likelihood', 'likelihood_to', 'confidence', 'certainty', 'probability'];
// The highest chance, in percent, a claim may have and still count as unlikely.
const UNLIKELY_AT_MOST = 45;

const sorted = (xs) => xs.slice().sort(byKey(jcs));
const linkText = ([from, type, to]) => `${from}-[:${type}]->${to}`;
const has = (labels, label) => [...labels].includes(label);

// What a join claim is about: a property, the labels, or a relationship's property.
function aboutOf(c) {
  if (c.claimed_relationship !== undefined)
    return `${c.claimed_relationship}${c.claimed_property === undefined ? '' : ' ' + c.claimed_property}`;
  if (c.claimed_property !== undefined) return c.claimed_property;
  return 'labels';
}
// What a join claim says: its value, its label, or that the relationship holds.
function sideOf(c) {
  if (c.claimed_property !== undefined) return norm(c.claimed_value === undefined ? null : c.claimed_value);
  if (c.claimed_label !== undefined) return c.claimed_label;
  return true;
}

/**
 * A claim's certainty, from its words alone: its range in percent, and a sort key. The key is the middle of the range,
 * then the confidence, so a likelier claim sorts first and a better-counted one first among equals. It is made here,
 * never stored or typed (certainty_query_dimension).
 */
function certaintyOf(claim) {
  const lo = RANGE[claim.likelihood],
    hi = RANGE[claim.likelihood_to || claim.likelihood];
  if (!lo || !hi) return null;
  const range = [lo[0], hi[1]],
    rank = Math.max(0, CONFIDENCE.indexOf(claim.confidence));
  return { range, sort_key: (range[0] + range[1]) * 2 + rank };
}

/** Whether a claim is shaky: contested, or no more than unlikely (certainty_query_dimension). */
const shaky = (claim, c = certaintyOf(claim)) =>
  claim.status === 'contested' || (c !== null && c.range[1] <= UNLIKELY_AT_MOST);

/**
 * Claims filtered and ranked by certainty, likeliest first. Options: `shaky` keeps only the shaky ones, and `atLeast`
 * keeps those whose likelihood word is at least as likely as the one named.
 */
function byCertainty(claims, options = {}) {
  const out = [];
  for (const claim of claims) {
    const c = certaintyOf(claim);
    if (c === null) continue;
    if (options.shaky && !shaky(claim, c)) continue;
    if (options.atLeast !== undefined && bandRank(claim.likelihood) < bandRank(options.atLeast)) continue;
    out.push({
      id: claim.id,
      status: claim.status || 'asserted',
      likelihood: claim.likelihood,
      likelihood_to: claim.likelihood_to || claim.likelihood,
      confidence: claim.confidence,
      range: c.range,
      sort_key: c.sort_key,
    });
  }
  return out.sort((a, b) => b.sort_key - a.sort_key || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Each conflict, with each side's value and the documents that state it (conflicts_flagged_kept).
function conflictsOf(joined) {
  const groups = new Map();
  for (const c of joined.claims.values()) {
    if (c.status !== 'contested') continue;
    const key = jcs([c._about[0][1], aboutOf(c)]);
    (groups.get(key) || groups.set(key, []).get(key)).push([sideOf(c), c._docs.slice().sort()]);
  }
  return sorted(
    [...groups].map(([key, sides]) => {
      const [subject, about] = JSON.parse(key);
      return { subject, about, sides: sorted(sides) };
    }),
  );
}

// The gaps (mesh_join_reports_gaps). A gap is a thing only some documents hold, or a property of a shared thing only
// some state. It is also a relationship only some state, although the others hold both its ends.
function gapsOf(joined, counted) {
  const all = counted.map((d) => d.id).sort(),
    out = [];
  const lacking = (holders) => all.filter((id) => !holders.includes(id));
  for (const [nid] of joined.nodes) {
    const holders = counted.filter((d) => d.nodes.has(nid));
    const ids = holders.map((d) => d.id).sort();
    if (ids.length < all.length) out.push(['thing', nid, '', ids, lacking(ids)]);
    if (holders.length < 2) continue;
    const props = new Set(holders.flatMap((d) => Object.keys(d.nodes.get(nid).props)));
    for (const k of props) {
      if (k === 'id') continue;
      const say = holders.filter((d) => k in d.nodes.get(nid).props).map((d) => d.id);
      if (say.length < holders.length)
        out.push(['property', nid, k, say.sort(), ids.filter((id) => !say.includes(id))]);
    }
  }
  for (const [ks, { key }] of joined.edges) {
    const say = counted.filter((d) => d.edges.has(ks)).map((d) => d.id);
    const silent = counted
      .filter((d) => !d.edges.has(ks) && d.nodes.has(key[0]) && d.nodes.has(key[2]))
      .map((d) => d.id);
    if (silent.length) out.push(['relationship', linkText(key), '', say.sort(), silent.sort()]);
  }
  return sorted(out);
}

// A certainty written as a number, in any counted document (certainty_in_words).
function numericCertainty(counted) {
  const out = [];
  for (const d of counted)
    for (const [nid, n] of d.nodes)
      for (const k of CERTAINTY_PROPS)
        if (typeof n.props[k] === 'number') out.push(['numeric-certainty', nid, k, d.id]);
  return sorted(out);
}

// The claims a person can rank: the join's own, and the Claim things the documents hold.
function claimsOf(joined) {
  const fromJoin = [...joined.claims.values()].map((c) => ({
    id: c.id,
    likelihood: c.likelihood,
    likelihood_to: c.likelihood_to,
    confidence: c.confidence,
    status: c.status,
  }));
  const written = [...joined.nodes]
    .filter(([, n]) => has(n.labels, 'Claim'))
    .map(([nid, n]) => ({
      id: nid,
      likelihood: n.props.likelihood,
      likelihood_to: n.props.likelihood_to,
      confidence: n.props.confidence,
      status: n.props.status,
    }));
  return fromJoin.concat(written);
}

// Each thing's standing: contested when a claim about its own labels or properties is, asserted otherwise. A dispute
// about a relationship stays on the relationship. A cluster named in `spread` passes doubt to its members.
function standingsOf(joined, members, spread) {
  const standing = new Map([...joined.nodes.keys()].map((nid) => [nid, 'asserted']));
  for (const c of joined.claims.values())
    if (c.status === 'contested' && c.claimed_relationship === undefined && standing.has(c._about[0][1]))
      standing.set(c._about[0][1], 'contested');
  for (const cluster of spread || []) {
    const ms = members.get(cluster) || [];
    if (!ms.some((m) => standing.get(m) === 'contested')) continue;
    for (const m of ms) if (standing.get(m) === 'asserted') standing.set(m, 'in-doubt');
  }
  return standing;
}

// Each link's standing, and the marker on a link from a contested thing to one that is not (contested_link_marker).
function linksOf(joined, standing) {
  const disputed = new Set();
  for (const c of joined.claims.values())
    if (c.status === 'contested' && c.claimed_relationship !== undefined)
      disputed.add(linkText([c._about[0][1], c.claimed_relationship, c._about[1][1]]));
  return sorted(
    [...joined.edges.values()].map(({ key }) => {
      const a = standing.get(key[0]) === 'contested',
        b = standing.get(key[2]) === 'contested';
      return [linkText(key), disputed.has(linkText(key)) ? 'contested' : 'asserted', a !== b];
    }),
  );
}

// The hand-made clusters: each starts asserted (hand_clusters_contestable). One becomes contested when a claim about it
// is. It does too when a document holding both it and a member leaves out the membership another states.
function clustersOf(joined, counted, standing) {
  const out = [];
  for (const [cid, n] of joined.nodes) {
    if (!has(n.labels, 'Cluster')) continue;
    const disputed = new Set();
    for (const [ks, { key }] of joined.edges)
      if (key[1] === 'MEMBER_OF' && key[2] === cid)
        if (counted.some((d) => !d.edges.has(ks) && d.nodes.has(key[0]) && d.nodes.has(cid))) disputed.add(key[0]);
    const contested = disputed.size > 0 || standing.get(cid) === 'contested';
    out.push([cid, contested ? 'contested' : 'asserted', [...disputed].sort()]);
  }
  return sorted(out);
}

// The members of each written cluster in the joined graph.
function membersOf(joined) {
  const members = new Map();
  for (const { key } of joined.edges.values())
    if (key[1] === 'MEMBER_OF') (members.get(key[2]) || members.set(key[2], []).get(key[2])).push(key[0]);
  return members;
}

// The states of the joined machines that share a name across documents. A match is a guess until every pair of its
// documents is named as one domain in `sameDomain` (state_names_start_doubtful).
function statesOf(counted, sameDomain) {
  const same = new Set((sameDomain || []).map((pair) => pair.slice().sort().join('\u0000')));
  const byName = new Map();
  for (const d of counted)
    for (const [nid, n] of d.nodes) {
      if (!has(n.labels, 'State')) continue;
      const name = String(n.props.name === undefined ? nid : n.props.name);
      const entry = byName.get(name) || byName.set(name, { ids: new Set(), docs: new Set() }).get(name);
      entry.ids.add(nid);
      entry.docs.add(d.id);
    }
  const out = [];
  for (const [name, { ids, docs }] of byName) {
    if (docs.size < 2) continue;
    const ds = [...docs].sort();
    const pairs = ds.flatMap((a, i) => ds.slice(i + 1).map((b) => a + '\u0000' + b));
    out.push([name, [...ids].sort(), ds, pairs.every((p) => same.has(p)) ? 'confirmed' : 'guess']);
  }
  return sorted(out);
}

/**
 * Graphs joined as the mesh joins them: the §21 join, then what it found. `q` is a join request as joinDocs takes it:
 * docs, config and findings. It may add `spread`, the clusters whose doubt passes to their members. It may add
 * `sameDomain`, the pairs of documents the user has said are one domain.
 */
function meshJoin(q) {
  const { joined, counted } = joinedOf(Object.assign({ base: null }, q));
  const members = membersOf(joined),
    standing = standingsOf(joined, members, q.spread),
    states = statesOf(counted, q.sameDomain);
  for (const [, ids, , match] of states)
    if (match === 'guess') for (const nid of ids) if (standing.get(nid) === 'asserted') standing.set(nid, 'guess');
  const claims = claimsOf(joined);
  return {
    conflicts: conflictsOf(joined),
    gaps: gapsOf(joined, counted),
    claims: byCertainty(claims),
    shaky: byCertainty(claims, { shaky: true }).map((c) => c.id),
    flags: numericCertainty(counted),
    standing: Object.fromEntries([...standing].sort(byKey(([k]) => k))),
    links: linksOf(joined, standing),
    clusters: clustersOf(joined, counted, standing),
    states,
    nodes: Object.fromEntries(
      [...joined.nodes]
        .sort(byKey(([k]) => k))
        .map(([k, n]) => [k, Object.fromEntries(Object.entries(n.props).map(([p, v]) => [p, norm(v)]))]),
    ),
  };
}

module.exports = { certaintyOf, byCertainty, meshJoin };
