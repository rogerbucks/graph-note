// The words of the core's views, in UK English (editor spec §42, words_catalogue). They name the five kinds of view and
// say a view in plain language. They say why a view query is refused, and why a view matches nothing. They also say why
// a view cannot be written into a note. GQL and names stay inside the sentence as written. The block a view is written
// as is never here: it is the note's bytes. source-words.ts keeps these with every other word.

/** The words of the core's views, by key, in UK English. */
export const VIEWS_SOURCE_WORDS = {
  // each of the five kinds of view, as a refusal names it (view-profile.ts)
  'views.kind.picked': 'a hand-picked set of things',
  'views.kind.near': 'everything near a thing',
  'views.kind.reaches': 'how one thing reaches another',
  'views.kind.kinds': 'only some kinds',
  'views.kind.path': 'a walked path',
  // a query outside the five shapes: why, the shapes allowed, and the nearest one's form (view-profile.ts)
  'views.refused': '{reason}. A view query has one of five shapes: {shapes}. The nearest is {nearest}: {form}',
  'views.profile.escape': 'The text {text} has an escape, \\{escape}, that is not known',
  'views.profile.unclosed': 'The text that starts at {start} is never closed: end it with a single quote',
  'views.profile.symbol':
    '"{symbol}" is not allowed in a view: text goes in single quotes, and the only symbols are ()[]{}:,.=|-',
  'views.profile.ends-early': 'The query ends where {want} should be',
  'views.profile.expected': 'Expected {want}, found {found}',
  'views.profile.expected-text': 'Expected {want} in single quotes, found {found}',
  'views.profile.called': 'The thing is called {name} here, so write {name}, not {written}',
  'views.profile.twice': '{name} names two things: give each its own name',
  'views.profile.after-return': "Nothing may follow the view's RETURN, found {found}",
  'views.profile.thing-id': "A view finds a thing by its id: write {id: 'name'}; found {found}",
  'views.profile.things-id': 'A view finds things by their id: write n.id; found {found}',
  'views.profile.path-kind': 'A walked path is a Path; found {found}',
  'views.profile.path-steps': "A walked path's steps are STEPs; found {found}",
  'views.profile.no-arrow': 'Everything near a thing ignores direction: write -[]- with no arrow',
  'views.profile.from-one': 'Steps are counted from 1: write {1,{most}}',
  'views.profile.too-many': {
    one: 'At most {count} step is allowed here, not {steps}',
    other: 'At most {count} steps are allowed here, not {steps}',
  },
  'views.profile.several-kinds':
    'Grafeo reads several kinds only after IS, not after a colon: write (n IS Person|Team)',
  'views.profile.no-query': 'The view has no query',
  'views.profile.match-first': 'A view starts with MATCH, not {found}',
  'views.profile.reserved-name':
    '{word} is a word GQL keeps for itself, so it cannot be a name in a view: write another, such as {word}_1',
  'views.profile.reserved-kind':
    '{word} is a word GQL keeps for itself, so a view cannot ask for it as a kind: give the kind another name, such as {word}_1',
  // what a refusal found where the query should have more (view-profile.ts)
  'views.found.text': "the text '{text}'",
  'views.found.symbol': '"{symbol}"',
  'views.found.end': 'the end',
  // what a refusal expected, where the query should have it (view-profile.ts)
  'views.want.kind': 'a kind',
  'views.want.thing-name': "the thing's name",
  'views.want.picked-name': 'a thing name',
  'views.want.most-steps': 'the most steps',
  'views.want.arrow-or-dash': '"->" or "-" after []',
  'views.want.dash': '"-" after []',
  'views.want.name-things': 'a name for the things, such as n',
  'views.want.name-thing': 'a name for the thing, such as n',
  'views.want.name-near': 'a name for the things near it, such as m',
  'views.want.name-path': 'a name for the path, such as p',
  'views.want.name-start': 'a name for where it starts, such as a',
  'views.want.name-end': 'a name for where it ends, such as b',
  'views.want.name-steps': 'a name for the steps, such as n',
  // a view that matches nothing, and what to change (view-evaluate.ts)
  'views.empty.no-thing': {
    one: 'No thing is called {names}: pick another, or change the view',
    other: 'No thing is called {names}: pick others, or change the view',
  },
  'views.empty.no-things': 'Graph {graph} has no things in this note: add some, or change the view',
  'views.empty.none-picked': 'Nothing is picked: pick a thing, or change the view',
  'views.empty.no-links': '{thing} has no links, so nothing is near it: pick another thing, or change the view',
  'views.empty.not-reached': {
    one: '{from} does not reach {to} in up to {count} step: allow either direction, or change the view',
    other: '{from} does not reach {to} in up to {count} steps: allow either direction, or change the view',
  },
  'views.empty.not-connected': {
    one: '{from} and {to} are not connected in up to {count} step: pick other things, or change the view',
    other: '{from} and {to} are not connected in up to {count} steps: pick other things, or change the view',
  },
  'views.empty.no-kind': 'No thing is a {kinds}: pick other kinds, or change the view',
  'views.empty.not-path': '{thing} is not a path: pick a path, or change the view',
  'views.empty.no-path': 'No path is called {path}: pick another, or change the view',
  'views.empty.no-steps': 'The path {path} has no steps: record a walk, or change the view',
  'views.empty.steps-gone': 'Every step of the path {path} is gone from the graph: restore a step, or change the view',
  // a view that cannot be written, or written into a note (view-write.ts)
  'views.write.no-kind': 'a view of kinds needs at least one kind',
  'views.write.bad-kind': "'{kind}' is not a kind a query can name: use letters, digits and underscores",
  'views.write.graph-name': "the graph name '{name}' is not one word: use letters, digits and underscores",
  'views.write.view-name': "the view name '{name}' is not one word: use letters, digits and underscores",
  'views.write.cannot': 'This view cannot be written: {why}',
  'views.write.not-a-view': 'This view cannot be written: it is no view of {graph}',
  'views.write.name-taken': 'graph {graph} already has a view called {view}: give this one another name',
  'views.write.graph-gone': 'graph {graph} is no longer in the note',
  // a block meant as a view that cannot be used as one (views.ts)
  'views.fault.no-name': 'a view needs a name: write it after view, as QUERY view <name>',
  'views.fault.not-one-word': "the view name '{name}' is not one word: use letters, digits and underscores only",
  'views.fault.taken': 'another view of graph {graph} is already called {view}',
  // a view in plain language (views.ts)
  'views.reading.picked': '{things}, picked by hand',
  'views.reading.none-picked': 'no things picked by hand yet',
  'views.reading.near': {
    one: 'everything within {count} step of {thing}',
    other: 'everything within {count} steps of {thing}',
  },
  'views.reading.reaches': {
    one: 'how {from} reaches {to}, in up to {count} step',
    other: 'how {from} reaches {to}, in up to {count} steps',
  },
  'views.reading.reaches-either': {
    one: 'how {from} reaches {to}, in either direction, in up to {count} step',
    other: 'how {from} reaches {to}, in either direction, in up to {count} steps',
  },
  'views.reading.kinds': 'only {kinds}',
  'views.reading.path': 'the walked path {path}, in order',
} as const;
