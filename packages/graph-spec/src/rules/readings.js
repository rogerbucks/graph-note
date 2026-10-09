// A relationship type's declared readings, forward and reverse.
'use strict';

function readings(g, shared) {
  // §5: {type: [reading, reverse reading]}, from the graph's own schema, else the shared one it names
  let elementTypes = g.labelled('ElementType').map((i) => g.p(i));
  if (!elementTypes.length && shared) elementTypes = shared.labelled('ElementType').map((i) => shared.p(i));
  return new Map(elementTypes.filter((t) => t.kind === 'edge').map((t) => [t.name, [t.reading, t.reverse_name]]));
}

module.exports = { readings };
