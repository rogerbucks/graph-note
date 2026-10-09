// §20 certainty: likelihood bands, derived ranges, calibration, reliability and corroboration.
'use strict';

const { same } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { jcs } = require('../hashing/canonical-json.js');

// §20 certainty
const LIKELIHOOD = [
    'almost-no-chance',
    'very-unlikely',
    'unlikely',
    'even-chance',
    'likely',
    'very-likely',
    'almost-certain',
  ],
  CONFIDENCE = ['low', 'moderate', 'high'];
const BANDS = [
  ['almost-no-chance', 0, 5],
  ['very-unlikely', 5, 20],
  ['unlikely', 20, 45],
  ['even-chance', 45, 55],
  ['likely', 55, 80],
  ['very-likely', 80, 95],
  ['almost-certain', 95, 100],
];
const RANGE = Object.assign(Object.fromEntries(BANDS.map(([t, lo, hi]) => [t, [lo, hi]])), {
  'almost-no-chance': [1, 5],
  'almost-certain': [95, 99],
  'cannot-judge': [0, 100],
});
const wordLo = (x) => BANDS.find(([, lo, hi]) => (lo <= x && x < hi) || (x === 100 && hi === 100))[0];
const wordHi = (x) => BANDS.find(([, lo, hi]) => (lo < x && x <= hi) || (x === 0 && lo === 0))[0];
function words([lo, hi]) {
  if (lo <= 1 && hi >= 99) return 'cannot judge';
  const a = wordLo(lo),
    b = wordHi(hi);
  return a === b ? a : `${a} to ${b}`;
}
const both = (a, b) => [Math.max(0, a[0] + b[0] - 100), Math.min(a[1], b[1])];
function wilson(k, n, z = 1.96) {
  const p = k / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.floor((c - h) * 1000) / 10, Math.ceil((c + h) * 1000) / 10];
}
function verdict([lo, hi], [blo, bhi]) {
  if (lo >= blo && hi <= bhi) return 'calibrated';
  if (hi < blo) return 'over-confident';
  if (lo > bhi) return 'under-confident';
  return 'cannot judge yet';
}
function corroborate(ranges, base = 50) {
  const post = (rs) => {
    const b = base / (100 - base);
    let o = b;
    for (const r of rs) o *= r / (100 - r) / b;
    return (100 * o) / (1 + o);
  };
  return [Math.floor(post(ranges.map((r) => r[0])) * 10) / 10, Math.ceil(post(ranges.map((r) => r[1])) * 10) / 10];
}
const span = (likelihood, lt) =>
  likelihood in RANGE && (lt || likelihood) in RANGE ? [RANGE[likelihood][0], RANGE[lt || likelihood][1]] : null;
const bandRank = (w) => LIKELIHOOD.indexOf(w);
function latestAssessment(g) {
  const best = new Map();
  for (const a of g.labelled('Assessment'))
    for (const [, , c] of g.out(a, 'ASSESSES')) {
      if (!g.has(c, 'Claim')) continue;
      const at = g.p(a).at;
      if (!best.has(c) || at > best.get(c)[0]) best.set(c, [at, g.p(a).likelihood]);
    }
  return new Map([...best].map(([c, v]) => [c, v[1]]));
}
const sourcesOf = (g, c, t) =>
  new Set(
    g
      .out(c, t)
      .filter((e) => g.has(e[2], 'Evidence'))
      .flatMap((e) => g.out(e[2], 'FROM').map((x) => x[2])),
  );
