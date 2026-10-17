// A block's syntax alone, checked without a store: the profile, and names written before they are reused.
'use strict';

const { ProfileError } = require('./profile-error.js');
const { header, tokens } = require('./tokens.js');
const { Parser } = require('./parser.js');

// A data block's shape against the profile, without applying it: null, or the ProfileError. A name must be written
// before it is reused (§3). Query blocks and excerpts are not data and pass; any other error is thrown on.
function checkSyntax(block) {
  try {
    const [, kind] = header(block);
    if (kind === 'query' || kind === 'excerpt') return null;
    const t = tokens(block);
    if (t.length) {
      const [m, p] = new Parser(t).statement();
      bindOrder(m, p);
    }
  } catch (e) {
    if (e instanceof ProfileError) return e;
    throw e;
  }
  return null;
}
function bindOrder(matches, paths) {
  // §3: a name is reused only once its node is written — by MATCH, earlier in the block, or earlier in its path
  const writes = (n) => n.labels.length || Object.keys(n.props).length;
  const bound = new Set(matches.map((m) => m.v)),
    written = new Set(paths.flatMap(([ns]) => ns.filter(writes).map((n) => n.v)));
  for (const [nodes] of paths)
    for (const n of nodes) {
      if (writes(n)) bound.add(n.v);
      else if (!bound.has(n.v) && written.has(n.v))
        throw new ProfileError(
          n.line,
          `${n.v} is used before it is written`,
          'write the node before any relationship that uses it — GQL binds a name only once its node is written (§3)',
        );
    }
}

module.exports = { checkSyntax };
