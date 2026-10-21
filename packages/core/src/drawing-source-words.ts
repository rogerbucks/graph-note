// What the core says of a drawing, in UK English (editor spec §42, words_catalogue). It says why a diagram type fits
// or not, and why one is suggested. It says why a graph is too large or took too long to lay out, and what an animated
// image may be. It also says where a link leaves the vault, and how far a completeness rule is met. source-words.ts
// keeps these with every other word.

/** The words of the drawing, its types, its limits and its links, by key, in UK English. */
export const DRAWING_SOURCE_WORDS = {
  // why a diagram type does not fit (types.ts)
  'diagram.nothing': 'there is nothing here to draw',
  'diagram.tree.no-link': 'there is no {type} link here',
  'diagram.tree.two-parents': '{thing} has two parents, {parents}',
  'diagram.tree.parents': '{thing} has {number} parents, {parents}',
  'diagram.tree.loops': 'it loops back: {loop}',
  'diagram.tree.no-links': 'a tree needs links, and there are none',
  'diagram.tree.along': 'along {relationship}, {why}',
  'diagram.tree.none': 'no relationship makes a tree: along {relationship}, {why}',
  'diagram.radial.three': 'a radial drawing needs three things or more',
  'diagram.radial.group': 'a radial drawing cannot draw the box of group {group}',
  'diagram.radial.joined': 'a radial drawing needs every thing joined to the centre, {centre}, and {thing} is not',
  'diagram.lanes.no-kind': '{thing} has no kind, so it has no lane',
  'diagram.lanes.two-kinds': '{thing} is of two kinds, {kinds}, so it cannot sit in one lane',
  'diagram.lanes.kinds': '{thing} is of {number} kinds, {kinds}, so it cannot sit in one lane',
  'diagram.lanes.group': 'group {group} holds things of two kinds',
  'diagram.lanes.two': 'lanes need things of two kinds or more',
  'diagram.flow.no-links': 'a flow needs links, and there are none',
  'diagram.flow.loops': 'a flow runs one way, and this loops back: {loop}',
  'diagram.timeline.undated': 'a timeline needs every thing to carry a date, and {thing} carries none',
  'diagram.plugin-missing':
    'the diagram type {type} comes from the plug-in {plugin}, which is not here, so the graph is drawn as a network',
  // why a type is suggested (types.ts)
  'diagram.because.table': {
    one: 'a graph of {count} thing reads best as a table first',
    other: 'a graph of {count} things reads best as a table first',
  },
  'diagram.because.timeline': 'every thing carries a date',
  'diagram.because.tree': 'each thing has at most one parent along {relationship}',
  'diagram.because.radial': 'every thing links to {centre}',
  'diagram.because.lanes': { one: 'its things are of {count} kind', other: 'its things are of {count} kinds' },
  'diagram.because.flow': 'the links run one way',
  'diagram.because.network': 'a network fits any graph',
  // the way in to a large graph (types-table.ts)
  'diagram.way-in': {
    one: 'This graph has {count} thing, too many to read in one drawing: open it as a table, or make a view of the part you need.',
    other:
      'This graph has {count} things, too many to read in one drawing: open it as a table, or make a view of the part you need.',
  },
  // why a graph is not laid out: what is over its limit (hosts/refusal-words.ts)
  'refusal.over.text-bytes': 'the graph blocks here hold {size} of text, and at most {most} is read',
  'refusal.over.text-lines': 'the graph blocks here hold {size} lines, and at most {most} are read',
  'refusal.over.source': "this graph's drawing instructions are {size}, and at most {most} are laid out",
  'refusal.over.source-at-least':
    "this graph's drawing instructions are at least {size}, and at most {most} are laid out",
  'refusal.over.word-drawn': 'a word in this graph is {size} characters long, and at most {most} are drawn',
  'refusal.over.word-laid-out': 'a word in this graph is {size} characters long, and at most {most} are laid out',
  'refusal.over.things-drawn': 'this graph has {size} things, and at most {most} are drawn',
  'refusal.over.things-laid-out': 'this graph has {size} things, and at most {most} are laid out',
  'refusal.over.links-drawn': 'this graph has {size} links, and at most {most} are drawn',
  'refusal.over.links-laid-out': 'this graph has {size} links, and at most {most} are laid out',
  // the banner over a graph shown as text instead
  'refusal.instead': 'It is shown as text instead.',
  'refusal.page': 'Graphs are laid out on the main thread here, so the limits are lower.',
  'refusal.timed-out': {
    one: 'Took too long to draw: laying this graph out took longer than {count} second, so it was stopped.',
    other: 'Took too long to draw: laying this graph out took longer than {count} seconds, so it was stopped.',
  },
  'refusal.stopped':
    'Drawing is paused: the last {failures} layouts took too long or failed, so no more are started until the plugin is reloaded.',
  'refusal.too-large-to-read': 'Too large to read: {over}.',
  'refusal.too-large-to-draw': 'Too large to draw: {over}.',
  // the notice of an export that was stopped, and wrote nothing
  'refusal.export.timed-out': {
    one: 'The export could not be made: laying the graph out took longer than {count} second, so it was stopped. Nothing was saved. Export a smaller view of the graph, or try again.',
    other:
      'The export could not be made: laying the graph out took longer than {count} seconds, so it was stopped. Nothing was saved. Export a smaller view of the graph, or try again.',
  },
  'refusal.export.stopped':
    'The export could not be made: the last {failures} layouts took too long or failed, so no more are started until the plugin is reloaded. Nothing was saved. Reload the plugin, then try again.',
  'refusal.export.too-large': 'The export could not be made: {over}.',
  'refusal.export.move-graphs': 'Move some of the graphs to another note.',
  'refusal.export.shorten': 'Shorten the long name or text.',
  'refusal.export.smaller': 'Export a smaller view of the graph, or split it into smaller graphs.',
  'refusal.export.failed':
    'The export could not be made: {why}. Nothing was saved. Try again; if it keeps failing, reload the plugin.',
  'refusal.layout.failed': 'the layout worker failed ({why})',
  'refusal.layout.could-not-start': 'the layout engine could not start ({why})',
  'refusal.layout.slow-start': 'the layout engine took too long to start',
  // what an animated image may be, and why one is still (image-limits.ts)
  'images.limits':
    'An animated image moves when it is at most {size}, at most {pixels} pixels a frame and at most {frames} frames, and at most {moving} move at once in one drawing.',
  'images.reduced': 'Still, as the system asks for reduced motion. Press Play to move it.',
  'images.past.size': 'it is {size}, over the {most} an animated image may be',
  'images.past.pixels':
    'each frame is {width} by {height} pixels, over the {most} pixels a frame an animated image may have',
  'images.past.frames': 'it has {frames} frames, over the {most} an animated image may have',
  'images.waits':
    'Shown as its first frame: {moving} animated images are already moving here. Pause one of them to play this one.',
  'images.not-read': 'Not shown: {why}, so it is not read.',
  'images.first-frame': 'Shown as its first frame: {why}.',
  // a link that leaves the vault, or is never opened (link-scan.ts)
  'links.leaves-web': 'This link leaves Obsidian: it opens {target} in your web browser.',
  'links.leaves-mail': 'This link leaves Obsidian: it writes to {to} in your mail app.',
  'links.not-opened': '{link} — not opened: only notes and files in the vault, and web and mail addresses, are opened.',
  // how far a completeness rule is met (completeness.ts)
  'completeness.covered': '{covered} of {counted} covered',
  'completeness.deferred': { one: '{count} deferred', other: '{count} deferred' },
  'completeness.overdue': { one: '{count} overdue', other: '{count} overdue' },
  'completeness.missing': { one: '{count} missing', other: '{count} missing' },
  'completeness.unchecked': 'cannot be checked',
} as const;
