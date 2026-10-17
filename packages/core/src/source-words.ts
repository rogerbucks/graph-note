// The source words, in UK English (editor spec §42, words_catalogue): every word the person reads, kept by key, which
// each translation gives again for its language. A key is the place it is said, dotted: `code.copied`. A placeholder is
// `{name}`; a word that changes with a count gives `one` and `other`. Words move here from the code as each place is
// brought to the catalogue; the plain-English check (ux_copy_auto) reads them here.

/** The source words, by key, in UK English: what every translation gives again. */
export const SOURCE_WORDS = {
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'code.copy-refused': 'Could not copy: the device did not allow it. Select the text and copy it instead.',
  'editor.block-gone': 'That graph block is no longer in the note: choose again from the blocks it has now.',
  'editor.draft-gone':
    'That draft is no longer kept: it was restored or discarded elsewhere, so nothing was changed. Any other draft is offered when the block is opened again.',
  'properties.type.text': 'Text',
  'properties.type.number': 'Number',
  'properties.type.boolean': 'Checkbox',
  'properties.type.date': 'Date',
  'properties.type.datetime': 'Date & time',
  'properties.type.list': 'List',
  'properties.type-of': 'Type of {name}: {type}',
  'properties.new': 'new property',
  'properties.remove': 'Remove',
  'find.none': 'No thing matches.',
  'find.found': { one: '{count} thing found.', other: '{count} things found.' },
} as const;
