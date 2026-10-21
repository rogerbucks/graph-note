// The words of the Obsidian host's own commands and notices, in UK English (editor spec §42, words_catalogue). They
// name the commands and say what each did, or why it did nothing. source-words.ts keeps them with every other word.

/** The words of the host's commands and notices, by key, in UK English. */
export const HOST_SOURCE_WORDS = {
  'host.command.convert': 'Convert this note to standard GQL',
  'host.command.recover': 'Recover kept drafts into a new note',
  'host.command.ask-ai': 'Ask an AI model to propose changes',
  'host.command.clear-sends': 'Clear the record of sends to AI models',
  'host.command.import': 'Import from a database',
  'host.taken':
    'Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.',
  'host.to-convert': 'to convert it to standard GQL',
  'host.to-ask-ai': 'to ask an AI model about its graph',
  'host.to-import': 'to import into it',
  'host.not-converted': 'Not converted: {why}',
  'host.not-converted-meanwhile': 'Not converted: the note changed meanwhile, and {why}',
  'host.already-standard': 'This note is already standard GQL.',
  'host.converted': {
    one: 'Converted {count} departure to standard GQL.',
    other: 'Converted {count} departures to standard GQL.',
  },
  'host.block-not-standard': 'block {number} could not be made standard GQL',
  'host.no-drafts': 'No drafts are kept.',
  'host.drafts-failed': 'The kept drafts could not be written into {path}: {why} They stay kept.',
  'host.drafts-written': {
    one: '{count} kept draft written into {path}.',
    other: '{count} kept drafts written into {path}.',
  },
  'host.sends-cleared': {
    one: 'Cleared the record of {count} send to AI models.',
    other: 'Cleared the record of {count} sends to AI models.',
  },
  'host.note-deleted':
    'The note was deleted while you were typing. What you typed is kept as a draft: the command "{command}" writes it into a note.',
  'host.note-not-open': 'the note is not open',
} as const;
