// A graph keeps the schema version it names until its graph line changes (editor spec §27, schema_version_moves; risk
// ARCH-4). A move to a newer version is a proposed change of that line, saying what the new version adds and drops.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { schemaMove, schemaVersions } from '../src/schema-version-moves.ts';
import { STANDARD_SCHEMAS, withStandardSchemas } from '../src/standard-schemas.ts';

const DECISION_1 = STANDARD_SCHEMAS.find((s) => s.includes('SCHEMA decision@1'));

// decision@2 drops COUNTS_AGAINST and adds Risk and OPPOSES
const DECISION_2 = `// graph: decision · SCHEMA decision@2
(decision_schema:GraphMeta {graph: 'decision', schema: 'decision@2'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_reason:Meta:ElementType {name: 'Reason', kind: 'node', origin: 'source'}),
(kind_risk:Meta:ElementType {name: 'Risk', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source',
    reading: 'answers', reverse_name: 'is answered by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source',
    reading: 'favours', reverse_name: 'is favoured by'}),
(link_opposes:Meta:ElementType {name: 'OPPOSES', kind: 'edge', origin: 'source',
    reading: 'opposes', reverse_name: 'is opposed by'}),
(decision_schema)-[:DECLARES]->(kind_question),
(decision_schema)-[:DECLARES]->(kind_option),
(decision_schema)-[:DECLARES]->(kind_reason),
(decision_schema)-[:DECLARES]->(kind_risk),
(decision_schema)-[:DECLARES]->(link_answers),
(decision_schema)-[:DECLARES]->(link_favours),
(decision_schema)-[:DECLARES]->(link_opposes)`;

const READER = `// graph: reader · schema decision@1
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(heavy:Reason {title: 'Too heavy to hold'}),
(large)-[:ANSWERS]->(question),
(heavy)-[:COUNTS_AGAINST]->(large)`;

const SCHEMAS = withStandardSchemas([DECISION_2]);

describe('schema_version_moves', () => {
  test('a graph naming decision@1 is typed by decision@1 while decision@2 exists', () => {
    const r = readNote([READER], 0, SCHEMAS);
    assert.deepEqual(r.problems, []);
    const links = r.graphs.get('reader').links.map((l) => l.reading);
    assert.deepEqual(links, ['answers', 'counts against']);
  });

  test('each version of a schema there is, oldest first', () => {
    assert.deepEqual(schemaVersions('decision@1', SCHEMAS), ['decision@1', 'decision@2']);
    assert.deepEqual(schemaVersions('places@1', SCHEMAS), []);
  });

  test('moving it is a proposed change of its graph line alone, saying what the new version adds and drops', () => {
    const move = schemaMove(READER, 'decision@2', SCHEMAS);
    assert.ok(move);
    assert.equal(move.from, 'decision@1');
    assert.equal(move.to, 'decision@2');
    assert.deepEqual(move.adds, ['OPPOSES', 'Risk']);
    assert.deepEqual(move.drops, ['COUNTS_AGAINST']);
    assert.deepEqual(move.used, ['COUNTS_AGAINST'], 'the dropped types this graph uses');
    const [line, ...rest] = move.text.split('\n');
    assert.equal(line, '// graph: reader · schema decision@2');
    assert.deepEqual(rest, READER.split('\n').slice(1), 'only the graph line changes');
  });

  test('is nothing to offer for a block naming no schema, the same version, or one there is none of', () => {
    assert.equal(schemaMove('// graph: reader\n(a:Option)', 'decision@2', SCHEMAS), null);
    assert.equal(schemaMove(READER, 'decision@1', SCHEMAS), null);
    assert.equal(schemaMove(READER, 'decision@3', SCHEMAS), null);
    assert.equal(schemaMove(READER, 'places@1', [...SCHEMAS]), null);
  });

  test('the move is never made by reading: the block keeps decision@1 until a person applies the change', () => {
    schemaMove(READER, 'decision@2', SCHEMAS);
    assert.match(READER.split('\n')[0], /schema decision@1$/);
    assert.ok(DECISION_1, 'the standard decision@1 is still shipped');
  });
});
