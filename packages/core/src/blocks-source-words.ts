// The words of the note's own blocks in the Obsidian host, in UK English (editor spec §42, words_catalogue). They are
// said on the cards of a graph, a view, a proposal and a graph drawn from elsewhere. A command that finds no note to
// change says them too. source-words.ts keeps them with every other word.

/** The words of the note's blocks, by key, in UK English. */
export const BLOCKS_SOURCE_WORDS = {
  'blocks.note-gone': 'The note is not there any more, so nothing was written.',
  'blocks.changed': 'The block has changed since it was drawn, so nothing was written.',
  'blocks.engine-failed':
    'The drawing engine could not start, so this graph is shown as text. Any drawing generated earlier in this note may be stale.',
  'blocks.not-on-page':
    'This drawing is not on the page yet, so it cannot be edited here; edit it in the pane instead.',
  'blocks.edit-gone':
    'This note is not there any more: it was renamed, moved or deleted. Open it again to edit it here.',
  'blocks.edit-failed': 'This block could not be opened to edit it here: {why}.',
  'blocks.step-gone': 'it is not in the note any more',
  'blocks.style-failed': 'The style could not be written: {why}',
  'blocks.view-note-gone': 'the note is not there any more',
  'blocks.view-edit': 'Change the view in its block in the note: its query picks the things it shows.',
  'blocks.view-refused': 'This view cannot be drawn: {why}',
  'blocks.view-empty': 'View {name} matches nothing. {why}',
  'blocks.view-change': 'Change the view',
  'blocks.view-hides': 'View {name} now hides what is outside it.',
  'blocks.view-fades': 'View {name} now fades what is outside it.',
  'blocks.view-saved': 'Saved how view {name} is shown.',
  'blocks.view-failed': 'View {name} could not be drawn, so its query is shown.',
  'blocks.rewrite-no-note': 'The pane in front holds no note: open a note {to}.',
  'blocks.rewrite-reading':
    'This note is shown in reading view, which never changes it: switch to Live Preview or Source mode {to}.',
  'blocks.rewrite-moved': 'The pane in front changed meanwhile, so nothing was written: open the note again {to}.',
  'blocks.proposal-edit': 'Read and change the change set in its block in the note.',
  'blocks.proposal-refused': 'This change set cannot be shown: {why}',
  'blocks.proposal-read-only': 'This note is only being read here, so nothing was decided.',
  'blocks.proposal-note-gone': 'The note is not there any more, so nothing was decided.',
  'blocks.proposal-not-decided': 'Nothing was decided: {why}',
  'blocks.proposal-gone': 'the change set is no longer in the note as this card was drawn',
  'blocks.proposal-changed':
    'the change set has changed since this card was drawn: it is drawn again from the note as it is',
  'blocks.proposal-changes': { one: '{count} change', other: '{count} changes' },
  'blocks.proposal-accepted': 'Accepted {changes}: written into the graph. Undo takes them back.',
  'blocks.proposal-rejected': 'Rejected {changes}: the graph is unchanged, and the note’s judgement graph records it.',
  'blocks.proposal-undone': 'Undone: the note is as it was before the last decision.',
  'blocks.proposal-no-graph':
    'Graph {graph} has nothing to draw in this note, so the proposal is listed without a drawing.',
  'blocks.proposal-failed': 'Proposal {id} could not be drawn, so its change set is shown.',
  'blocks.source-strip': 'Drawn from the {kind} {name}, read where it is written: change the graph there.',
  'blocks.source-strip-plugin':
    'Drawn from the plug-in source {name}, read each time from the plug-in: change the graph where the plug-in keeps it.',
  'blocks.source-open': 'Open {name}',
  'blocks.source-refused': 'Graph {graph} cannot be drawn from elsewhere: {why}.',
  'blocks.source-block-refused': 'This block cannot be drawn: {why}.',
  'blocks.source-none': 'it names no source',
  'blocks.source-empty': 'Graph {graph} has nothing in it yet where it is written.',
  'blocks.source-engine-failed': 'The drawing engine could not start, so this graph is shown as text.',
} as const;
