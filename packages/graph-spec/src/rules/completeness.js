// §25 completeness, the twin of completeness() in graph_rules.py; the conformance suite requires the identical report.
'use strict';

const { isTime } = require('../values/times.js');
const { strSort } = require('../values/order.js');

// ── §25 completeness — the twin of completeness() in graph_rules.py; the conformance suite requires the identical report ──
const CARD_NEEDS = ['kind', 'relationship', 'direction'],
  COV_NEEDS = ['rows', 'columns', 'of', 'row_link', 'column_link', 'excused_by'];
const unset = (v) => v === undefined || v === null || v === '';
const dayOf = (v) => (v ? String(isTime(v) ? v.s : v).slice(0, 10) : '');
const parkedState = (g, ds, today) =>
  ds.every((d) => {
    const by = dayOf(g.p(d).revisit_by);
    return by && by < today;
  })
    ? 'overdue'
    : 'deferred';
// {rules: one entry per Cardinality and Coverage, by id; deferred_malformed: Deferreds that do not say what and why}.
// A gap parked by a Deferred is deferred. It is overdue once every Deferred parking it is past revisit_by. `today`
// (YYYY-MM-DD) is a parameter so the report is reproducible. The conformance suite requires Python's identical report.
function completeness(g, today) {
  today = today || new Date().toISOString().slice(0, 10);
  const rules = [];
  for (const r of strSort(g.labelled('Cardinality'))) {
    const p = g.p(r);
    let lack = CARD_NEEDS.filter((k) => unset(p[k])).concat(unset(p.min) && unset(p.max) ? ['min or max'] : []);
    if (!lack.length && !['out', 'in'].includes(p.direction)) lack = ["direction 'out' or 'in'"];
    const e = {
      rule: r,
      kind: 'cardinality',
      says: p.says || '',
      counted: 0,
      met: 0,
      excused: 0,
      missing: [],
      deferred: [],
      overdue: [],
      malformed: lack.length ? 'a Cardinality must carry ' + lack.join(', ') : '',
    };
    if (!lack.length) {
      const alts = String(p.relationship)
          .split('|')
          .map((t) => t.trim()),
        mn = p.min,
        mx = p.max,
        way = p.direction,
        parked = new Map();
      for (const d of g.labelled('Deferred'))
        if (g.p(d).rule === r)
          for (const x of g.out(d, 'DEFERS')) (parked.get(x[2]) || parked.set(x[2], []).get(x[2])).push(d);
      for (const i of strSort(g.labelled(p.kind))) {
        const n = alts.reduce((a, t) => a + (way === 'out' ? g.out(i, t) : g.inc(i, t)).length, 0);
        e.counted++;
        const low = !unset(mn) && n < mn,
          high = !unset(mx) && n > mx;
        if (!low && !high) {
          e.met++;
          continue;
        }
        if (parked.has(i)) {
          e[parkedState(g, parked.get(i), today)].push(i);
          continue;
        }
        const fix = low
          ? `add a ${p.relationship} link (${way}): it has ${n}, needs at least ${mn}; or park it with a Deferred whose rule is ${r}`
          : `remove ${n - mx} of its ${p.relationship} links (${way}): it has ${n}, allows at most ${mx}`;
        e.missing.push({ at: i, found: n, fix });
      }
    }
    rules.push(e);
  }
  for (const r of strSort(g.labelled('Coverage'))) {
    const p = g.p(r),
      lack = COV_NEEDS.filter((k) => unset(p[k]));
    const e = {
      rule: r,
      kind: 'coverage',
      says: p.says || '',
      counted: 0,
      met: 0,
      excused: 0,
      missing: [],
      deferred: [],
      overdue: [],
      malformed: lack.length ? 'a Coverage must carry ' + lack.join(', ') : '',
    };
    if (!lack.length) {
      const key = (a, b) => a + '\u0000' + b;
      const pairs = (x) => g.out(x, p.row_link).flatMap((a) => g.out(x, p.column_link).map((b) => key(a[2], b[2])));
      const covered = new Set(g.labelled(p.of).flatMap(pairs)),
        parked = new Map();
      for (const d of g.labelled('Deferred'))
        for (const k of pairs(d)) (parked.get(k) || parked.set(k, []).get(k)).push(d);
      for (const a of strSort(g.labelled(p.rows)))
        for (const b of strSort(g.labelled(p.columns))) {
          e.counted++;
          const at = `${a} × ${b}`,
            k = key(a, b);
          if (covered.has(k)) {
            e.met++;
            continue;
          }
          const ex = g.out(a, p.excused_by).filter((x) => x[2] === b);
          if (ex.some((x) => String(x[3].reason || '').trim())) {
            e.excused++;
            continue;
          }
          if (parked.has(k)) {
            e[parkedState(g, parked.get(k), today)].push(at);
            continue;
          }
          const fix = ex.length
            ? `give the ${p.excused_by} from ${a} to ${b} a reason`
            : `add a ${p.of} that is ${p.row_link} ${a} and ${p.column_link} ${b}; or excuse the pairing with ${p.excused_by} and a reason; or park it with a Deferred`;
          e.missing.push({ at, found: 0, fix });
        }
    }
    rules.push(e);
  }
  rules.sort((x, y) => (x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : 0));
  for (const x of rules) {
    strSort(x.deferred);
    strSort(x.overdue);
    x.missing.sort((m, n) => (m.at < n.at ? -1 : m.at > n.at ? 1 : 0));
  }
  const bad = [];
  for (const d of strSort(g.labelled('Deferred'))) {
    const lack = ['what', 'why'].filter((k) => !String(g.p(d)[k] || '').trim());
    if (lack.length) bad.push({ at: d, fix: 'say ' + lack.join(' and ') });
  }
  return { rules, deferred_malformed: bad };
}

module.exports = { completeness };
