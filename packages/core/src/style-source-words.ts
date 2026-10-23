// The words of the core's problems found while checking a style graph, in UK English (editor spec §42, words_catalogue).
// They say what a style thing lacks or holds wrongly, and how to fix it. They also say where two style things conflict.
// GQL a person types, such as add view: '<name>', stays inside the sentence as written. source-words.ts keeps these
// with every other word.

/** The words of checking a style graph's problems, by key, in UK English. */
export const STYLE_SOURCE_WORDS = {
  // a word or a name that is not one of those allowed, and its fix (style-graph.ts, style-reader.ts)
  'styling.change-to': 'change {written} to {to}',
  'styling.change-to-one-of': 'change {written} to one of {among}',
  'styling.change-to-meant': 'change {written} to the one you mean: {among}',
  'styling.must-be': '{key} must be {among}',
  'styling.must-be-text': '{key} must be text',
  'styling.must-be-text.fix': 'write {key} in quotes',
  'styling.must-be-number': '{key} must be a number',
  'styling.must-be-number.fix': 'write {key} as a number, such as {key}: 1',
  'styling.not-in-graph': '{written} is not {what} in graph {graph}',
  'styling.not-in-graph.fix': 'write {what} in graph {graph}, or remove it',
  // what a name must be, said in the two sentences above
  'styling.what.thing': 'a thing',
  'styling.what.thing-id': 'the id of a thing',
  'styling.what.kind': 'a kind',
  'styling.what.type': 'a relationship type',
  'styling.what.path': 'a path',
  'styling.what.path-id': 'the id of a path',
  'styling.what.property-of': 'a property of {of}',
  'styling.what.property-it-has': 'a property it has',
  // fixes said by many checks
  'styling.remove-one': 'remove one of them',
  'styling.remove-all-but-one': 'remove all but one of them',
  'styling.add-id': "add {key}: '<id>'",
  'styling.add-property': "add property: '<name>'",
  'styling.add-view-name': "add view: '<the view's name>'",
  // a key a style thing does not use, and a frame that is not four numbers (style-words.ts)
  'styling.key-unknown.a': '{key} is not a key a {kind} uses',
  'styling.key-unknown.an': '{key} is not a key an {kind} uses',
  'styling.key.fix': 'remove {key}, or use one of {among}',
  'styling.frame.four': "frame must be four numbers, 'x,y,width,height'",
  'styling.frame.four.fix': "write it as frame: '0,0,300,200'",
  'styling.frame.stray': "frame '{written}' has a stray comma or space",
  'styling.frame.stray.fix': "change it to '{clean}'",
  'styling.frame.stray-not-four': "frame '{written}' has a stray comma or space, and is not four numbers",
  'styling.frame.stray-not-four.fix':
    "remove the stray comma or space, giving '{clean}', then write four numbers, 'x,y,width,height'",
  // a style thing that is no kind a style graph holds (style-checks.ts)
  'styling.kind-unknown': '{label} is not a kind of thing a style graph holds: {kinds}',
  'styling.kind-one': 'a thing of a style graph is one of {kinds}',
  'styling.kind.fix': 'write it as one of {kinds}, or remove it',
  // a nudge (style-checks.ts)
  'styling.nudge.four-words': 'a nudge must be one of four words: beside, before, group or direction',
  'styling.nudge.add-word': 'add word: {among}',
  'styling.nudge.two-things': 'a {word} nudge names two things: thing and other',
  'styling.nudge.group': 'a group nudge names a thing and its group',
  'styling.nudge.add-group': "add group: '<the group's label>'",
  'styling.nudge.direction': 'a direction nudge names its direction',
  'styling.nudge.add-direction': 'add direction: {among}',
  'styling.nudge.direction-unknown': '{written} is not a direction the locked style lays out in',
  // a property shown inline (style-checks.ts)
  'styling.show.for': 'a Show is for one kind, thing or relationship type',
  'styling.show.property': 'a Show names the property to show',
  'styling.show.add-target': "add kind: '<Kind>', thing: '<id>' or type: '<TYPE>'",
  // a look (style-checks.ts)
  'styling.look.view-and-path': 'a look is for one view or one path, not both',
  'styling.look.view-or-path': "a look is for a view or a path: add view: '<name>' or path: '<id>'",
  'styling.look.view-or-path.fix': "add view: '<name>' or path: '<id>'",
  'styling.look.too-many': 'a look styles one thing, kind or link, not more',
  'styling.look.target': 'a look styles one thing, kind or link: add thing, kind, or from, type and to',
  'styling.look.target.fix': 'add what it styles',
  'styling.look.change': 'a look changes a colour, a line or a format: add one',
  'styling.look.change.fix': "add colour, line or format, such as line: 'dashed'",
  'styling.look.colour-unknown': '{written} is not a colour of the locked style',
  'styling.look.means': '{colour} has no meaning written, so the legend cannot say what it means',
  'styling.look.means.fix': "add means: '<what {colour} means here>'",
  // a view's fade or hide, and a view saved as shown (style-checks.ts)
  'styling.view-style.view': 'a ViewStyle names its view',
  'styling.view-style.outside': 'a ViewStyle says fade or hide',
  'styling.view-style.outside.fix': "add outside: 'fade' or 'hide'",
  'styling.shown.view': 'a Shown names its view',
  'styling.shown.zoom': 'zoom must be a number above 0',
  'styling.shown.zoom.fix': 'write a zoom above 0, such as zoom: 1',
  // arrowheads, the diagram type and how links are drawn (style-choice-checks.ts)
  'styling.arrows.missing': 'an Arrows says show or hide',
  'styling.arrows.add': 'add arrowheads: {among}',
  'styling.diagram.missing': 'a Diagram names its type',
  'styling.diagram.add': 'add type: {among}',
  'styling.diagram.unknown': '{written} is not a diagram type',
  'styling.diagram.tree-only': 'a relationship is chosen only for a tree',
  'styling.diagram.tree-only.fix': "remove relationship, or make it type: 'tree'",
  'styling.diagram.radial-only': 'a centre is chosen only for a radial drawing',
  'styling.diagram.radial-only.fix': "remove centre, or make it type: 'radial'",
  'styling.diagram.timeline-only': 'an order and what is shown are chosen only for a timeline',
  'styling.diagram.timeline-only.fix': "remove them, or make it type: 'timeline'",
  'styling.diagram.by-only': 'by is chosen only for an order by date or number',
  'styling.diagram.by-only.fix': "remove by, or make it order: 'date' or 'number'",
  'styling.links.missing': 'a Links sets routing or merge',
  'styling.links.add': "add routing: {among}, or merge: 'on'",
  'styling.links.routing-unknown': '{written} is not a routing: links are {among}',
  // links that move, and how a screen reader hears one (link-flow.ts)
  'styling.flow.dashes': 'moving dashes: {means}',
  'styling.flow.dot': 'a moving dot: {means}',
  'styling.flow.missing': 'a Flow says how its links move',
  'styling.flow.add': 'add motion: {among}',
  'styling.flow.means-needed':
    'a link that moves must say what its movement means, so it is never told by movement alone',
  'styling.flow.means.fix': "add means: '<what the movement means>'",
  // a picture on a box (picture.ts)
  'styling.picture.for': 'a Picture is for one kind or one thing',
  'styling.picture.property': 'a Picture names the property that holds its image',
  'styling.picture.add-target': "add kind: '<Kind>' or thing: '<id>'",
  // the legend's choices saved with a view (untangle-saved.ts)
  'styling.legend.unreadable':
    '{entry} is not a legend choice: write kind:<Kind> or type:<TYPE>, then forward or hidden',
  'styling.legend.unreadable.fix': 'write it as kind:<Kind> forward or type:<TYPE> hidden, or remove it',
  'styling.legend.not-a-line': "{id} is not a legend's line: a legend saves kind:<Kind> or type:<TYPE>",
  'styling.legend.saved-as': "a legend's line is saved {among}, not {state}",
  'styling.legend.state-unknown': "{state} is not a legend choice's state: {among}",
  'styling.filter.keep': 'a Filter says what it keeps',
  'styling.filter.keep.fix': "add keep: 'Kind: <Kind>' or keep: '<property>: <value>'",
  'styling.filter.unreadable': 'the filter {part} cannot be read: a filter is its name, a colon, then the values kept',
  'styling.filter.unreadable.fix': "write it as 'status: done, open', or remove it",
  'styling.filter.twice': 'the filter {name} is written twice in one Filter',
  'styling.filter.unsaved': '{text} cannot be saved in a filter: it is empty, or holds a semicolon, colon or comma',
  'styling.legend.twice': '{id} is chosen twice in the legend',
  'styling.legend.twice.fix': 'keep one of them',
  'styling.legend.empty': 'the legend has an empty choice between its commas',
  'styling.legend.empty.fix': 'remove the extra comma',
  // a style block as a whole (style.ts)
  'styling.link': 'a link means nothing in a style graph',
  'styling.link.fix': 'remove the link',
  'styling.too-large-lines':
    'the style is too large to read ({size} lines, over {most}), so the graph is drawn in the locked style',
  'styling.too-large-bytes':
    'the style is too large to read ({size} bytes, over {most}), so the graph is drawn in the locked style',
  'styling.too-large.fix': 'make the style smaller',
  'styling.no-graph': 'there is no graph {graph} in this note to style',
  'styling.no-graph.fix': 'write graph {graph}, or style a graph the note has',
  'styling.named-as-data':
    "this style block takes the data graph {own}'s name; it needs a name of its own, never a data graph's",
  'styling.named-as-data.fix': 'name it {graph}_style: // graph: {graph}_style · STYLE {graph}',
  // two style things that conflict: the later is left out (style-conflicts.ts)
  'styling.conflict.direction': 'this direction nudge ({direction}) conflicts with the one on line {line} ({first})',
  'styling.conflict.groups': '{thing} is in two groups, {first} (line {line}) and {group}',
  'styling.conflict.beside-before':
    '{thing} and {other} cannot be both beside and before each other: this conflicts with line {line}',
  'styling.conflict.loop': 'this before nudge closes a loop: {loop}',
  'styling.conflict.colour-view': '{colour} already means {means} in view {view} (line {line})',
  'styling.conflict.colour-path': '{colour} already means {means} in path {path} (line {line})',
  'styling.conflict.colour.fix': 'use another colour, or the same meaning',
  'styling.conflict.show': '{property} of {of} is switched both {first} (line {line}) and {inline}',
  'styling.conflict.show-view': '{property} of {of} is switched both {first} (line {line}) and {inline} in view {view}',
  'styling.conflict.arrows-all':
    'the arrowheads of every link in the whole graph are set to both {first} (line {line}) and {arrowheads}',
  'styling.conflict.arrows-all-view':
    'the arrowheads of every link in view {view} are set to both {first} (line {line}) and {arrowheads}',
  'styling.conflict.arrows-type':
    'the arrowheads of {type} in the whole graph are set to both {first} (line {line}) and {arrowheads}',
  'styling.conflict.arrows-type-view':
    'the arrowheads of {type} in view {view} are set to both {first} (line {line}) and {arrowheads}',
  'styling.conflict.diagram': 'the diagram type of the whole graph is set to both {first} (line {line}) and {type}',
  'styling.conflict.diagram-view': 'the diagram type of view {view} is set to both {first} (line {line}) and {type}',
  'styling.conflict.type-along': '{type} along {relationship}',
  'styling.conflict.routing':
    'the routing of links in the whole graph is set to both {first} (line {line}) and {routing}',
  'styling.conflict.routing-view':
    'the routing of links in view {view} is set to both {first} (line {line}) and {routing}',
  'styling.conflict.merge': 'merging links in the whole graph is set to both {first} (line {line}) and {merge}',
  'styling.conflict.merge-view': 'merging links in view {view} is set to both {first} (line {line}) and {merge}',
  'styling.conflict.flows-all':
    'the links of every type in the whole graph are set to move both as {first} (line {line}), and as {flow}',
  'styling.conflict.flows-all-view':
    'the links of every type in view {view} are set to move both as {first} (line {line}), and as {flow}',
  'styling.conflict.flows-type':
    'the links of {type} in the whole graph are set to move both as {first} (line {line}), and as {flow}',
  'styling.conflict.flows-type-view':
    'the links of {type} in view {view} are set to move both as {first} (line {line}), and as {flow}',
  'styling.conflict.flow-meaning': '{motion}, meaning {means}',
  'styling.conflict.view': 'view {view} is set to both {first} (line {line}) and {outside}',
  'styling.conflict.shown-twice': 'view {view} is saved as shown twice, here and on line {line}',
} as const;
