// The data an export holds, and how each format writes it (editor spec §16, export_data_formats, export_lossless): only
// the things drawn and the links written between them, never a schema's own things or a guess; a GQL block the
// profile reads as written; CSV as RFC 4180 has it, typed by its header and safe to open in a spreadsheet; GraphML that
// XML reads as written, or a refusal where XML cannot hold a character.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { dataText, exportedData, isDataFormat } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import {
  csvRecords,
  dataOf,
  readBack,
  readCsv,
  readFaded,
  readGql,
  readGraphml,
  xmlTree,
} from './export-data-readers.js';

const INFO = { note: 'Trips/Team.md', date: '2026-10-11' };
// what a reader gives beside the things and links: nothing marked as a view's faded context
const NONE_FADED = { faded: { things: [], links: [] } };
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
    assert.deepEqual(readGql(text), { graph: 'g', ...dataOf(readNote([block]).world.g), ...NONE_FADED });
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
    assert.deepEqual(readCsv(text), { ...dataOf(readNote([block]).world.g), ...NONE_FADED });
  });

  // proves: export_lossless
  test('a text starting with a tab or a carriage return is guarded too, and read back as written', () => {
    const odd = String.raw`// graph: g
(a:A {tab: '\tx', cr: '\rx', both: '\t\r'})`;
    const csv = dataText(dataOfNote(odd, 'g'), 'csv', INFO);
    assert.deepEqual(
      csvRecords(csv)[1]
        .slice(6)
        .map((c) => c.text),
      ["'\tx", "'\rx", "'\t\r"],
    );
    assert.deepEqual(readCsv(csv), { ...dataOf(readNote([odd]).world.g), ...NONE_FADED });
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
    assert.deepEqual(readGraphml(text), { graph: 'g', ...dataOf(readNote([block]).world.g), ...NONE_FADED });
  });

  // proves: export_data_formats
  test('a day or an instant says its kind in its key’s description, gn:date or gn:datetime, in GraphML’s own terms', () => {
    const timed = dataOfNote("// graph: g\n(a:A {day: DATE '2026-10-11', at: DATETIME '2026-10-11T09:30:00Z'})", 'g');
    const root = xmlTree(dataText(timed, 'graphml', INFO));
    const key = (name) => root.children.find((c) => c.name === 'key' && c.attrs['attr.name'] === name);
    for (const [name, kind] of [
      ['day', 'gn:date'],
      ['at', 'gn:datetime'],
    ]) {
      assert.deepEqual(Object.keys(key(name).attrs).sort(), ['attr.name', 'attr.type', 'for', 'id']);
      assert.deepEqual(
        key(name).children.map((c) => [c.name, c.children.join('')]),
        [['desc', kind]],
      );
    }
    assert.ok(
      Object.keys(root.attrs).every((a) => a === 'xmlns'),
      'no namespace beyond GraphML’s own',
    );
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

describe('a view’s faded context, when it is asked for', () => {
  const r = readNote([
    `// graph: team
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(zoe:Person {name: 'Zoe'}),
(alice)-[:KNOWS]->(bob),
(bob)-[:KNOWS]->(zoe)`,
  ]);
  const view = { name: 'alice_bob', spec: { kind: 'near', id: 'alice', depth: 1 } };
  const data = exportedData(r, exportScope(r, { graph: 'team', view, context: true }));

  // proves: view_export_stays_view, export_lossless
  test('in a GQL block, each thing and link outside the view is owned by a //@ faded: line naming the view', () => {
    const text = dataText(data, 'gql', INFO);
    const lines = text.split('\n');
    const at = (code) => lines.indexOf(code);
    assert.equal(lines[at("(zoe:Person {name: 'Zoe'}),") - 1], '//@ faded: outside view alice_bob');
    assert.equal(lines[at('(bob)-[:KNOWS]->(zoe)') - 1], '//@ faded: outside view alice_bob');
    assert.equal((text.match(/^\/\/@ faded:/gm) ?? []).length, 2);
    assert.deepEqual(readFaded('gql', text), { things: ['zoe'], links: [1] });
  });

  // proves: view_export_stays_view, export_lossless
  test('in CSV, a row outside the view is of kind faded thing or faded link', () => {
    const text = dataText(data, 'csv', INFO);
    assert.deepEqual(
      csvRecords(text)
        .slice(1)
        .map((row) => row[0].text),
      ['thing', 'thing', 'faded thing', 'link', 'faded link'],
    );
    assert.deepEqual(readFaded('csv', text), { things: ['zoe'], links: [1] });
  });

  // proves: view_export_stays_view, export_lossless
  test('in GraphML, a node or edge outside the view has :faded true, a key for both, false unless said', () => {
    const text = dataText(data, 'graphml', INFO);
    const root = xmlTree(text);
    const key = root.children.find((c) => c.name === 'key' && c.attrs['attr.name'] === ':faded');
    assert.deepEqual([key.attrs.for, key.attrs['attr.type']], ['all', 'boolean']);
    assert.deepEqual(
      key.children.map((c) => [c.name, c.children.join('')]),
      [['default', 'false']],
    );
    assert.deepEqual(readFaded('graphml', text), { things: ['zoe'], links: [1] });
  });

  // proves: view_export_stays_view
  test('without the context asked for, nothing is marked, and no format names a faded key or kind', () => {
    const only = exportedData(r, exportScope(r, { graph: 'team', view }));
    for (const format of ['gql', 'csv', 'graphml']) {
      const text = dataText(only, format, INFO);
      assert.doesNotMatch(text, /faded/, format);
      assert.deepEqual(readFaded(format, text), { things: [], links: [] }, format);
    }
  });
});

describe('links written twice', () => {
  // proves: export_lossless
  test('an exact duplicate, the same ends, type and properties, is exported twice and reads back twice', () => {
    const block = `// graph: g
(a:A {name: 'A'}),
(b:B {name: 'B'}),
(a)-[:TO {w: 1}]->(b),
(a)-[:TO {w: 1}]->(b)`;
    const want = dataOf(readNote([block]).world.g);
    assert.equal(want.links.length, 2);
    assert.deepEqual(want.links[0], want.links[1]);
    for (const format of ['gql', 'csv', 'graphml'])
      assert.deepEqual(readBack(format, dataText(dataOfNote(block, 'g'), format, INFO)), want, format);
  });
});
