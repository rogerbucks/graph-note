// Notes in the data exports (editor spec §24, note_standard; graph spec req:26.plain): an export keeps each thing's
// and link's `///` note where its format has comments, and leaves it out where it has none. A GQL block keeps it as
// the `///` lines above its thing or link; GraphML as an XML comment directly before its node or edge, written so XML
// reads it back as written and its text can never end the comment; CSV, which has no comments, leaves it out. Each is
// proved by reading the export back with the strict readers of export-data-readers.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { dataText, exportedData } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import { standardBlocks } from '../src/strictness.ts';
import { dataOf, readBack, readFaded, readNotes, xmlTree } from './export-data-readers.js';

const INFO = { note: 'Trips/Team.md', date: '2026-10-11' };
const NOTED = `// graph: team
/// Leads the **team**.
///
/// Since 2020.
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
/// Joined in May.
(zoe:Person {name: 'Zoe'}),
(alice)-[:KNOWS]->(bob),
/// Met at the coast.
(bob)-[:KNOWS]->(zoe)`;
const ALL_NOTES = {
  things: [
    ['alice', 'Leads the **team**.\n\nSince 2020.'],
    ['zoe', 'Joined in May.'],
  ],
  links: [[1, 'Met at the coast.']],
};
const NONE = { things: [], links: [] };
// the same graph with its notes left out
const PLAIN = NOTED.split('\n')
  .filter((line) => !line.startsWith('///'))
  .join('\n');

const dataOfNote = (block, request = { graph: 'team' }) => {
  const r = readNote([block]);
  return exportedData(r, exportScope(r, request));
};

describe('the data an export holds', () => {
  // proves: note_standard
  test('carries each thing’s and link’s note as the reader read it, and nothing for a graph with none', () => {
    assert.deepEqual(dataOfNote(NOTED).notes, ALL_NOTES);
    assert.equal('notes' in dataOfNote(PLAIN), false);
  });

  // proves: note_standard
  test('of a view, only the notes of its things and links, a link’s by its place among the view’s links', () => {
    const view = { name: 'near_zoe', spec: { kind: 'near', id: 'zoe', depth: 1 } };
    const data = dataOfNote(NOTED, { graph: 'team', view });
    assert.deepEqual(
      data.things.map(([id]) => id),
      ['bob', 'zoe'],
    );
    assert.deepEqual(data.notes, { things: [['zoe', 'Joined in May.']], links: [[0, 'Met at the coast.']] });
  });
});

describe('a GQL block, which has comments', () => {
  // proves: note_standard
  test('keeps each note as /// lines directly above its thing or link, a bare /// its paragraph break', () => {
    const text = dataText(dataOfNote(NOTED), 'gql', INFO);
    const lines = text.split('\n');
    const at = (code) => lines.indexOf(code);
    assert.deepEqual(lines.slice(at("(alice:Person {name: 'Alice'}),") - 3, at("(alice:Person {name: 'Alice'}),")), [
      '/// Leads the **team**.',
      '///',
      '/// Since 2020.',
    ]);
    assert.equal(lines[at("(zoe:Person {name: 'Zoe'}),") - 1], '/// Joined in May.');
    assert.equal(lines[at('(bob)-[:KNOWS]->(zoe)') - 1], '/// Met at the coast.');
    assert.equal(lines[at("(bob:Person {name: 'Bob'}),") - 1], "(alice:Person {name: 'Alice'}),");
  });

  // proves: note_standard, export_lossless
  test('reads back the very notes, things and links exported', () => {
    const text = dataText(dataOfNote(NOTED), 'gql', INFO);
    assert.deepEqual(readNotes('gql', text), ALL_NOTES);
    assert.deepEqual(readBack('gql', text), dataOf(readNote([NOTED]).world.team));
  });

  // proves: note_standard, view_export_stays_view
  test('a thing of a view’s faded context keeps its note beside its //@ faded: line', () => {
    const view = { name: 'near_bob', spec: { kind: 'near', id: 'bob', depth: 1 } };
    const narrow = { name: 'just_alice', spec: { kind: 'near', id: 'alice', depth: 1 } };
    for (const v of [view, narrow]) {
      const text = dataText(dataOfNote(NOTED, { graph: 'team', view: v, context: true }), 'gql', INFO);
      assert.deepEqual(readNotes('gql', text), ALL_NOTES, v.name);
    }
    const text = dataText(dataOfNote(NOTED, { graph: 'team', view: narrow, context: true }), 'gql', INFO);
    assert.deepEqual(readFaded('gql', text), { things: ['zoe'], links: [1] });
  });
});

