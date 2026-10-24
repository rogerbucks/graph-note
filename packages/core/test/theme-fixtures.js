// What the theme tests share (editor spec §36): a theme graph with a base theme and two that extend it, and a
// knowledge graph. Test support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';

export const THEMES = `// graph: themes
(base:Theme {name: 'Base'}),
(blue:Theme {name: 'Blue'}),
(green:Theme {name: 'Green'}),
(blue)-[:EXTENDS]->(base),
(green)-[:EXTENDS]->(base),
(base_person:ThemeRule {applies: 'Person', part: 'fill', value: '#eeeeee'}),
(base_outline:ThemeRule {applies: 'Person', part: 'outline', value: '#333333'}),
(blue_person:ThemeRule {applies: 'Person', part: 'fill', value: '#ccddff'}),
(green_person:ThemeRule {applies: 'Person', part: 'fill', value: '#ccffcc'}),
(green_plan:ThemeRule {thing: 'plan', part: 'outline', value: '#006600'}),
(base)-[:HAS_RULE]->(base_person),
(base)-[:HAS_RULE]->(base_outline),
(blue)-[:HAS_RULE]->(blue_person),
(green)-[:HAS_RULE]->(green_person),
(green)-[:HAS_RULE]->(green_plan)`;

export const KNOWLEDGE = `// graph: work
(ann:Person {name: 'Ann'}),
(plan:Plan {name: 'The plan'}),
(ann)-[:OWNS]->(plan)`;

/** The world of the two blocks, as the reader reads a note holding both. */
export const worldOf = (...blocks) => gs.worldFromStore(gs.read(blocks));
