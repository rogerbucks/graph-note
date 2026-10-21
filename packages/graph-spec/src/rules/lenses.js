// §15 lens rules in their simple shape, evaluated without an engine.
'use strict';

// §15 lens rules — the simple shape, evaluated without an engine
function lensBuckets(g, rule) {
  const m = /^\s*MATCH \((\w+):(\w+)\) RETURN \1\.id AS id, CASE ([\s\S]*) ELSE '([^']*)' END AS grp\s*$/.exec(
    rule || '',
  );
  if (!m) return null;
  const [, v, label, whens, other] = m,
    // each arm read on its own, anchored, so text with many WHENs and no THEN costs no more than its length
    arms = whens
      .split(/(?=WHEN )/)
      .map((arm) => /^WHEN (.*?) THEN '([^']*)'\s*$/.exec(arm))
      .map((a) => (a ? [a[1], a[2]] : ['', '']));
  if (arms.map(([c, b]) => `WHEN ${c} THEN '${b}'`).join(' ') !== whens.trim().replace(/\s+/g, ' ')) return null;
  const test = (cond, p) => {
    for (const part of cond.split(/\s+AND\s+/)) {
      const t = new RegExp(`^${v}\\.(\\w+)\\s*(<=|>=|<>|=|<|>)\\s*('([^']*)'|-?\\d+(?:\\.\\d+)?)$`).exec(part.trim());
      if (!t) throw new Error('needs an engine');
      const a = p[t[1]],
        b = t[4] !== undefined ? t[4] : Number(t[3]),
        op = t[2];
      if (a === undefined || a === null) return false;
      if (['<', '>', '<=', '>='].includes(op) && typeof a !== typeof b) throw new Error('needs an engine');
      if (!{ '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[op]) return false;
    }
    return true;
  };
  try {
    const out = {};
    for (const i of g.labelled(label)) {
      const hit = arms.find(([c]) => test(c, g.p(i)));
      out[i] = hit ? hit[1] : other;
    }
    return out;
  } catch {
    return null;
  }
}

module.exports = { lensBuckets };
