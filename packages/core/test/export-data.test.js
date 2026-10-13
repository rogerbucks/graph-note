// The data an export holds, and how each format writes it (editor spec §16, export_data_formats, export_lossless): only
// the things drawn and the links written between them, never a schema's own things or a guess; a GQL block the
// profile reads as written; CSV as RFC 4180 has it, typed by its header and safe to open in a spreadsheet; GraphML that
// XML reads as written, or a refusal where XML cannot hold a character.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { dataText, exportedData, isDataFormat } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import { csvRecords, dataOf, readCsv, readGql, readGraphml, xmlTree } from './export-data-readers.js';

const INFO = { note: 'Trips/Team.md', date: '2026-10-11' };
const dataOfNote = (block, graph) => {
  const r = readNote([block]);
  return exportedData(r, exportScope(r, { graph }));
};

describe('what the data holds', () => {
  // proves: export_lossless
  test('the things drawn and the links written between them: never a schema’s own things, nor a guess', () => {
    const r = readNote([
      `// graph: team
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(t1:Meta:ElementType {name: 'Person', kind: 'node'}),
(alice)-[:KNOWS]->(bob),
(alice)-[:KNOWS]->(t1),
(bob)-[:KNWOS]->(alice),
(bob)-[:KNOWS]->(alicee)`,
    ]);
    const data = exportedData(r, exportScope(r, { graph: 'team' }));
    assert.deepEqual(
      data.things.map(([id]) => id),
      ['alice', 'bob'],
    );
    assert.deepEqual(
      data.links.map(([from, type, to]) => [from, type, to]),
      [
        ['alice', 'KNOWS', 'bob'],
        ['bob', 'KNWOS', 'alice'],
      ],
      'a link to a schema’s thing is left out; a near-miss type is kept as written, never as guessed',
    );
    assert.equal(data.graph, 'team');
  });

  // proves: export_data_formats
  test('the formats are told from the image formats, and a format no export writes is refused', () => {
    assert.deepEqual(['gql', 'csv', 'graphml', 'svg', 'png', 'json'].map(isDataFormat), [
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    assert.throws(() => dataText(dataOfNote("// graph: g\n(a:A {name: 'A'})", 'g'), 'json', INFO), /json/);
  });
});

describe('a GQL block', () => {
  // proves: export_data_formats
  test('names its graph, says where it came from in a comment, and writes one thing or link to a line', () => {
    const text = dataText(dataOfNote("// graph: g\n(a:A {name: 'A'}),\n(b:B),\n(a)-[:TO]->(b)", 'g'), 'gql', INFO);
    const lines = text.split('\n');
    assert.equal(lines[0], '// graph: g');
    assert.match(lines[1], /^\/\/ .*Trips\/Team\.md.*11 Oct 2026/);
    assert.deepEqual(lines.slice(2), ["(a:A {name: 'A'}),", '(b:B),', '(a)-[:TO]->(b)', '']);
  });

  // proves: export_lossless
  test('an id that is not a name, or is a word the profile keeps, is written in full under a name of its own', () => {
    const block = String.raw`// graph: g
(x:A {id: 'two words'}),
(insert:A),
(thing_1:A),
(y {id: 'y'}),
(x)-[:TO]->(insert)`;
    const text = dataText(dataOfNote(block, 'g'), 'gql', INFO);
    assert.match(text, /\{id: 'two words'\}/);
    assert.match(text, /\{id: 'insert'\}/);
    assert.doesNotMatch(text, /\(insert[:\s)]/i, 'a word the reader keeps is never a name');
    assert.match(text, /^\(y \{id: 'y'\}\),$/m, 'a thing with no kind and nothing else keeps its id, so it is written');
    assert.deepEqual(readGql(text), { graph: 'g', ...dataOf(readNote([block]).world.g) });
  });

  // proves: export_lossless
  test('a line break in the note’s path never starts a line of code', () => {
    const text = dataText(dataOfNote("// graph: g\n(a:A {name: 'A'})", 'g'), 'gql', { ...INFO, note: 'a\n(b:B)\r.md' });
    assert.equal(readGql(text).things.length, 1);
  });
});

describe('CSV', () => {
  const block = String.raw`// graph: g
(a:A:B {name: 'A, with "quotes"', size: 3, blank: '', formula: '=1+1', also: '-2', at: '@x', plus: '+1', tick: '\'x'}),
(b:B {size: 'large', yes: TRUE, day: DATE '2026-10-11', when: DATETIME '2026-10-11T09:30:00+01:00'}),
(a)-[:TO {note: 'two\nlines'}]->(b)`;
  const text = dataText(dataOfNote(block, 'g'), 'csv', INFO);
  const records = csvRecords(text);

  // proves: export_data_formats
  test('one table: a header naming each property with the kind of its values, a row for each thing, then each link', () => {
    assert.deepEqual(
      records[0].map((c) => c.text),
      [
        'kind',
        'id',
        'labels',
        'from',
        'type',
        'to',
        'name:text',
        'size:number',
        'blank:text',
        'formula:text',
        'also:text',
        'at:text',
        'plus:text',
        'tick:text',
        'size:text',
        'yes:boolean',
        'day:date',
        'when:datetime',
        'note:text',
      ],
    );
    assert.deepEqual(
      records.slice(1).map((r) => r.slice(0, 6).map((c) => c.text)),
      [
        ['thing', 'a', 'A;B', '', '', ''],
        ['thing', 'b', 'B', '', '', ''],
        ['link', '', '', 'a', 'TO', 'b'],
      ],
    );
    // csvRecords ends a record only at CRLF, so a line break inside a quoted cell stays in it
    assert.ok(text.endsWith('\r\n'));
    assert.equal(records[3].at(-1).text, 'two\nlines');
  });

  // proves: export_lossless
  test('an empty text is quoted, so it is told from a property the row does not have', () => {
    const a = records[1],
      b = records[2];
    assert.deepEqual(a[8], { text: '', quoted: true });
    assert.deepEqual(b[8], { text: '', quoted: false });
  });

  // proves: export_lossless
  test('a text a spreadsheet would run as a formula is guarded by an apostrophe, and read back without it', () => {
    const cells = records[1].map((c) => c.text);
    assert.deepEqual(cells.slice(9, 14), ["'=1+1", "'-2", "'@x", "'+1", "''x"]);
    assert.deepEqual(readCsv(text), dataOf(readNote([block]).world.g));
  });
});

describe('GraphML', () => {
  const block = String.raw`// graph: g
(a:A:B {id: 'a <&> "b"', name: 'x\r\ny', pad: '  both  ', n: 2.5, yes: FALSE, day: DATE '2026-10-11'}),
(b:B),
(a)-[:TO {w: 1}]->(b)`;
  const text = dataText(dataOfNote(block, 'g'), 'graphml', INFO);

  // proves: export_data_formats
  test('a directed graph named as the graph is, with a key for each property and the kind of its values', () => {
    const root = xmlTree(text);
    assert.equal(root.name, 'graphml');
    const keys = root.children.filter((c) => c.name === 'key').map((k) => k.attrs);
    const named = (n, f) => keys.find((k) => k['attr.name'] === n && k.for === f);
    assert.equal(named(':id', 'node')['attr.type'], 'string');
    assert.equal(named(':labels', 'node')['attr.type'], 'string');
    assert.equal(named(':type', 'edge')['attr.type'], 'string');
    assert.equal(named('n', 'node')['attr.type'], 'double');
    assert.equal(named('yes', 'node')['attr.type'], 'boolean');
    assert.equal(named('day', 'node')['attr.type'], 'string');
    assert.equal(named('w', 'edge')['attr.type'], 'double');
    const graph = root.children.find((c) => c.name === 'graph');
    assert.deepEqual([graph.attrs.id, graph.attrs.edgedefault], ['g', 'directed']);
    // GraphML names a node by an NMTOKEN, so a thing is named by its place and its id is data
    assert.ok(graph.children.filter((c) => c.name === 'node').every((n) => /^n\d+$/.test(n.attrs.id)));
  });

  // proves: export_lossless
  test('XML’s marks, a carriage return and spaces at either end are written so XML reads them back as written', () => {
    assert.deepEqual(readGraphml(text), { graph: 'g', ...dataOf(readNote([block]).world.g) });
  });

  // proves: export_lossless
  test('a text holding a character XML cannot hold is refused, naming the thing and the property: nothing is lost', () => {
    const bad = dataOfNote("// graph: g\n(a:A {name: 'A', bell: 'ring\\bring'})", 'g');
    assert.throws(
      () => dataText(bad, 'graphml', INFO),
      (e) => /\ba\b/.test(e.message) && /\bbell\b/.test(e.message) && /GQL/.test(e.message) && /CSV/.test(e.message),
    );
    // the other two formats hold it
    for (const format of ['gql', 'csv'])
      assert.equal(readCsvOrGql(format, dataText(bad, format, INFO)).things[0][2].bell, 'ring\bring');
  });
});

const readCsvOrGql = (format, text) => (format === 'csv' ? readCsv(text) : readGql(text));
