// The words of the core's problems found while checking a board graph, in UK English (editor spec §42, words_catalogue,
// and §45, board_checked). They say what a board item holds wrongly, and how to fix it. GQL a person types, such as
// -[:CONNECTS]->, stays inside the sentence as written. source-words.ts keeps these with every other word.

/** The words of checking a board graph's problems, by key, in UK English. */
export const BOARD_SOURCE_WORDS = {
  // an item whose kind is not one a board holds (board.ts)
  'board.kind-unknown': 'a board holds no item of the kind {kind}, so {id} is left off the board',
  'board.kind-unknown.fix': 'change its kind to one of {kinds}',
  // an item with no place, or a place that is not whole numbers
  'board.place': '{id} needs its place as whole numbers, x and y',
  'board.place.fix': 'write x and y as whole numbers, such as {x: 10, y: 20}',
  // an item linked to a thing its graph does not hold
  'board.link-gone': '{id} is linked to {thing}, which the graph {graph} does not hold',
  'board.link-gone.fix': "link it to a thing of {graph}, or remove graph: '{thing}'",
  // a link that is not a connector
  'board.link-kind': 'a board joins its items with CONNECTS only, not {type}, so this link is left off the board',
  'board.link-kind.fix': 'write it as -[:CONNECTS]->, or remove it',
} as const;
