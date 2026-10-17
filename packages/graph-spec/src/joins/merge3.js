// §21 joins: the three-way merge of two documents over their base.
'use strict';

const { byKey } = require('../values/order.js');
const { pystr, pyeq, vtext, identStr, keystr } = require('./python-text.js');
const { newJ, addClaim, sortedPair } = require('./claims.js');

// ── §21 joins (graph_spec.py: normalise, validate, union, merge3, finish) ──────────────────────────
// Python's printing decides two things a join's result depends on — the order it walks relationships in, and the text of a
// nondeterminism warning — so those few places reproduce it (pyrepr). Identifiers use vtext, which is the same everywhere.
const ABSENT = { absent: true };
// Two revisions of one earlier version: a change made on one side only is kept — including a removal; changes on
// both sides that differ are contested. With hold, a thing or relationship one side removes while the other changes
// it is held back, its removal contested with the change, rather than removed.
function merge3(base, a, b, config, hold = true) {
  const joined = newJ();
  const slots = (d) => {
    // slot repr -> [slot, value]
    const s = new Map(),
      put = (sl, v) => s.set(keystr(sl), [sl, v]);
    for (const [nid, n] of d.nodes) {
      put(['node', nid], true);
      for (const label of n.labels) put(['label', nid, label], true);
      for (const [k, v] of Object.entries(n.props)) if (k !== 'id') put(['prop', nid, k], v);
    }
    for (const { key: k, props: p } of d.edges.values()) {
      put(['edge', k], true);
      for (const [x, v] of Object.entries(p)) put(['eprop', k, x], v);
    }
    return s;
  };
  const baseSlots = slots(base),
    aSlots = slots(a),
    bSlots = slots(b),
    res = new Map(),
    from = new Map(),
    changedPresence = new Set();
  const get = (slotMap, ks) => (slotMap.has(ks) ? slotMap.get(ks)[1] : ABSENT),
    eqv = (x, y) => (x === ABSENT || y === ABSENT ? x === y : pyeq(x, y));
  const belongs = (s, n) =>
    (['node', 'label', 'prop'].includes(s[0]) && s[1] === n) ||
    (['edge', 'eprop'].includes(s[0]) && (s[1][0] === n || s[1][2] === n));
  const slotOf = (ks) => (baseSlots.get(ks) || aSlots.get(ks) || bSlots.get(ks))[0];
  const heldBack = new Map(),
    heldEdges = new Map();
  for (const n of [...baseSlots.values()]
    .filter(([s]) => s[0] === 'node')
    .map(([s]) => s[1])
    .sort()) {
    for (const [[dl, dlSlots], [kp, kpSlots]] of [
      [
        [a, aSlots],
        [b, bSlots],
      ],
      [
        [b, bSlots],
        [a, aSlots],
      ],
    ]) {
      if (
        hold &&
        !dlSlots.has(keystr(['node', n])) &&
        kpSlots.has(keystr(['node', n])) &&
        [...new Set([...baseSlots.keys(), ...kpSlots.keys()])].some((ks) => {
          const s = slotOf(ks);
          return belongs(s, n) && s[0] !== 'node' && !eqv(get(kpSlots, ks), get(baseSlots, ks));
        })
      )
        heldBack.set(n, [dl, kp, kpSlots]);
    }
  }
  if (hold)
    for (const k of [...baseSlots.values()]
      .filter(([s]) => s[0] === 'edge')
      .map(([s]) => s[1])
      .sort(byKey(keystr))) {
      if (heldBack.has(k[0]) || heldBack.has(k[2])) continue;
      for (const [[dl, dlSlots], [kp, kpSlots]] of [
        [
          [a, aSlots],
          [b, bSlots],
        ],
        [
          [b, bSlots],
          [a, aSlots],
        ],
      ]) {
        const ek = keystr(['edge', k]);
        if (
          !dlSlots.has(ek) &&
          kpSlots.has(ek) &&
          [...new Set([...baseSlots.keys(), ...kpSlots.keys()])].some((ks) => {
            const s = slotOf(ks);
            return s[0] === 'eprop' && keystr(s[1]) === keystr(k) && !eqv(get(kpSlots, ks), get(baseSlots, ks));
          })
        )
          heldEdges.set(keystr(k), [dl, kp, kpSlots, k]);
      }
    }
  const all = new Map([...baseSlots, ...aSlots, ...bSlots]),
    rows = [];
  for (const [ks, [s]] of [...all].sort(byKey(([k]) => k))) {
    const o = get(baseSlots, ks);
    let x = get(aSlots, ks),
      y = get(bSlots, ks);
    const hb = [...heldBack.keys()].filter((n) => belongs(s, n)),
      he = [...heldEdges.keys()].filter((k) => ['edge', 'eprop'].includes(s[0]) && keystr(s[1]) === k);
    if (he.length && !hb.length) {
      const [dl, kp, kpSlots, k] = heldEdges.get(he[0]),
        yv = get(kpSlots, ks);
      if (s[0] === 'edge') {
        res.set(ks, [s, true]);
        from.set(ks, [kp.id]);
        const about = [
          ['subject', k[0]],
          ['object', k[2]],
        ];
        joined.pairs.push(
          sortedPair(
            addClaim(joined, k[0], `${k[1]}-${pystr(k[2])}/${identStr(k)}/exists=removed`, [dl.id], about, {
              claimed_relationship: k[1],
              edge_ident: identStr(k),
              _key: k,
              claimed_absent: true,
            }),
            addClaim(joined, k[0], `${k[1]}-${pystr(k[2])}/${identStr(k)}/exists=kept`, [kp.id], about, {
              claimed_relationship: k[1],
              edge_ident: identStr(k),
              _key: k,
              kept: true,
            }),
          ),
        );
        joined.report.push([
          'delete-v-change',
          k[0],
          'edge',
          '',
          'REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, not applied',
          'find evidence; a finding confirms one',
        ]);
        continue;
      }
      if (eqv(yv, o)) {
        if (yv !== ABSENT) {
          res.set(ks, [s, yv]);
          from.set(ks, [kp.id]);
        }
        continue;
      }
      if (dl === a) {
        x = ABSENT;
        y = yv;
      } else {
        x = yv;
        y = ABSENT;
      }
    }
    if (hb.length) {
      const [dl, kp, kpSlots] = heldBack.get(hb[0]),
        yv = get(kpSlots, ks);
      if (s[0] === 'node' && s[1] === hb[0]) {
        res.set(ks, [s, true]);
        from.set(ks, [kp.id]);
        joined.pairs.push(
          sortedPair(
            addClaim(joined, s[1], 'exists=removed', [dl.id], [['subject', s[1]]], {
              claimed_node: s[1],
              claimed_absent: true,
            }),
            addClaim(joined, s[1], 'exists=kept', [kp.id], [['subject', s[1]]], { claimed_node: s[1], kept: true }),
          ),
        );
        joined.report.push([
          'delete-v-change',
          s[1],
          'node',
          '',
          'REMOVED IN ONE, CHANGED IN THE OTHER — the removal is contested, not applied',
          'find evidence; a finding confirms one',
        ]);
        continue;
      }
      if (eqv(yv, o)) {
        if (yv !== ABSENT) {
          res.set(ks, [s, yv]);
          from.set(ks, [kp.id]);
        }
        continue;
      }
      if (dl === a) {
        x = ABSENT;
        y = yv;
      } else {
        x = yv;
        y = ABSENT;
      }
    }
    let r, src, cat;
    if (eqv(x, y)) {
      r = x;
      src = [a.id, b.id];
      cat = !eqv(x, o) ? 'both-same' : null;
    } else if (hb.length || he.length) {
      r = ABSENT;
      src = [];
      cat = 'remove-v-change';
    } else if (eqv(x, o)) {
      r = y;
      src = [b.id];
      cat = 'one-side-' + (o === ABSENT ? 'addition' : y === ABSENT ? 'removal' : 'change');
    } else if (eqv(y, o)) {
      r = x;
      src = [a.id];
      cat = 'one-side-' + (o === ABSENT ? 'addition' : x === ABSENT ? 'removal' : 'change');
    } else {
      r = ABSENT;
      src = [];
      cat = x === ABSENT || y === ABSENT ? 'remove-v-change' : 'both-differ';
    }
    if (cat && ['node', 'edge'].includes(s[0])) changedPresence.add(keystr(s[1]));
    if (cat === 'both-differ' || cat === 'remove-v-change') {
      const subj = s[0] === 'prop' ? s[1] : s[1][0],
        about =
          s[0] === 'prop'
            ? [['subject', subj]]
            : [
                ['subject', s[1][0]],
                ['object', s[1][2]],
              ],
        ids = [];
      for (const [d, v] of [
        [a.id, x],
        [b.id, y],
      ]) {
        const extra = v === ABSENT ? { claimed_absent: true } : { claimed_value: v },
          vt = v === ABSENT ? 'removed' : vtext(v);
        if (s[0] === 'prop')
          ids.push(
            addClaim(joined, subj, `${s[2]}=${vt}`, [d], about, Object.assign({ claimed_property: s[2] }, extra)),
          );
        else
          ids.push(
            addClaim(
              joined,
              subj,
              `${s[1][1]}-${pystr(s[1][2])}/${identStr(s[1])}/${s[2]}=${vt}`,
              [d],
              about,
              Object.assign(
                { claimed_relationship: s[1][1], claimed_property: s[2], edge_ident: identStr(s[1]), _key: s[1] },
                extra,
              ),
            ),
          );
      }
      joined.pairs.push(sortedPair(ids[0], ids[1]));
    }
    if (r !== ABSENT) {
      res.set(ks, [s, r]);
      from.set(ks, src);
    }
    if (cat)
      rows.push([
        cat,
        ['node', 'prop', 'label'].includes(s[0]) ? s[1] : s[1][0],
        ['node', 'edge'].includes(s[0]) ? s[0] : ['prop', 'label'].includes(s[0]) ? s[2] : `${s[1][1]} ${s[2]}`,
        '',
        {
          'both-same': 'agreed — both made the same change',
          'one-side-addition': 'added in one revision only — kept',
          'one-side-removal': 'removed in one revision only — removed',
          'one-side-change': 'changed in one revision only — the change is kept',
          'both-differ': 'BOTH CHANGED, DIFFERENTLY — contested',
          'remove-v-change': 'REMOVED IN ONE, CHANGED IN THE OTHER — contested',
        }[cat],
        ['both-differ', 'remove-v-change'].includes(cat) ? 'find evidence; a finding confirms one' : '—',
        s,
      ]);
  }
  joined.report = joined.report.concat(
    rows
      .filter(
        (r) =>
          !(
            ['label', 'prop', 'eprop'].includes(r[6][0]) &&
            changedPresence.has(keystr(r[6][1])) &&
            ['one-side-addition', 'one-side-removal', 'both-same'].includes(r[0])
          ),
      )
      .map((r) => r.slice(0, 6)),
  );
  for (const [ks, [s]] of res)
    if (s[0] === 'node')
      joined.nodes.set(s[1], {
        labels: new Set(),
        props: { id: s[1] },
        stated_in: [...new Set([...from.get(ks), ...[a, b].filter((d) => d.nodes.has(s[1])).map((d) => d.id)])].sort(),
      });
  for (const [ks, [s, v]] of res) {
    if (s[0] === 'label' && joined.nodes.has(s[1])) joined.nodes.get(s[1]).labels.add(s[2]);
    if (s[0] === 'prop' && joined.nodes.has(s[1])) {
      joined.nodes.get(s[1]).props[s[2]] = v;
      joined.src.set(s[1] + '\u0000' + s[2], from.get(ks));
    }
    if (s[0] === 'edge') {
      joined.edges.set(keystr(s[1]), { key: s[1], props: {} });
      joined.esrc.set(
        keystr(s[1]),
        [a, b]
          .filter((d) => d.edges.has(keystr(s[1])))
          .map((d) => d.id)
          .sort(),
      );
    }
  }
  for (const [, [s, v]] of res)
    if (s[0] === 'eprop' && joined.edges.has(keystr(s[1]))) joined.edges.get(keystr(s[1])).props[s[2]] = v;
  return joined;
}

module.exports = { merge3 };
