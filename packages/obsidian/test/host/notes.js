// What every test of the plugin on the page needs. A graph block fenced as a note writes it. A control found by the
// label it is named by, as a screen reader finds it.

/** A gql block, fenced as a note holds it. */
export const fence = (t) => '```gql\n' + t + '\n```';

/** The button inside `el` named `label`. */
export const labelled = (el, label) =>
  el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
