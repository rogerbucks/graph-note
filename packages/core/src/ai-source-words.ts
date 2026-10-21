// The words of the AI send dialog, the AI models' settings and the question before leaving the app. They are in UK
// English (editor spec §42, words_catalogue). The core's AI words follow: what is sent, its ceilings and its refusals.
// source-words.ts keeps them with every other word.

/** The AI dialog's, the AI models', leaving the app's and the core's AI words, by key, in UK English. */
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
  // the core's AI: where requests may go, and whether AI is on (ai-choice.ts)
  'ai.address.none':
    'No address is set: give the address requests go to, such as {example} for a model on this device.',
  'ai.address.not-one':
    '{given} is not an address: give the full address requests go to, such as {example} for a model on this device.',
  'ai.address.scheme': 'An address starts with https://, or http:// for a model on this device; {given} does not.',
  'ai.address.unclear':
    'The host in {given} cannot be told apart from another: write it with letters, digits, dots and hyphens only.',
  'ai.address.user': 'An address holds no user name or password: keep the key in the app’s secret store instead.',
  'ai.address.query':
    'An address holds no query string or fragment (the part after ? or #), as a key or anything else could ride in it: keep the key in the app’s secret store instead.',
  'ai.address.https':
    'A model on another machine is reached over https only, so what is sent cannot be read on the way: start {given} with https://.',
  'ai.off': 'AI is off: turn on Use AI models in the settings, and set up a model, before anything is sent.',
  'ai.no-model':
    'No AI model is set up yet: set one up under AI models in the settings, with its name, model and address.',
  // a model's ceiling, and the credentials never sent (ai-ceiling.ts)
  'ai.level.unlabelled': 'This note has no classification, so it counts as {level}',
  'ai.level.classified': 'This note is classified {level}',
  'ai.ceiling.unknown':
    'This note is classified "{level}", which is not one of the classifications set ({levels}), so it counts as above every ceiling and is not sent.',
  'ai.ceiling.highest': '{said}, the highest classification set: nothing at it is ever sent to any model.',
  'ai.ceiling.gone':
    '{model}’s ceiling, {ceiling}, is no longer one of the classifications set: choose it again in the model’s settings before anything is sent to it.',
  'ai.ceiling.above': '{said}, above {model}’s ceiling, {ceiling}, so it is not sent to {model}.',
  'ai.ceiling.cleared': {
    one: '{models} is cleared for {level}: send to it instead.',
    other: '{models} are cleared for {level}: send to one of them instead.',
  },
  'ai.ceiling.none-cleared': 'No model set up is cleared for {level}.',
  'ai.ceiling.change':
    'Give the note a classification (a classification property in its front matter), or choose a lower level under Unlabelled notes count as, in the AI models settings.',
  'ai.credential.private': 'a private key',
  'ai.credential.access': 'an access key',
  'ai.credential.api': 'an API key',
  'ai.credential.token': 'a token',
  'ai.credential.password': 'a password or secret',
  'ai.credential.card': 'a card number',
  'ai.credential.model-key': 'the key of a model set up here',
  // a model held to a row of the destination matrix (ai-matrix.ts)
  'ai.matrix.row-twice': 'The matrix has the row “{row}” more than once, so no model is sent to by it.',
  'ai.matrix.columns-shared':
    'In the matrix row “{row}”, its columns {columns} both stand for {level}, so no model is sent to by it.',
  'ai.matrix.table-case': 'The table has {keys}, which differ only in case: keep one.',
  'ai.matrix.table-not-class': 'The table maps {from} to {to}, which is not a classification.',
  'ai.matrix.table-same-name':
    'The table maps {from} to {to}, but {from} is already a classification of that name: remove the entry.',
  'ai.matrix.row-missing':
    '{model} uses the matrix row “{row}”, which the matrix note does not have now (or the note could not be read), so nothing is sent to it: choose it again in the model’s settings.',
  'ai.matrix.held-twice':
    '{model} is held to the matrix row “{row}”, but the matrix has that row more than once, so nothing is sent to it: correct the matrix note.',
  'ai.matrix.held-shared':
    '{model} is held to the matrix row “{row}”, but its columns {columns} both stand for {level}, so nothing is sent to it: correct the matrix note.',
  'ai.matrix.no-class': '{said}, and the matrix row {row} has no class for {level}, so it is not sent to {model}.',
  'ai.matrix.unmatched':
    'These classes of the row match no classification and are not used: {classes}. Map them in the AI models settings.',
  'ai.matrix.never': '{said}, and the matrix row {row} marks {name} never to be sent, so it is not sent to {model}.',
  'ai.matrix.unknown-mark':
    '{said}, and the matrix row {row} has for {name} something other than exactly ✅, ⚠️ or ❌, so it is not sent to {model}.',
  'ai.matrix.no-condition':
    '{said}, and the matrix row {row} allows {name} on a condition but gives no condition, so it cannot be switched on and is not sent to {model}.',
  'ai.matrix.condition-changed':
    '{said}, and the condition has changed since you switched on {name} for {model} (it is now: {condition}): read it and switch it on again to send it.',
  'ai.matrix.condition-off':
    '{said}, and the matrix row {row} allows {name} only on a condition ({condition}), and that is off for {model}: switch it on in the model’s settings to send it.',
  // what of the note is chosen to be sent (ai-scope.ts)
  'ai.scope.no-view': 'Graph {graph} has no view named {view} in this note.',
  'ai.scope.view-fault': 'View {view} cannot be sent: {why}',
  'ai.scope.view-empty': 'View {view} matches nothing, so there is nothing to send: {why}',
  'ai.scope.change-view': 'change the view',
  'ai.scope.too-large': 'This note is too large to read, so nothing of it is sent.',
  'ai.scope.empty': 'Graph {graph} has no things in this note, so there is nothing to send.',
  'ai.scope.choose': 'Choose at least one thing to send.',
  'ai.scope.missing': {
    one: '{things} is not a thing of graph {graph}.',
    other: '{things} are not things of graph {graph}.',
  },
  'ai.scope.said-whole': 'the whole graph {graph}',
  'ai.scope.said-view': 'view {view} of graph {graph}: {reading}',
  'ai.scope.said-things': {
    one: '{count} thing chosen from graph {graph}: {things}',
    other: '{count} things chosen from graph {graph}: {things}',
  },
  // why a model's answer is not changes this editor can read (ai-request.ts)
  'ai.reply.not-json': 'its reply is not JSON',
  'ai.reply.no-message': 'its reply holds no message',
  'ai.reply.no-json': 'its answer holds no JSON',
  'ai.reply.bad-json': 'the JSON in its answer cannot be read',
  'ai.reply.no-list': 'its answer has no list of changes',
  'ai.reply.no-changes': 'it proposed no changes',
  'ai.change.not-object': 'change {n} is not an object',
  'ai.change.properties':
    'change {n}: its properties are not each a one-word name with a text, a number, true or false',
  'ai.change.thing-words': 'change {n} lacks a one-word name or kind',
  'ai.change.author':
    'change {n} cannot add a Person, an Organization, a SoftwareAgent, a Model or a Step: the editor declares who proposed, and nothing a model writes can',
  'ai.change.link-words': 'change {n} lacks a one-word from, type or to',
  'ai.change.provenance':
    'change {n} cannot add a HAD_PLAN, ASSOCIATED_WITH or WAS_ATTRIBUTED_TO link: a plan is the engine’s, and the editor records who proposed and decided',
  'ai.change.set-words':
    'change {n} lacks a one-word thing or property, or a value that is a text, a number, true or false',
  'ai.change.thing-word': 'change {n} lacks a one-word thing',
  'ai.change.unknown-op':
    'change {n} is not one of the changes asked for (add-thing, add-link, set, remove-thing, remove-link)',
  // a send: prepared, shown, said yes to and sent (ai.ts)
  'ai.send.no-model': 'No model named {model} is set up.',
  'ai.send.address': '{model} cannot be sent to: {why}',
  'ai.send.no-model-name': '{model} names no model: set it in the model’s settings.',
  'ai.send.no-provider': '{model} is sent through the AI provider {provider}, which no plug-in adds.',
  'ai.send.credential':
    'What would be sent holds what looks like {held}, so nothing is sent. Leave out what holds it, or take it out of the note or the model’s address.',
  'ai.send.key-shown': '(the key named {key} in the app’s secret store)',
  'ai.summary.to-row': 'To {model} ({name}), at {address}, held to the matrix row {row}.',
  'ai.summary.to-ceiling': 'To {model} ({name}), at {address}, whose ceiling is {ceiling}.',
  'ai.summary.key': 'It is sent with the key named {key} in the app’s secret store, put in only as the request goes.',
  'ai.summary.no-key': 'No key is sent.',
  'ai.summary.from': 'From {path}. {level}.',
  'ai.summary.what': 'What is sent: {said}, and your question.',
  'ai.send.no-yes':
    'Nothing was sent: it is sent only when you say yes to exactly what you were shown, and a yes is used once, never again.',
  'ai.send.changed': 'Nothing was sent: what would be sent is not what you said yes to. Look at it again.',
  'ai.send.no-key':
    'Nothing was sent: the key named {key} is not in the app’s secret store. Choose it again in {model}’s settings.',
  'ai.send.hidden-key': '[the key]',
  'ai.send.failed': '{why} Nothing was changed.',
  'ai.send.unreachable': '{model} could not be reached at {address} ({why}).',
  'ai.send.refused': '{model} refused the request ({why}).',
  'ai.send.unread': '{model} answered, but not with changes this editor can read: {why}.',
  // whether a note may open in a pane Claude can read (claude-gate.ts)
  'ai.gate.credential': 'This note holds {held}, and a credential is never shown to Claude, so it is not opened.',
  'ai.gate.unknown':
    'This note has an unknown classification (its front matter does not give exactly one), so it counts as above every ceiling and is not opened.',
  'ai.gate.not-set':
    'This note has an unknown classification, which is not one of the classifications set ({levels}), so it counts as above every ceiling and is not opened.',
  'ai.gate.highest': '{said}, the highest classification set: it is never shown to Claude, whatever the settings.',
  'ai.gate.ask-row':
    '{said}, not cleared for Claude by its matrix row, {row}. Claude can read the pane the editor opens in.',
  'ai.gate.ask-ceiling':
    '{said}, above the level set for Claude, {level}. Claude can read the pane the editor opens in.',
} as const;
