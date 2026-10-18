// Dates and instants as the document profile reads them, and how two read values compare.
'use strict';

// A date or an instant, as the profile allows: DATE '…' kept as its day; DATETIME '…' kept as its UTC time.
class GTime {
  constructor(kind, s) {
    this.kind = kind;
    this.s = s;
  }
  valueOf() {
    return this.s;
  }
  toString() {
    return this.s;
  }
  toJSON() {
    return this.s;
  }
}
// Whether a value is a date or an instant the profile read.
const isTime = (v) => v instanceof GTime;
// A value as hashed (rule:basis-hash@1): a date or an instant as its text, anything else unchanged.
const norm = (v) => (isTime(v) ? v.s : v); // as hashed (rule:basis-hash@1)
// A value as the canonical graph holds it: an instant as its UTC time with +00:00, a date as its day, anything else
// unchanged.
const cnorm = (v) => (isTime(v) ? (v.kind === 'datetime' ? v.s + '+00:00' : v.s) : v); // as in the canonical graph
// Whether two read values are the same. A date and an instant never are, even on the same text. Lists are
// compared item by item.
function same(a, b) {
  if (isTime(a) || isTime(b)) return isTime(a) && isTime(b) && a.kind === b.kind && a.s === b.s;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  return a === b;
}

module.exports = { GTime, isTime, norm, cnorm, same };
