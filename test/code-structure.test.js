// The code's structure is a graph (editor spec §43, structure_checked): each part of requirements/architecture.gql cut
// into areas, each naming its files. Every shipped file of such a part is in exactly one area, and no area is over its
// ceiling. The Architecture page draws the areas and the imports between them. Pure: the real files are read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  globToRegExp,
  readStructure,
  repoFiles,
  structureChart,
  structureFacts,
  structureProblems,
  structureTable,
} from '../scripts/code-structure.mjs';
import { read } from './repository/repo.js';

const ARCHITECTURE = read('requirements/architecture.gql');

/** A small architecture: one part with two areas, and one part left whole. */
const SMALL = `// graph: project_architecture · SOURCE
(core:Layer {order: 1, name: 'Core'}),
(apps:Layer {order: 2, name: 'Apps'}),
(a_part:Part {name: 'A', path: 'packages/a'}),
(b_part:Part {name: 'B', path: 'packages/b'}),
(a_read:Area {name: 'Reading', section: '3', does: 'Reads.', files: 'packages/a/src/read*.ts'}),
(a_draw:Area {name: 'Drawing', section: '3', does: 'Draws.', files: 'packages/a/src/draw/**', most: 2}),
(a_part)-[:IN_LAYER]->(core),
(b_part)-[:IN_LAYER]->(apps),
(a_read)-[:PART_OF]->(a_part),
(a_draw)-[:PART_OF]->(a_part)`;

const FILES = {
  'packages/a/src/read.ts': "import { box } from './draw/box.ts';",
  'packages/a/src/reader.ts': "import { read } from './read.ts';",
  'packages/a/src/draw/box.ts': "import { reader } from '../reader.ts';",
  'packages/a/src/draw/deep/line.ts': 'export const line = 1;',
  'packages/a/test/read.test.js': "import '../src/read.ts';",
  'packages/b/src/anything.ts': 'export const b = 1;',
};
const readSmall = (f) => FILES[f];

describe('the structure graph', () => {
  test('reads each part with its areas, closest folder first, and a glob as a pattern', () => {
    const { parts, areas } = readStructure(SMALL);
    assert.deepEqual(
      parts.map((p) => [p.id, p.areas.map((a) => a.id)]),
      [
        ['a_part', ['a_read', 'a_draw']],
        ['b_part', []],
      ],
    );
    assert.equal(areas.find((a) => a.id === 'a_draw').most, 2);
    assert.equal(areas.find((a) => a.id === 'a_read').most, 40);
    assert.ok(globToRegExp('packages/a/src/draw/**').test('packages/a/src/draw/deep/line.ts'));
    assert.ok(globToRegExp('packages/a/src/*-words.ts').test('packages/a/src/ai-words.ts'));
    assert.ok(!globToRegExp('packages/a/src/*-words.ts').test('packages/a/src/deep/ai-words.ts'));
  });

  test('passes files each in one area, leaves tests and a part without areas alone', () => {
    assert.deepEqual(structureProblems(readStructure(SMALL), Object.keys(FILES)), []);
  });

  test('reports a file in no area, a file in two, an area over its ceiling, matching no file or in no part', () => {
    const loose = structureProblems(readStructure(SMALL), [...Object.keys(FILES), 'packages/a/src/other.ts']);
    assert.match(loose.join('\n'), /packages\/a\/src\/other\.ts: in no area of a_part/);
    const twice = readStructure(
      SMALL.replace("files: 'packages/a/src/draw/**'", "files: 'packages/a/src/draw/** packages/a/src/read.ts'"),
    );
    assert.match(structureProblems(twice, Object.keys(FILES)).join('\n'), /read\.ts: in more than one area/);
    const crowded = structureProblems(readStructure(SMALL), [...Object.keys(FILES), 'packages/a/src/draw/more.ts']);
    assert.match(crowded.join('\n'), /a_draw: 3 files, over its ceiling of 2/);
    const empty = readStructure(SMALL.replace("files: 'packages/a/src/draw/**'", "files: 'packages/a/src/nothing/**'"));
    assert.match(structureProblems(empty, Object.keys(FILES)).join('\n'), /a_draw: the area matches no file/);
    const homeless = readStructure(SMALL.replace(',\n(a_draw)-[:PART_OF]->(a_part)', ''));
    assert.match(structureProblems(homeless, Object.keys(FILES)).join('\n'), /a_draw: the area is in no built part/);
    const mute = readStructure(SMALL.replace("does: 'Draws.', ", ''));
    assert.match(structureProblems(mute, Object.keys(FILES)).join('\n'), /a_draw: say what the area does/);
  });

  test('counts each area, the imports between areas and the pairs that import each other', () => {
    const [fact] = structureFacts(readStructure(SMALL), Object.keys(FILES), readSmall);
    assert.equal(fact.part, 'a_part');
    assert.deepEqual(
      fact.areas.map((a) => [a.id, a.files, a.lines]),
      [
        ['a_read', 2, 2],
        ['a_draw', 2, 2],
      ],
    );
    assert.deepEqual(fact.edges, [
      { from: 'a_read', to: 'a_draw', count: 1 },
      { from: 'a_draw', to: 'a_read', count: 1 },
    ]);
    assert.deepEqual(fact.cycles, [['a_draw', 'a_read']]);
  });

  test('draws the areas as ThoughtKnot draws a graph, and lists them with their ceilings and cycles', () => {
    const [fact] = structureFacts(readStructure(SMALL), Object.keys(FILES), readSmall);
    const chart = structureChart(fact);
    assert.match(chart, /a_read\["Reading<br\/><i>:Area<\/i> · 2 files"\]/);
    assert.match(chart, /a_read -->\|1\| a_draw/);
    const table = structureTable(fact);
    assert.match(table, /\| Drawing \| Draws\. \| §3 \| 2 \| 2 \| 2 \|/);
    assert.match(table, /- Drawing ↔ Reading/);
  });

  test('the repository as committed has every shipped file of the core and the display layer in one area', () => {
    assert.deepEqual(structureProblems(readStructure(ARCHITECTURE), repoFiles()), []);
  });

  test('the display shell imports no other area of the display layer: the panels build on it, never the other way', () => {
    const files = repoFiles();
    const facts = structureFacts(readStructure(ARCHITECTURE), files, read);
    const display = facts.find((f) => f.part === 'display_part');
    assert.deepEqual(
      display.edges.filter((e) => e.from === 'display_shell').map((e) => e.to),
      [],
    );
  });
});
