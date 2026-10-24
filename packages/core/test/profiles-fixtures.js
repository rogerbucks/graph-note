// What the profile tests share (editor spec §39): Roger's personal layer, with two profiles that compose, and a work
// graph with things due. Test support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';

export const PERSONAL = `// graph: personal
(everyday:Profile {owner: 'roger', density: 'compact', chunk: 5, cues: 'icons'}),
(evenings:Profile {owner: 'roger', pacing: 'calm', reminders: 'firm'})`;

export const WORK = `// graph: work
(report:Task {name: 'Send the report', due: '2026-10-20'}),
(review:Task {name: 'Review the plan', due: '2026-10-23'}),
(filed:Task {name: 'File the taxes', due: '2026-10-01', done: TRUE}),
(later:Task {name: 'Book the venue', due: '2026-12-01'})`;

/** The world of some blocks, as the reader reads a note holding them. */
export const worldOf = (...blocks) => gs.worldFromStore(gs.read(blocks));
