// The words of a first graph and its tour, in UK English (editor spec §44, first_run_help; §42, words_catalogue).
// source-words.ts keeps them with every other word.

/** The words of a first graph and its tour, by key, in UK English. */
export const FIRST_RUN_SOURCE_WORDS = {
  'first-run.example': 'Start from an example',
  'first-run.not-written': 'The block has changed since it was drawn, so the example was not written.',
  'tour.title': 'A short tour',
  'tour.step': 'Step {at} of {all}',
  'tour.next': 'Next step',
  'tour.back': 'Step back',
  'tour.finish': 'Finish the tour',
  'tour.skip': 'Skip the tour',
  'tour.command': 'Show the tour',
  'tour.boxes':
    'Each box is a thing, and each arrow is a link between two things. Click or tap a box to see its details.',
  'tour.zoom': 'Zoom with the bar’s buttons, or with + and -. Fit shows the whole graph again.',
  'tour.edit': 'Press Edit to change the graph. It is drawn again as you type.',
  'tour.again': 'Press ? on a drawing to see every keyboard shortcut. The command Show the tour opens this tour again.',
} as const;