describe('GraphML, which has comments', () => {
  // proves: note_standard
  test('keeps each note as an XML comment on the line directly before its node or edge', () => {
    const text = dataText(dataOfNote(NOTED), 'graphml', INFO);
    const lines = text.split('\n');
    const first = lines.findIndex((l) => l.includes('<node id="n1">'));
    assert.deepEqual(lines.slice(first - 3, first), ['    <!-- Leads the **team**.', '', 'Since 2020. -->']);
    const zoe = lines.findIndex((l) => l.includes('<node id="n3">'));
    assert.equal(lines[zoe - 1], '    <!-- Joined in May. -->');
    const edges = lines.flatMap((l, i) => (l.includes('<edge ') ? [i] : []));
    assert.equal(lines[(edges[1] ?? 0) - 1], '    <!-- Met at the coast. -->');
    assert.notEqual(lines[(edges[0] ?? 0) - 1].trim().slice(0, 4), '<!--');
  });

  // proves: note_standard, export_lossless
  test('reads back the very notes, things and links exported', () => {
    const text = dataText(dataOfNote(NOTED), 'graphml', INFO);
    assert.deepEqual(readNotes('graphml', text), ALL_NOTES);
    assert.deepEqual(readBack('graphml', text), dataOf(readNote([NOTED]).world.team));
  });

  // proves: note_standard, export_lossless
  test('a hostile note — -->, <!--, runs of -, a - at its end, backslashes, a carriage return, a control character — stays inside its comment and reads back as written', () => {
    const bell = String.fromCharCode(7),
      cr = '\r';
    const hostile = [
      '--><node id="x"/><!-- a -- b --- c -',
      String.raw`\ back\slash \- \r \u{41} ]]> &amp; <tag> "q"`,
      `bell${bell} and a carriage${cr}return -`,
    ];
    const block = `// graph: team
${hostile.map((l) => `/// ${l}`).join('\n')}
(alice:Person {name: 'Alice'}),
/// -
(bob:Person {name: 'Bob'}),
/// <!--
(alice)-[:KNOWS]->(bob)`;
    const data = dataOfNote(block);
    const want = {
      things: [
        ['alice', hostile.join('\n')],
        ['bob', '-'],
      ],
      links: [[0, '<!--']],
    };
    assert.deepEqual(data.notes, want, 'the reader reads the notes as written');
    const text = dataText(data, 'graphml', INFO);
    // the strict reader refuses -- inside a comment, a - at its end, a raw control character and anything outside a
    // comment that is not GraphML, so a note that escaped its comment would fail here
    assert.deepEqual(readNotes('graphml', text), want);
    assert.deepEqual(readBack('graphml', text), dataOf(readNote([block]).world.team));
    const graph = xmlTree(text).children.find((c) => c.name === 'graph');
    assert.deepEqual(
      graph.children.filter((c) => typeof c === 'object' && 'name' in c).map((c) => c.name),
      ['desc', 'node', 'node', 'edge'],
      'no node or edge but those exported',
    );
    assert.equal(text.includes(bell), false, 'a control character is never written raw');
    assert.equal(text.includes(cr), false, 'nor a carriage return, which XML would make a line feed');
  });

  // proves: note_standard
  test('with no notes, no comment is written', () => {
    assert.doesNotMatch(dataText(dataOfNote(PLAIN), 'graphml', INFO), /<!--/);
  });
});

describe('CSV, which has no comments', () => {
  // proves: note_standard
  test('leaves every note out: the export is byte for byte the export of the graph without them', () => {
    const text = dataText(dataOfNote(NOTED), 'csv', INFO);
    assert.equal(text, dataText(dataOfNote(PLAIN), 'csv', INFO));
    assert.doesNotMatch(text, /Leads|Joined|coast/);
    assert.deepEqual(readNotes('csv', text), NONE);
    assert.deepEqual(readBack('csv', text), dataOf(readNote([NOTED]).world.team));
  });
});

describe('the GQL an engine is given', () => {
  // proves: note_standard
  test('keeps every /// line where it is written, so each note is still above its thing or link', () => {
    const { blocks, left } = standardBlocks([NOTED]);
    assert.deepEqual(left, []);
    assert.deepEqual(blocks, [NOTED]);
    assert.deepEqual(
      gs.notes(blocks[0]).notes.map((n) => [n.element, n.text]),
      gs.notes(NOTED).notes.map((n) => [n.element, n.text]),
    );
  });
});
