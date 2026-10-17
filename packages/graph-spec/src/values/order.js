// The sort orders the checks share: by a key, and plain string order.
'use strict';

// A comparator ordering by f's result with < and >, as Python's sorted(key=f) does: never localeCompare, so both
// languages sort alike.
const byKey = (f) => (a, b) => {
  const x = f(a),
    y = f(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
// The array sorted in place by plain code-unit order, with < and >, and returned.
const strSort = (a) => a.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

module.exports = { byKey, strSort };
