// The words of the core's graph steps and walked paths, in UK English (editor spec §42, words_catalogue). They say why
// a step's rule or block is refused, why a step cannot run, and why an input cannot be given. They say why a path is
// not written, a path's problems, each step as it plays, and why a path is too large to animate. They also say what
// untangling shows. GQL and names stay inside the sentence as written. What a step or path writes into the note is
// never here: it is the note's bytes. source-words.ts keeps these with every other word.

/** The words of the core's steps and paths, by key, in UK English. */
export const STEPS_SOURCE_WORDS = {
  // why a step's rule is refused: the reason, then the form every refusal shows (steps-rule.ts)
  'steps.rule.refused': '{reason}: a step is MATCH a pattern, then INSERT the links it implies, as in {form}',
  'steps.rule.named': 'a step never calls a procedure or a named action, so the editor only ever works out information',
  'steps.rule.writes': 'a step never changes or removes anything itself: what it gives is offered as a proposal',
  'steps.rule.returns': 'a step gives a graph: write INSERT and the links it gives in place of RETURN',
  'steps.rule.code': 'a step is a query, never code',
  'steps.rule.adds': 'INSERT adds links between things the MATCH found, never a thing of its own',
  'steps.rule.empty': 'a step needs its rule',
  'steps.rule.no-match': "a step starts with MATCH, not '{found}'",
  'steps.rule.thing-bracket': "cannot read '{found}' where a thing in brackets is wanted",
  'steps.rule.property': 'a property in the pattern is a key, a colon and a text, a number or true or false',
  'steps.rule.properties': "cannot read '{found}' in a thing's properties",
  'steps.rule.thing': "cannot read '{found}' in a thing of the pattern",
  'steps.rule.link': 'a link is written -[:TYPE]->, <-[:TYPE]- or -[:TYPE]-',
  'steps.rule.link-type': "cannot read '{found}' in a link of the pattern, matched by its type only",
  'steps.rule.link-in': 'a link written <-[:TYPE] ends with -',
  'steps.rule.link-out': 'a link written -[:TYPE] ends with -> or -',
  'steps.rule.most-links': {
    one: "a step's pattern holds at most {count} link",
    other: "a step's pattern holds at most {count} links",
  },
  'steps.rule.no-insert': "the pattern is followed by INSERT and the links it implies, not '{found}'",
  'steps.rule.unnamed': 'INSERT names {name}, which the MATCH does not',
  'steps.rule.insert-type': 'a link INSERT gives is written -[:TYPE]->, with its type',
  'steps.rule.insert-way': 'a link INSERT gives runs one way: -[:TYPE]-> or <-[:TYPE]-',
  'steps.rule.after-insert': "cannot read '{found}' after the links INSERT gives",
  // why a block meant as a step cannot be one (steps.ts)
  'steps.fault.point-name': 'name the point a step takes a graph at, one word: // takes <point>: (:Kind), [:TYPE]',
  'steps.fault.point-item':
    "cannot read '{item}' in what {point} takes: write (:Kind) for things and [:TYPE] for links",
  'steps.fault.no-name': 'a step needs a name: write it after step, as QUERY step <name>',
  'steps.fault.not-one-word': "the step name '{name}' is not one word: use letters, digits and underscores only",
  'steps.fault.too-long':
    'a step is at most {most} characters long, and this one is {length}: shorten it, or split it into steps',
  'steps.fault.point-twice': 'the point {point} is declared twice',
  'steps.fault.no-points': 'a step says what it takes: write // takes <point>: (:Kind), [:TYPE] above its MATCH',
  'steps.fault.loose': {
    one: 'the rule matches {loose}, which no point says it takes: add it to a // takes line',
    other: 'the rule matches {loose}, which no point says it takes: add them to a // takes line',
  },
  'steps.fault.taken': 'another step of graph {graph} is already called {step}',
  // why a step does not run, or gives nothing new (steps.ts)
  'steps.run.cannot': 'Step {step} cannot run: {why}',
  'steps.run.cannot-unnamed': 'Step without a name cannot run: {why}',
  'steps.run.no-graph':
    'graph {graph} is not written in this note, so the step has nowhere to propose its output: run it in the note that holds {graph}.',
  'steps.run.too-many': {
    one: 'Step {step} found more than {count} match, so it was stopped: give it a smaller part of the graph.',
    other: 'Step {step} found more than {count} matches, so it was stopped: give it a smaller part of the graph.',
  },
  'steps.run.nothing-new': 'Step {step} works out nothing new: every link it gives is already in {graph}.',
  'steps.run.odd-id': 'Step {step} found a thing whose id is not a plain word ({id}), so it is not proposed.',
  // what is given at a step's point, and why it cannot be (steps-input.ts)
  'steps.given.graph': 'graph {graph}',
  'steps.given.view': 'view {view} of {graph}',
  'steps.input.not-in-note': '{given}, given at {point}, is not in this note.',
  'steps.input.no-view': 'There is no view {view} of {graph} in this note, to give at {point}.',
  'steps.input.view-fault': '{given}, given at {point}, cannot be used: {why}.',
  'steps.input.view-refused': '{given}, given at {point}, is refused: {why}',
  'steps.input.view-empty': '{given}, given at {point}, matches nothing: {why}',
  'steps.input.not-taken': 'The step takes nothing at {point}: it takes {points}.',
  'steps.input.nothing-given': 'Nothing is given at {point}: choose a graph or a view for it.',
  'steps.input.holds-nothing': '{given}, given at {point}, holds nothing.',
  'steps.input.no-kind': '{point} takes (:{kind}) things, and {given} holds none.',
  'steps.input.no-type': '{point} takes [:{type}] links, and {given} holds none.',
  // why a walk is not written as a path (paths.ts)
  'paths.refused.no-title': 'a path needs a title: give it one before it is written',
  'paths.refused.no-steps': 'a path with no steps is not written: tap the boxes of the walk in order first',
  'paths.refused.not-in-graph': '{thing} is not in graph {graph}, so it cannot be a step',
  'paths.refused.not-a-fact': "{thing} is a {kind}, which a step cannot be: a path's steps are facts",
  'paths.refused.locked': {
    one: 'graph {graph} is locked and its schema does not declare {lacking}: declare it in the schema first',
    other: 'graph {graph} is locked and its schema does not declare {lacking}: declare them in the schema first',
  },
  'paths.refused.no-graph': 'there is no graph {graph} to write a path in',
  'paths.refused.block-ends': 'the block ends with a SET or MATCH: write the path in a block of its own',
  // a path's problems, their fixes, and each step as it is played (paths.ts, path-edits.ts)
  'paths.no-steps': 'the path {path} has no steps',
  'paths.no-steps.fix': 'record its steps by tapping boxes in order, or remove the path',
  'paths.missing-step': 'the path {path} steps through {thing}, which is not in graph {graph}',
  'paths.missing-step.estimate':
    'the path {path} steps through {thing}, which is not in graph {graph}; it is drawn as an estimate of {near}',
  'paths.missing-step.tied':
    'the path {path} steps through {thing}, which is not in graph {graph}; {near} are equally close, so it is not drawn',
  'paths.missing-step.fix': 'remove the step, or restore {thing}',
  'paths.missing-step.fix-near': 'change {thing} to {near}, remove the step, or restore {thing}',
  'paths.remove-step': 'Remove the step',
  'paths.step': 'Step {step} of {steps}: {text}',
  'paths.step-missing': 'Step {step} of {steps}: missing. {thing} is not in the graph.',
  // why a path is too large to animate, and what would make it fit (path-animation.ts)
  'paths.animation.steps-phone': {
    one: 'the path has {count} step, more than the {most} an animated SVG can play smoothly on this phone',
    other: 'the path has {count} steps, more than the {most} an animated SVG can play smoothly on this phone',
  },
  'paths.animation.steps-computer': {
    one: 'the path has {count} step, more than the {most} an animated SVG can play smoothly on this computer',
    other: 'the path has {count} steps, more than the {most} an animated SVG can play smoothly on this computer',
  },
  'paths.animation.steps.fix':
    'export a path of {most} steps or fewer, such as part of this one recorded as a path of its own, or export the drawing as a still SVG',
  'paths.animation.size-phone':
    'the animated SVG would be about {size} MB, more than the {most} MB this phone opens smoothly',
  'paths.animation.size-computer':
    'the animated SVG would be about {size} MB, more than the {most} MB this computer opens smoothly',
  'paths.animation.size.fix': 'export a view that holds the path, so fewer things are drawn, or a shorter path',
  // what an animated SVG says of its path, written into the file in UK English with sourceWord (path-animation.ts)
  'paths.animation.subtitle': 'Played step by step, {pace}: {walk}',
  'paths.animation.step-gone': '{seq} {text} (not in the graph)',
  'paths.animation.legend':
    'Outlined and numbered: the steps of the path, in order; the heavier outline moves from step to step, and a dot travels a link between two steps',
  // what untangling a graph says it shows (untangle.ts)
  'untangle.showing-only': {
    one: 'Showing only {thing} and the things within {count} step of it.',
    other: 'Showing only {thing} and the things within {count} steps of it.',
  },
  'untangle.no-path': 'There is no path between {from} and {to}.',
  'untangle.shortest-path': {
    one: 'The shortest path from {from} to {to} is {count} step: {things}.',
    other: 'The shortest path from {from} to {to} is {count} steps: {things}.',
  },
} as const;