function confidenceFromEvidence(g) {
  const out = new Map();
  for (const c of g.labelled('Claim')) {
    if (g.p(c).rule !== undefined && g.p(c).rule !== null) continue;
    const s = sourcesOf(g, c, 'SUPPORTED_BY'),
      k = sourcesOf(g, c, 'CONTRADICTED_BY');
    out.set(c, s.size >= 2 && !k.size ? 'high' : s.size > k.size ? 'moderate' : 'low');
  }
  return out;
}
function claimStatus(g) {
  const out = new Map();
  for (const c of g.labelled('Claim'))
    out.set(c, g.inc(c, 'CONFIRMS').length ? 'confirmed' : g.inc(c, 'REFUTES').length ? 'refuted' : 'open');
  return out;
}
function derivedRanges(g) {
  const out = new Map();
  for (const d of g.labelled('Claim')) {
    const rs = g
      .out(d, 'WAS_DERIVED_FROM')
      .filter((e) => g.has(e[2], 'Claim'))
      .map((e) => g.p(e[2]));
    if (!rs.length || rs.some((r) => span(r.likelihood, r.likelihood_to) === null)) continue;
    let iv = span(rs[0].likelihood, rs[0].likelihood_to);
    for (const r of rs.slice(1)) iv = both(iv, span(r.likelihood, r.likelihood_to));
    const w = words(iv).split(' to ');
    out.set(d, {
      likelihood: w[0],
      likelihood_to: w[w.length - 1],
      low_pct: iv[0],
      high_pct: iv[1],
      confidence: rs.map((r) => r.confidence).sort(byKey((x) => CONFIDENCE.indexOf(x)))[0],
    });
  }
  return out;
}
function settled(g) {
  const out = new Map();
  for (const f of g.labelled('Finding'))
    for (const [, t, c] of g.out(f))
      if ((t === 'CONFIRMS' || t === 'REFUTES') && g.has(c, 'Claim'))
        out.set(c, [t === 'CONFIRMS', g.p(f).recorded_at]);
  return out;
}
function calibration(g, beforeSettlement = true) {
  const outcomes = settled(g),
    last = new Map();
  for (const a of g.labelled('Assessment'))
    for (const [, , c] of g.out(a, 'ASSESSES')) {
      if (!g.has(c, 'Claim')) continue;
      for (const [, , x] of g.out(a, 'BY')) {
        const w = g.p(a).likelihood,
          t = g.p(a).recorded_at,
          key = jcs([x, c]);
        if (!outcomes.has(c) || (beforeSettlement && t >= outcomes.get(c)[1])) continue;
        if (!last.has(key) || t > last.get(key)[2]) last.set(key, [x, c, t, w]);
      }
    }
  const tally = new Map();
  for (const [x, c, , w] of last.values()) {
    const key = jcs([x, w]),
      [n, k] = tally.get(key) || [0, 0];
    tally.set(key, [n + 1, k + (outcomes.get(c)[0] ? 1 : 0)]);
  }
  const out = new Map();
  for (const [key, [n, k]] of tally) {
    const [, w] = JSON.parse(key);
    out.set(key, { settled: n, came_true: k, range: wilson(k, n), verdict: verdict(wilson(k, n), RANGE[w]) });
  }
  return out;
}
function reliability(g) {
  const outcomes = settled(g),
    rec = new Map();
  for (const c of g.labelled('Claim'))
    if (outcomes.has(c))
      for (const s of sourcesOf(g, c, 'SUPPORTED_BY')) (rec.get(s) || rec.set(s, new Set()).get(s)).add(c);
  const out = new Map();
  for (const [s, cs] of rec) {
    const k = [...cs].filter((c) => outcomes.get(c)[0]).length;
    out.set(s, { backed: cs.size, came_true: k, range: wilson(k, cs.size) });
  }
  return out;
}
function corroboration(g, oneVote = true) {
  const reliabilities = reliability(g),
    out = new Map();
  for (const c of g.labelled('Claim')) {
    if (g.p(c).rule !== 'rule:corroborate@1') continue;
    const rows = g
      .out(c, 'SUPPORTED_BY')
      .filter((e) => g.has(e[2], 'Evidence'))
      .flatMap((e) => g.out(e[2], 'FROM').map((x) => x[2]));
    const srcs = oneVote ? [...new Set(rows)].sort() : rows;
    out.set(
      c,
      corroborate(
        srcs.map((s) => reliabilities.get(s).range),
        g.p(c).base_pct,
      ),
    );
  }
  return out;
}
function section20(g, sw) {
  const out = [],
    stored = new Map(g.labelled('Claim').map((c) => [c, g.p(c)]));
  if (!stored.size) return out;
  const bands = new Set(g.labelled('LikelihoodBand').map((b) => g.p(b).term));
  const used = new Set([
    ...[...stored.values()].map((p) => p.likelihood),
    ...[...stored.values()].filter((p) => p.likelihood_to).map((p) => p.likelihood_to),
    ...g.labelled('Assessment').map((a) => g.p(a).likelihood),
  ]);
  out.push(['§20: every likelihood is a band declared in the graph', [...used].every((u) => bands.has(u))]);
  const la = latestAssessment(g);
  out.push([
    "§20: each claim's likelihood is its latest assessment",
    [...la].every(([c, v]) => stored.get(c).likelihood === v),
  ]);
  const cf = confidenceFromEvidence(g);
  out.push([
    "§20: each claim's confidence is counted from its evidence",
    [...cf].every(
      ([c, v]) => stored.get(c).confidence === v || (stored.get(c).rule !== undefined && stored.get(c).rule !== null),
    ),
  ]);
  const st = claimStatus(g);
  out.push([
    "§20: each claim's status follows its confirmations and refutations",
    [...st].every(([c, v]) => stored.get(c).status === v),
  ]);
  const dv = derivedRanges(g);
  if (dv.size)
    out.push([
      "§20: each derived claim's range and confidence equal rule:combine@1 on its inputs",
      [...dv].every(([d, v]) =>
        Object.entries(v).every(
          ([k, x]) =>
            same(stored.get(d)[k], x) ||
            (k === 'likelihood_to' &&
              x === v.likelihood &&
              (stored.get(d)[k] === undefined || stored.get(d)[k] === null)),
        ),
      ),
    ]);
  const unassessed = [...stored].filter(([c, p]) => !la.has(c) && !p.rule);
  out.push(['§20: every claim not derived by a rule has an assessment', !unassessed.length]);
  if (g.labelled('Calibration').length) {
    const cal = calibration(g, !sw.has('before-settlement')),
      rows = new Map();
    for (const k of g.labelled('Calibration')) {
      const p = g.p(k);
      for (const [, , x] of g.out(k, 'OF'))
        rows.set(jcs([x, p.term]), [p.settled, p.came_true, [p.low_pct, p.high_pct], p.outcome]);
    }
    const keys = new Set([...rows.keys(), ...cal.keys()]);
    out.push([
      '§20: every calibration record equals rule:calibration@1 on the settled claims',
      [...keys].every(
        (k) =>
          rows.has(k) &&
          cal.has(k) &&
          same(rows.get(k), [cal.get(k).settled, cal.get(k).came_true, cal.get(k).range, cal.get(k).verdict]),
      ),
    ]);
  }
  const rel = reliability(g),
    rows = [...g.nodes.keys()].filter((s) => g.p(s).backed_settled !== undefined && g.p(s).backed_settled !== null);
  if (rows.length)
    out.push([
      "§20: every source's reliability equals rule:source-reliability@1",
      rows.every((s) => {
        const p = g.p(s),
          r = rel.get(s);
        return (
          r &&
          same(
            [p.backed_settled, p.backed_true, [p.reliability_low_pct, p.reliability_high_pct]],
            [r.backed, r.came_true, r.range],
          )
        );
      }),
    ]);
  const cor = corroboration(g, !sw.has('one-vote-per-source'));
  if (cor.size)
    out.push([
      "§20: every corroborated claim's range equals rule:corroborate@1, one vote per source",
      [...cor].every(([c, v]) => same([stored.get(c).low_pct, stored.get(c).high_pct], v)),
    ]);
  return out;
}

module.exports = { bandRank, latestAssessment, confidenceFromEvidence, claimStatus, section20 };
