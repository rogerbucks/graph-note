// A guard read in the guard language and never run as code (editor spec §51, spec_guard_language).
'use strict';

const { pyeq } = require('../joins/python-text.js');

// The language is requirements/guard-language.md: names from the context, numbers, quoted text, True and False,
// brackets, the comparisons, and and, or and not. SCXML's && || ! === and !== are read as those. It follows
// python/graph_spec/src/graphspec/engine/guards.py, and guard-cases.json holds both to the same answers.
const TOKEN = /\s*(?:(===|!==|==|!=|>=|<=|&&|\|\||[=<>()!])|([A-Za-z_]\w*)|(-?\d+(?:\.\d+)?)|'([^'\\]*)'|"([^"\\]*)")/y;
const SAME = { '===': '==', '!==': '!=', '&&': 'and', '||': 'or', '!': 'not', '=': '==' };
const COMPARE = {
  '==': (a, b) => pyeq(a, b),
  '!=': (a, b) => !pyeq(a, b),
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
};
const WORDS = new Set(['and', 'or', 'not']);
// A guard's most characters, and how deep its brackets and `not` may go.
const GUARD_LIMITS = Object.freeze({ chars: 1000, nesting: 64 });

const refusal = (guard, why) =>
  new Error(`refused: the guard ${JSON.stringify(guard)} ${why}; a guard holds comparisons only (§13)`);
// Python's truth of a value: false, zero, nothing and empty text are false.
const truthy = (v) => !(v === false || v === 0 || v === null || v === undefined || v === '');

// The guard's tokens, each [kind, value]; anything the language has no token for is refused.
function tokens(guard) {
  const out = [];
  let pos = 0;
  while (pos < guard.length && guard.slice(pos).trim()) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(guard);
    if (!m || TOKEN.lastIndex === pos)
      throw refusal(guard, `holds ${JSON.stringify(guard.slice(pos).trim().slice(0, 20))}`);
    const [, op, name, number, single, double] = m;
    if (op !== undefined) out.push(['op', SAME[op] ?? op]);
    else if (name !== undefined) out.push(WORDS.has(name) ? ['op', name] : ['name', name]);
    else if (number !== undefined) out.push(['text', Number(number)]);
    else out.push(['text', single ?? double]);
    pos = TOKEN.lastIndex;
  }
  return out;
}

// Whether a guard holds in a context. A name the context does not hold as its own is unknown: it throws "not defined".
// anything outside the language, or past its limits, throws "refused".
function guardHolds(guard, ctx) {
  if (guard.length > GUARD_LIMITS.chars)
    throw refusal(guard.slice(0, 20) + '…', `is longer than ${GUARD_LIMITS.chars} characters`);
  const toks = tokens(guard);
  toks.forEach(([kind, v], k) => {
    const after = toks[k + 1];
    if (after && after[0] === 'op' && after[1] === '(' && (kind !== 'op' || v === ')'))
      throw refusal(guard, `calls ${JSON.stringify(v)}`);
  });
  let i = 0,
    depth = 0;
  const is = (t, kind, v) => t !== undefined && t[0] === kind && t[1] === v;
  const take = () => {
    if (i >= toks.length) throw refusal(guard, 'ends too soon');
    return toks[i++];
  };
  // a bracket or `not` read inside, refused past the nesting limit
  const deeper = (within) => {
    if (++depth > GUARD_LIMITS.nesting)
      throw refusal(guard.slice(0, 20) + '…', `goes more than ${GUARD_LIMITS.nesting} deep`);
    try {
      return within();
    } finally {
      depth--;
    }
  };
  const bracketed = () => {
    const out = either();
    if (!is(take(), 'op', ')')) throw refusal(guard, 'has a bracket left open');
    return out;
  };
  const atom = () => {
    const [kind, v] = take();
    if (kind === 'op' && v === '(') return deeper(bracketed);
    if (kind === 'op' && v === 'not') return deeper(() => !truthy(compare()));
    if (kind === 'text') return v;
    if (kind === 'name') {
      if (v === 'True' || v === 'true') return true;
      if (v === 'False' || v === 'false') return false;
      // only the context's own values: nothing JavaScript gives every object, such as constructor
      if (!Object.prototype.hasOwnProperty.call(ctx, v)) throw new Error(`name '${v}' is not defined`);
      return ctx[v];
    }
    throw refusal(guard, `has ${JSON.stringify(v)} where a value goes`);
  };
  const compare = () => {
    let a = atom();
    while (toks[i] && toks[i][0] === 'op' && toks[i][1] in COMPARE) {
      const op = take()[1];
      a = COMPARE[op](a, atom());
    }
    return a;
  };
  const both = () => {
    let a = compare();
    while (is(toks[i], 'op', 'and')) {
      take();
      const b = compare();
      a = truthy(a) ? b : a;
    }
    return a;
  };
  const either = () => {
    let a = both();
    while (is(toks[i], 'op', 'or')) {
      take();
      const b = both();
      a = truthy(a) ? a : b;
    }
    return a;
  };
  const out = either();
  if (i !== toks.length) throw refusal(guard, `has ${JSON.stringify(toks[i][1])} after its end`);
  return truthy(out);
}

module.exports = { GUARD_LIMITS, guardHolds };
