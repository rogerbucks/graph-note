// The sort orders the checks share: by a key, and plain string order.
'use strict';

const byKey = (f) => (a, b) => {
  const x = f(a),
    y = f(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
const strSort = (a) => a.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

module.exports = { byKey, strSort };
