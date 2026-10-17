// A relationship type's declared readings, forward and reverse.
'use strict';

// Each declared edge type's words (§5) as a Map {type: [reading, reverse reading]}; the shared schema is read only
// when the graph declares no ElementType of its own, so a graph's schema replaces the shared one, never mixes with it
function readings(g, shared) {
  // §5: {type: [reading, reverse reading]}, from the graph's own schema, else the shared one it names
  let elementTypes = g.labelled('ElementType').map((i) => g.p(i));
  if (!elementTypes.length && shared) elementTypes = shared.labelled('ElementType').map((i) => shared.p(i));
  return new Map(elementTypes.filter((t) => t.kind === 'edge').map((t) => [t.name, [t.reading, t.reverse_name]]));
}

module.exports = { readings };
