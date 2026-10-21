// The words of the core's problems found while reading a note, in UK English (editor spec §42, words_catalogue). They
// say what could not be read, what was read as meant, and how to fix it. They also say why a graph source, an image or
// a conversion to standard GQL is refused. GQL a person types stays inside the sentence as written. source-words.ts
// keeps these with every other word.

/** The words of reading a note's problems, by key, in UK English. */
export const READING_SOURCE_WORDS = {
  // reading a block as far as it can be read (partial-read.ts)
  'reading.comment-own-line.fix-title': 'Put the comment on its own line',
  'reading.comma-trailing': 'a comma with nothing after it; it is read as if it were not there',
  'reading.comma-trailing.fix': 'remove the comma, or write the next pattern after it',
  'reading.comma-trailing.fix-title': 'Remove the comma',
  'reading.comma-missing': 'a comma is missing at the end of this line; it is read as if it were there',
  'reading.comma-missing.fix': 'add a comma at the end of the line',
  'reading.bare-type': '[{written}] has no colon; it is read as the relationship type {type}',
  'reading.bare-type.fix': 'write it with its colon: [:{type}]',
  'reading.bare-type.fix-title': 'Write the colon: [:{type}]',
  'reading.unreadable': 'this could not be read',
  'reading.unreadable.fix': 'check the line against the guide to writing a graph note',
  'reading.escape.fix-title': 'Double the backslash',
  'reading.comma-missing-before': '{message} — a comma is missing at the end of the line before',
  'reading.comma-missing-before.fix': 'add a comma at the end of the line before, after {line}',
  'reading.too-much-unread':
    '{message} — too much of this block could not be read, so it is left out from this line on',
  // a near miss drawn as a guess (estimates.ts)
  'reading.estimate.taken-case': '{name}, which differs only in case or underscores',
  'reading.estimate.taken-one': '{name}, one letter away',
  'reading.estimate.taken-two': '{name}, two letters away',
  'reading.estimate.explain-name':
    'Line {line} links to {written}, which is not in graph {graph}. It was taken to mean {taken}. To fix it, change {changes}.',
  'reading.estimate.explain-names':
    'Line {line} links to {written}, which are not in graph {graph}. They were taken to mean {taken}. To fix it, change {changes}.',
  'reading.estimate.explain-type':
    'Line {line} uses the relationship {written}, which is not in graph {graph}. It was taken to mean {taken}. To fix it, change {changes}.',
  'reading.estimate.change-to': 'change {written} to {taken}',
  'reading.estimate.change': 'change {changes}',
  'reading.estimate.change.fix-title': 'Change {changes}',
  'reading.estimate.equally-close':
    'no thing called {name} in graph {graph}; {among} are equally close, so it is not drawn',
  'reading.estimate.equally-close.fix': 'change {name} to the one you mean: {among}',
  'reading.estimate.pair': '{written} to {taken}',
  'reading.estimate.taken-and': '{first}, and {next}',
  'reading.estimate.name': '{name} is not in graph {graph}; it is drawn as an estimate of {taken}',
  'reading.estimate.type': '{type} is not a relationship in graph {graph}; it is drawn as an estimate of {taken}',
  // the help that finds and fixes problems (help.ts)
  'reading.comma-missing.fix-title': 'Add the missing comma',
  'reading.change.fix-title': 'Change {written} to {with}',
  'reading.near-kind-one': 'The kind {kind} is one letter from {near}, already in the graph.',
  'reading.near-kind-two': 'The kind {kind} is two letters from {near}, already in the graph.',
  'reading.near-kind.fix': 'Change {kind} to {near}, or keep {kind} if it is a new kind.',
  'reading.not-in-graph': '{name} (not in the graph)',
  'reading.estimated-link': 'Estimated, not written: {from} {reading} {to}.',
  // each pattern read back in plain language, and the graph as sentences for screen readers (help.ts)
  'reading.back.set': '{thing}: {property} is {value}',
  'reading.back.kind-a': '{thing} is a {kind}',
  'reading.back.kind-an': '{thing} is an {kind}',
  'reading.text.graph': 'Graph {graph}: {things}, {links}.',
  'reading.text.things': { one: '{count} thing', other: '{count} things' },
  'reading.text.links': { one: '{count} link', other: '{count} links' },
  // a thing written without a name or without text (name-gaps.ts)
  'reading.no-name': 'this thing has no name; suggested: {name}',
  'reading.no-name.fix': 'add the name {name} after the (, or write one of your own',
  'reading.no-name.fix-title': 'Add the name {name}',
  'reading.no-text': 'the thing {name} has no text; suggested: {text}',
  'reading.no-text.fix': 'add {{property}} to it, or write other text',
  'reading.no-text.fix-title': 'Add the text {text}',
  // a note that is shown on nothing (notes.ts)
  'reading.note.shared': 'this note is above a line holding more than one thing, so it belongs to none of them',
  'reading.note.shared.fix': 'put the thing the note is about on a line of its own, directly below the note',
  'reading.note.lost': 'this note is not shown, as what it is on could not be read',
  'reading.note.lost.fix': 'fix the problem in this block, and the note is shown again',
  'reading.note.duplicate':
    'this note is on {key}, which already has a note where it is first written, so this one is not shown',
  'reading.note.duplicate.fix': 'join the two notes into one, above {key} where it is first written',
  // a link to a note or file that is not in the vault (links.ts)
  'reading.broken': '{written} names no note or file in the vault, so it is drawn as broken.',
  'reading.broken.create': 'Create the note {target}.',
  'reading.broken.create-or-change': 'Create the note {target}, or change it to {among}.',
  'reading.broken.put-or-correct': 'Put {target} in the vault, or correct the link.',
  'reading.broken.put-or-change': 'Put {target} in the vault, or change it to {among}.',
  // a block's graph line (blocks.ts)
  'reading.style-no-graph': 'this style block names no graph to style, so it is not read',
  'reading.style-no-graph.fix': "write the graph it styles after STYLE: '// graph: {graph} · STYLE <graph>'",
  'reading.graph-line': 'the graph line cannot be read',
  'reading.graph-line.fix': "start the block with '// graph: <name>'",
  // a schema that does not declare its types (schema-checks.ts)
  'reading.schema.undeclared': 'the schema does not declare {names}: its GraphMeta must DECLARE each type',
  'reading.schema.no-meta': 'the schema has no GraphMeta to declare {names}: each type must be declared',
  'reading.schema.undeclared.fix': 'add a DECLARES link from {meta} to each',
  'reading.schema.no-meta.fix': 'link each type from the GraphMeta by DECLARES',
  'reading.schema.undeclared.fix-title': 'Declare each type',
  'reading.schema.kind-undeclared':
    '{name} is not a kind the schema of graph {graph} declares: declare it there, or use one it does',
  'reading.schema.type-undeclared':
    '{name} is not a relationship type the schema of graph {graph} declares: declare it there, or use one it does',
  'reading.schema.use-undeclared.fix': "declare {name} in graph {graph}'s schema",
  // a shared schema that is named but not found (schema-names.ts)
  'reading.schema.missing':
    'the schema {name} is not in the vault or the standard schemas, so the types of {graph} are not checked',
  'reading.schema.missing.version': 'name a version there is: {versions}',
  'reading.schema.missing.fix':
    'write a block whose graph line says SCHEMA {name}, or take "· schema {name}" out of the graph line',
  // a graph drawn from a .gql file or another note (sources.ts)
  'reading.source.name-not-word': "the graph name '{graph}' is not one word: use letters, digits and underscores only",
  'reading.source.no-place': 'say where the graph is written after FROM: a .gql file, or a note as [[Note]]',
  'reading.source.outside':
    '{target} is not a place inside the vault: write its path from the vault’s root, with no leading slash, drive, .. or folder starting with a dot',
  'reading.source.neither':
    'a graph is drawn from a .gql file or a note, and {target} is neither: write FROM path/to/file.gql or FROM [[Note]]',
  'reading.source.holds-lines':
    'a block drawn from {target} holds nothing of its own, so its data is never copied here: move these lines into {target}, or take out · FROM',
  'reading.source.file': 'The file {target}',
  'reading.source.note': 'The note {target}',
  'reading.source.missing-file':
    '{name} is not in the vault, so graph {graph} cannot be drawn from it: check the place written after FROM, or put the file back.',
  'reading.source.missing-note':
    '{name} is not in the vault, so graph {graph} cannot be drawn from it: check the place written after FROM, or put the note back.',
  'reading.source.file-elsewhere': 'a file of that name is at {places}',
  'reading.source.files-elsewhere': 'files of that name are at {places}',
  'reading.source.note-elsewhere': 'a note of that name is at {places}',
  'reading.source.notes-elsewhere': 'notes of that name are at {places}',
  'reading.source.moved': '{name} is not there any more: {there}. If it was moved, write FROM {place} in this block.',
  'reading.source.unreadable': '{name} could not be read ({why}), so graph {graph} cannot be drawn from it.',
  'reading.source.no-graph-line':
    '{name} does not start with a graph line: write // graph: {graph} as its first line, so graph {graph} cannot be drawn from it until then.',
  'reading.source.drawn-elsewhere':
    '{name} draws graph {graph} from {target} itself, so it holds none to draw: write FROM {target} here.',
  'reading.source.other-graphs':
    "{name} holds no graph called {graph}: it holds {held}. Write the graph's own name after // graph:, or point FROM at the place that holds {graph}.",
  'reading.source.no-graph': '{name} holds no graph at all, so graph {graph} cannot be drawn from it.',
  // how strictly a note is read, and making it standard GQL (strictness.ts)
  'reading.not-standard': '{message} — this is not standard GQL',
  'reading.standard.unreadable':
    'block {block}, line {line}, cannot be read, so the note cannot be made standard: {message}',
  'reading.standard.no-fix': 'block {block} has a departure with no fix to write',
  'reading.standard.still-departs': 'the converted block {block} would not be standard: {message}',
  'reading.standard.other-graph': 'the converted note would not read as the same graph',
  'reading.standard.unwritten': 'block {block} could not be written: {why}',
  'reading.standard.other-blocks': 'the converted note would not hold the blocks that were checked',
  // an edit that waits for a suggested name to be written (suggested-names.ts)
  'reading.accept-name-first':
    'accept its name first: {text} is only drawn under the suggested name {name}, which is not written yet',
  'reading.accept-names-first':
    'accept their names first: {texts} and {last} are only drawn under suggested names, which are not written yet',
  // a thing's image that is not loaded (image-links.ts)
  'reading.image.outside': '{written} is outside the vault, and an image from outside the vault is not loaded',
  'reading.image.not-in-vault':
    '{written} is not a place inside the vault: write its path from the vault’s root, or link it as [[name]]',
  // a schema drawn as a picture (schema-picture.ts)
  'reading.schema.unused-type': '{reading} (not used yet)',
} as const;
