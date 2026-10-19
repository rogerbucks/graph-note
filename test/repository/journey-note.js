// The note the first-run journey opens in every host (editor spec §41, ux_journey_auto). Its graph has a link to a
// misspelt name, so it opens with one problem to fix. Test code only.

/** The graph block: a question, an option, and a reason whose link names `larg`, a slip for `large`. */
export const GRAPH = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(large)-[:ANSWERS]->(q),
(eyes:Reason {title: 'Easy on the eyes'}),
(eyes)-[:FAVOURS]->(larg)`;

/** The block as the person edits it: a second option, answering the question. */
export const EDITED = GRAPH.replace(
  '(eyes:Reason',
  "(small:Option {name: 'Small reader'}),\n(small)-[:ANSWERS]->(q),\n(eyes:Reason",
);

/** The note: a heading and the block. */
export const NOTE = ['# Reader', '', '```gql', GRAPH, '```', ''].join('\n');

/** What the person reads, sees and uses on the way, as each host names it. */
export const SAYS = {
  question: 'Question: Which device?',
  field: 'Text of graph reader',
  fix: 'Change larg to large',
  slip: 'Estimated link: Easy on the eyes favours Large reader. Open it for why.',
};
