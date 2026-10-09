// §21 joins: the few places a join's result depends on Python's printing, reproduced (pyrepr and kin).
'use strict';

const { isTime, same } = require('../values/times.js');
const { jcs } = require('../hashing/canonical-json.js');

function pystrQ(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  return (
    q +
    s
      .replace(/\\/g, '\\\\')
      .replace(new RegExp(q, 'g'), '\\' + q)
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[^ -~\u0080-￿]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')) +
    q
  );
}
function pynum(v) {
  if (Number.isInteger(v)) return String(v);
  const r = String(v),
    m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(r);
  return m ? `${m[1]}e${m[2]}${m[3].padStart(2, '0')}` : r;
}
function pyrepr(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return pynum(v);
  if (typeof v === 'string') return pystrQ(v);
  if (isTime(v)) {
    if (v.kind === 'date') return `datetime.date(${+v.s.slice(0, 4)}, ${+v.s.slice(5, 7)}, ${+v.s.slice(8, 10)})`;
    const [d, t] = v.s.split('T'),
      [hh, mm, ssf] = t.split(':'),
      [ss, us] = ssf.split('.'),
      parts = [+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10), +hh, +mm];
    if (+ss || +(us || 0)) parts.push(+ss);
    if (+(us || 0)) parts.push(+us);
    return `datetime.datetime(${parts.join(', ')})`;
  }
  if (Array.isArray(v)) return '(' + v.map(pyrepr).join(', ') + (v.length === 1 ? ',' : '') + ')';
  if (v.__list) return '[' + v.__list.map(pyrepr).join(', ') + ']';
  return (
    '{' +
    Object.entries(v)
      .map(([k, x]) => pystrQ(k) + ': ' + pyrepr(x))
      .join(', ') +
    '}'
  );
}
const pystr = (v) =>
  typeof v === 'string' ? v : isTime(v) ? (v.kind === 'date' ? v.s : v.s.replace('T', ' ')) : pyrepr(v);
const pyeq = (a, b) =>
  a === b ||
  ((typeof a === 'number' || typeof a === 'boolean') &&
    (typeof b === 'number' || typeof b === 'boolean') &&
    Number(a) === Number(b)) ||
  (isTime(a) && isTime(b) && same(a, b));
const pyround = (x) => {
  const f = Math.floor(x),
    d = x - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
};
const vtext = (v) => (isTime(v) ? v.s : typeof v === 'string' ? v : jcs(v));
const identStr = (k) =>
  k[3]
    .filter((x) => x !== null && x !== undefined)
    .map(vtext)
    .join(';');
const keystr = (k) => pyrepr(k);

module.exports = { pyrepr, pystr, pyeq, pyround, vtext, identStr, keystr };
