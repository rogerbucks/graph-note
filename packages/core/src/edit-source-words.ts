// The words of editing, in UK English (editor spec §42, words_catalogue): a thing's properties in the details, the form
// that adds a thing while its block is edited, Edit itself, and the editor's kept drafts. source-words.ts keeps them with
// every other word.

/** The words of editing, by key, in UK English. */
export const EDIT_SOURCE_WORDS = {
  'properties.type.text': 'Text',
  'properties.type.number': 'Number',
  'properties.type.boolean': 'Checkbox',
  'properties.type.date': 'Date',
  'properties.type.datetime': 'Date & time',
  'properties.type.list': 'List',
  'properties.type-of': 'Type of {name}: {type}',
  'properties.new': 'new property',
  'properties.remove': 'Remove',
  'properties.name': 'Property name',
  'properties.value-of': 'Value of {name}',
  'properties.value-new': 'Value of new property',
  'properties.name-of': 'Name of {name}',
  'properties.name-new': 'New property name',
  'properties.refused': '{name}: {why}.',
  'properties.new-one': 'new property',
  'properties.name-first': 'name it first',
  'properties.taken': 'it already has a property called {name}',
  'properties.add': 'Add property',
  'add.group': 'Add a thing',
  'add.thing': 'Add a thing',
  'add.text': 'Text of the new thing',
  'add.name': 'Name of the new thing',
  'add.kind': 'Kind of the new thing',
  'add.named': 'Name: {name}.',
  'add.suggested': 'Suggested name: {name}. Nothing is written until you press Add the thing.',
  'add.not-editing': 'The block is no longer being edited, so nothing was written.',
  'add.added': 'Added {text} as {name}.',
  'add.it': 'Add the thing',
  'add.cancel': 'Cancel adding',
  'editor.edit': 'Edit',
  'editor.empty-graph':
    "Graph {graph} has nothing in it yet. Start with a thing: write (name:Kind {name: 'Its text'}) below the graph line, or press Edit.",
  'editor.edit-kept':
    'The edit was not written: {reason}. The block is as the note has it, and the edit is kept as a draft.',
  'editor.stopped-kept': '{reason} What you typed is kept as a draft.',
  'editor.changed-kept':
    'The block changed in the note while you were typing ({reason}), so it was reloaded. What you typed is kept as a draft.',
  'editor.draft-kept': 'A draft of this block, kept on {when}, can be restored.',
  'editor.restore': 'Restore draft',
  'editor.discard': 'Discard draft',
} as const;
