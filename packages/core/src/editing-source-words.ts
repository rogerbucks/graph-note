// The words of the core's editing, in UK English (editor spec §42, words_catalogue). They say why an edit is refused,
// and what a list edit did. They cover a style written, a value typed in the inspector and a thing added. They cover
// a thing parked for later, a note on a thing, the edit pane's writes and locking. GQL a person types stays inside
// the sentence as written. source-words.ts keeps them with every other word.

/** The words of the core's editing, by key, in UK English. */
export const EDITING_SOURCE_WORDS = {
  // said by more than one kind of edit
  'editing.kind-word': 'the kind must be one word: letters, digits and underscores',
  'editing.not-in-block': '{thing} is not written in this block: edit it where it is written, in graph {graph}',
  'editing.no-link-number': 'this block has no link number {number}',
  'editing.name-taken': '{name} is already a name in graph {graph}: choose another',
  // a nudge, a look or a view's setting written to the style graph (style-edit.ts)
  'editing.style.direction': 'a direction nudge names one of {among}',
  'editing.style.look-place': 'a look is for one view or one path',
  'editing.style.look-target': 'a look styles one thing, kind or link',
  'editing.style.look-change': 'a look changes a colour, a line or a format',
  'editing.style.means': '{colour} needs a meaning, for the legend: give means',
  'editing.style.view-name': 'a view needs a name',
  'editing.style.shown-numbers': 'zoom, x and y must be numbers, and zoom above 0',
  'editing.style.frame': 'frame must be four numbers',
  'editing.style.selected': 'selected must name a thing',
  'editing.style.type-name': 'a relationship type needs a name',
  'editing.style.centre-name': 'a centre names a thing',
  // a property held as a list of linked things (linked-list.ts)
  'editing.list.itself': '{value} is this thing itself: a thing cannot be in its own list',
  'editing.list.relationship-word': 'the relationship must be one word: letters, digits and underscores',
  'editing.list.linked': {
    one: '{count} linked: {fresh} new, {reused} reused',
    other: '{count} linked: {fresh} new, {reused} reused',
  },
  'editing.list.empty': 'a list with no values yet',
  'editing.list.value-empty': 'a value cannot be empty',
  'editing.list.already': '{value} is already in the list',
  'editing.list.added-new': 'added {thing}, a new {kind}',
  'editing.list.added-again': 'added {thing}, which was already there',
  'editing.list.not-in': '{value} is not in the list',
  'editing.list.link-elsewhere': 'the link to {value} is not written in this block: remove it where it is written',
  'editing.list.link-in-path':
    'the link to {value} is written together with other things in one path: edit it in the text',
  'editing.list.stays-linked': 'removed the link; {value} stays, as something else links to it',
  'editing.list.stays-properties': 'removed the link; {value} stays, as it has properties of its own',
  'editing.list.stays-not-alone': 'removed the link; {value} stays, as it is not written alone in this block',
  'editing.list.removed-both': 'removed the link and {value}, which nothing else linked to',
  // a value typed in the inspector, and a property set or renamed (inspector.ts)
  'editing.value.number': 'expected a number, such as 12 or 3.5',
  'editing.value.date': 'expected a date, written YYYY-MM-DD',
  'editing.value.datetime': 'expected a date and time, written YYYY-MM-DDTHH:MM:SS+HH:MM',
  'editing.value.offset': 'an instant needs its offset, such as +10:00 or Z',
  'editing.value.boolean': 'expected true or false',
  'editing.value.list': 'the document profile holds no lists: write one property for each value',
  'editing.property.not-in-pattern': '{key} is not written in its pattern here: change it where it is written',
  'editing.property.id': 'the id is the thing’s name: rename the thing instead',
  'editing.property.word': 'a property name is one word: letters, digits and underscores',
  // a thing added (add-thing.ts)
  'editing.add.path-kind':
    'Path is the kind a recorded path takes, and a path needs its steps: record a path, or choose another kind',
  'editing.add.undeclared':
    'graph {graph} is locked and its schema does not declare {kind}: declare it in the schema first',
  'editing.add.text-first': 'give the thing its text first: its name is suggested from it',
  'editing.add.other-graph': 'this block is not in graph {graph}: add the thing where it is',
  'editing.add.schema-label': '{kind} is a label the graph keeps for its schema: choose another kind',
  'editing.add.name-word': 'a name is one word: letters, digits and underscores, and it starts with a letter',
  'editing.add.kept-word': '{name} is a word the language keeps: choose another name',
  'editing.add.only-set': 'the block holds only a SET or MATCH: add the thing in a block of its own',
  // a thing parked for later, and Deferred declared in a locked graph's schema (deferred.ts)
  'editing.deferred.not-declared':
    'graph {graph} is locked and its schema does not declare {lacking}: declare them in the schema first',
  'editing.deferred.what': 'say what is needed: a Deferred must have a what',
  'editing.deferred.why': 'say why it waits: a Deferred must have a why',
  'editing.deferred.day': 'the revisit date must be a day like 2026-11-01, not {day}',
  'editing.deferred.no-graph-line': 'the block names no graph: start it with // graph: <name>',
  'editing.deferred.no-thing': 'there is no {thing} in graph {graph} to park',
  'editing.deferred.ends-with-set': 'the block ends with a SET or MATCH: park it in a block of its own',
  'editing.deferred.no-graph': 'there is no graph {graph} in the note to declare them in',
  'editing.deferred.shared-schema':
    'graph {graph} is typed by a shared schema, which declares its types: declare Deferred and DEFERS there',
  'editing.deferred.no-schema': 'graph {graph} has no schema block in the note: lock the graph first',
  'editing.deferred.no-meta': 'graph {graph} has no GraphMeta to declare them from: add one to its schema first',
  'editing.deferred.meta-id':
    "graph {graph}'s GraphMeta has the id '{id}', which is not a plain name (letters, digits and underscores, not starting with a digit): rename it to {plain}",
  'editing.deferred.schema-ends-with-set':
    'the block that holds the schema ends with a SET or MATCH: end it with a thing of its own first',
  // a note on a thing or link (note-edit.ts)
  'editing.note.not-alone':
    '{thing} is not written on a line of its own: put the thing the note is about on a line of its own, directly below the note',
  'editing.note.not-here': '{thing} is not written in this block: add its note where it is written',
  'editing.note.link-not-alone':
    'this link is not written on a line of its own: put the thing the note is about on a line of its own, directly below the note',
  'editing.note.shares-line':
    'this thing or link shares its line with another: put the thing the note is about on a line of its own, directly below the note',
  'editing.note.not-read-back':
    'this note could not be written so that it is read back as it is: put the thing the note is about on a line of its own, directly below the note',
  // the edit pane writing its block back, and undoing (pane.ts, store.ts)
  'editing.undo-elsewhere':
    'Nothing to undo: another program, a sync or another pane changed this block since, and undoing would overwrite that change.',
  'editing.redo-elsewhere':
    'Nothing to redo: another program, a sync or another pane changed this block since, and redoing would overwrite that change.',
  'editing.twin':
    'The note now holds a copy of this block, and the editor cannot tell which of the two it was opened on, so it neither writes nor undoes either: open the block again to go on.',
  'editing.no-block': 'this note has no graph block to edit',
  'editing.block-gone': 'the block is no longer in the note where the pane read it',
  'editing.block-changed': 'the block has changed since the pane read it',
  'editing.block-twins': 'the block cannot be told apart from more than one identical block in the note',
  // locking a graph, and two versions compared (lock.ts, changes-view.ts)
  'editing.lock.no-graph': 'there is no graph {graph} to lock',
  'editing.no-changes': 'No changes between these versions.',
  'editing.changes.add-kind': 'Added: {thing} ({kind})',
  'editing.changes.change-kind': 'Changed: {thing} ({kind})',
  'editing.changes.remove-kind': 'Removed: {thing} ({kind})',
  'editing.changes.property-added': '{key} added: {value}',
  'editing.changes.property-removed': '{key} removed: {value}',
  'editing.changes.property-changed': '{key}: {was} → {now}',
  'editing.changes.kind-changed': 'kind: {was} → {now}',
  'editing.changes.no-kind': 'none',
} as const;
