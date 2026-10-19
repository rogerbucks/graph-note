// The words of the AI send dialog, the AI models' settings and the question before leaving the app. They are in UK
// English (editor spec §42, words_catalogue). source-words.ts keeps them with every other word.

/** The AI dialog's, the AI models' and leaving the app's words, by key, in UK English. */
export const AI_SOURCE_WORDS = {
  'ai.view': 'View',
  'ai.graph': 'Graph',
  'ai.title': 'Ask an AI model to propose changes',
  'ai.question': 'Propose the changes that would make this graph more complete and correct.',
  'ai.nothing': 'This note has no graph with things in it, so there is nothing to send.',
  'ai.what': 'What to send',
  'ai.what.sentence': 'Only this is sent, with your question: nothing else of the note or the vault.',
  'ai.what.graph': 'The whole graph',
  'ai.what.view': 'A view of it',
  'ai.what.things': 'Only the things ticked',
  'ai.your-question': 'Your question',
  'ai.your-question.sentence': 'What you ask the model; it is sent with what you chose.',
  'ai.show': 'Show what will be sent',
  'ai.send': 'Send',
  'ai.cancel': 'Cancel',
  'ai.no-view': 'Graph {graph} has no view in this note: choose the whole graph or tick things.',
  'ai.model': 'Model',
  'ai.model.no-purpose': 'No purpose given',
  'ai.model.matrix': '{purpose}; held to the matrix row {row}.',
  'ai.model.ceiling': '{purpose}; sent notes up to {ceiling}.',
  'ai.model.for-proposing': '{name}, for proposing changes',
  'ai.matrix-unread':
    'The matrix note could not be read, so nothing is sent: check the note named in the settings, then press Show what will be sent again.',
  'ai.exactly': 'Exactly this is sent, with these headers, and only once you choose to send it:',
  'ai.level-changed':
    'The note’s classification has changed since what will be sent was shown (it was {was}, it is now {is}). Nothing was sent: press Show what will be sent again.',
  'ai.not-written-error': '{model} answered, but its proposal could not be written into {path} ({error}).',
  'ai.not-written': '{model} answered, but its proposal was not written into the note: {why}',
  'ai.proposed': {
    one: '{model} proposed {count} change: it is in the note as a change set beside the graph, waiting for you to accept or reject it.',
    other:
      '{model} proposed {count} changes: they are in the note as a change set beside the graph, each waiting for you to accept or reject it.',
  },
  'leave.title': 'Leave Obsidian?',
  'leave.open': 'Open',
  'leave.cancel': 'Cancel',
  'models.name': 'Name',
  'models.purpose': 'Purpose',
  'models.purpose.sentence':
    'What it is for: {purposes}, or your own words. A send for that purpose offers this model first.',
  'models.model': 'Model',
  'models.model.sentence': 'The model’s own name at its address, as the service names it.',
  'models.endpoint': 'Endpoint',
  'models.endpoint.sentence':
    'The address requests go to, such as a chat completions address: http:// for a model on this device, https:// for any ' +
    'other. A model on this device keeps what it is sent here; any other keeps it under its provider’s terms.',
  'models.none': 'No model is set up: nothing is ever sent.',
  'models.page': 'Model {n}',
  'models.said': '{name}: {purpose}, up to {ceiling}',
  'models.no-purpose': 'no purpose given',
  'models.unnamed': 'Not named yet',
  'models.ceiling-gone': '{ceiling} is no longer a classification: choose again',
  'models.held': 'held to the matrix row {row}',
  'models.ceiling': 'Ceiling',
  'models.ceiling.sentence': 'The highest classification of note this model may be sent.',
  'models.key': 'Key',
  'models.key.sentence': 'Kept in the app’s own secret store, never in the vault.',
  'models.add': 'Add a model',
  'models.no-row': 'None: use the ceiling',
  'models.unmatched': ' (flagged: matches no classification)',
  'models.row-gone':
    '{row} is not in the matrix note now, or is there more than once: nothing is sent to this model until a row is chosen again.',
  'models.choose-row': 'Choose a row of the destination matrix to hold this model to it, in place of its ceiling.',
  'models.row': 'Matrix row',
  'models.flagged': 'Flagged in the matrix: {classes}.',
  'models.send-level': 'Send {level} notes',
  'models.condition': 'The row’s condition: {condition}. Off until you switch it on for this model.',
  'models.condition-changed': ' The condition has changed since you switched it on: read it, then switch it on again.',
} as const;
