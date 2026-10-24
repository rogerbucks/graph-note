// A graph of kinds for the massive-graph tests (editor spec §53): the same things every time.
/** A graph of `groups` kinds, each with `each` things. */
export const drawingOf = (groups, each) => ({
  graph: 'big',
  boxes: Array.from({ length: groups * each }, (_, i) => ({
    key: `t${i}`,
    kind: `K${i % groups}`,
    text: `Thing ${i}`,
  })),
  links: [],
  estimates: [],
});
