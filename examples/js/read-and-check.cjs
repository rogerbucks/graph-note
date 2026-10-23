// Reads a graph block and checks it against the graph spec's rules, with the JavaScript library (risk API-12).
// Run: node examples/js/read-and-check.cjs. It prints each rule with ✓ or ✗, and exits 1 if any fails.
const C = require('../../packages/graph-spec');

const block = `// graph: reader
INSERT (q:Question {id: 'q', title: 'Which device?'}),
       (large:Option {id: 'large', name: 'Large reader'}),
       (large)-[:ANSWERS]->(q)`;

const world = C.worldFromStore(C.read([block]));
const verdicts = C.check(world, 'reader');
for (const [rule, ok] of verdicts) console.log(`${ok ? '✓' : '✗'} ${rule}`);
process.exitCode = verdicts.every(([, ok]) => ok) ? 0 : 1;
