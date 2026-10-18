// A block that holds only a schema, drawn as the schema itself (editor spec §3, schema_drawn). Each kind of thing is a
// box, and each relationship type an arrow from the kinds it joins in the data. A type the data does not use is a box
// of its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { schemaPicture } from '../src/schema-picture.ts';

const DATA = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(ann:Person {name: 'Ann'}),
(home)-[:NEAR]->(park),
(ann)-[:LIVES_AT]->(home)`;

const SCHEMA = `// graph: trip · SOURCE
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(link_lives:Meta:ElementType {name: 'LIVES_AT', kind: 'edge', origin: 'source', reading: 'lives at', reverse_name: 'is home to'}),
(link_visits:Meta:ElementType {name: 'VISITS', kind: 'edge', origin: 'source', reading: 'visits', reverse_name: 'is visited by'}),
(trip_schema)-[:DECLARES]->(kind_place),
(trip_schema)-[:DECLARES]->(kind_person),
(trip_schema)-[:DECLARES]->(link_near),
(trip_schema)-[:DECLARES]->(link_lives),
(trip_schema)-[:DECLARES]->(link_visits)`;

const SHARED = `// graph: places · SCHEMA places
(places_schema:GraphMeta {graph: 'places', schema: 'places@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(places_schema)-[:DECLARES]->(kind_place),
(places_schema)-[:DECLARES]->(link_near)`;

const drawingOf = (picture) => picture?.reading.graphs.get(picture.graph);

describe('a schema block drawn as the schema itself', () => {
  test('each kind of thing is a box, named by the kind and keyed by its declaration', () => {
    const d = drawingOf(schemaPicture([DATA, SCHEMA], 1));
    assert.ok(d, 'the schema block has a picture');
    const kinds = d.boxes.filter((b) => b.kind === 'Kind');
    assert.deepEqual(kinds.map((b) => [b.key, b.text]).sort(), [
      ['kind_person', 'Person'],
      ['kind_place', 'Place'],
    ]);
  });

  test('each relationship type is an arrow from the kinds it joins in the data, read by its reading', () => {
    const d = drawingOf(schemaPicture([DATA, SCHEMA], 1));
    const links = d.links.map((l) => [l.from, l.type, l.reading, l.to]).sort();
    assert.deepEqual(links, [
      ['kind_person', 'LIVES_AT', 'lives at', 'kind_place'],
      ['kind_place', 'NEAR', 'is near', 'kind_place'],
    ]);
  });

  test('a relationship type the data does not use yet is a box of its own, said so', () => {
    const d = drawingOf(schemaPicture([DATA, SCHEMA], 1));
    const unused = d.boxes.filter((b) => b.kind === 'Relationship');
    assert.deepEqual(
      unused.map((b) => [b.key, b.text]),
      [['link_visits', 'visits (not used yet)']],
    );
  });

  test('the picture is a sound graph of its own: read with no problems, its schema left out of the drawing', () => {
    const p = schemaPicture([DATA, SCHEMA], 1);
    assert.deepEqual(p.reading.problems, []);
    assert.equal(p.graph, 'trip');
    assert.ok(!drawingOf(p).boxes.some((b) => /ElementType|GraphMeta/.test(b.kind)));
  });

  test('a shared schema is drawn too: its kinds as boxes, and its relationship types, with no data, as boxes', () => {
    const d = drawingOf(schemaPicture([SHARED], 0));
    assert.deepEqual(d.boxes.map((b) => [b.kind, b.text]).sort(), [
      ['Kind', 'Place'],
      ['Relationship', 'is near (not used yet)'],
    ]);
    assert.deepEqual(d.links, []);
  });

  test('a block that holds data, or data and its schema together, is drawn as the graph: no picture', () => {
    assert.equal(schemaPicture([DATA, SCHEMA], 0), null);
    assert.equal(schemaPicture([`${DATA},\n${SCHEMA.split('\n').slice(1).join('\n')}`], 0), null);
  });

  test('a schema block that cannot be read whole is left to be drawn as it is, with its problems: no picture', () => {
    assert.equal(schemaPicture([DATA, SCHEMA.replace("{name: 'Place',", "{name: 'Place,")], 1), null);
    assert.equal(schemaPicture([DATA, SCHEMA + ',\n(broken'], 1), null);
  });

  test('a block with no schema in it, and one past the end, have no picture', () => {
    assert.equal(schemaPicture(['// graph: fresh'], 0), null);
    assert.equal(schemaPicture([DATA], 3), null);
  });

  test('a picture id never takes a name the schema already uses', () => {
    const clash = SCHEMA.replace('(trip_schema:GraphMeta', '(picture_meta:GraphMeta').replaceAll(
      '(trip_schema)',
      '(picture_meta)',
    );
    const p = schemaPicture([DATA, clash], 1);
    assert.deepEqual(p.reading.problems, []);
    assert.equal(drawingOf(p).boxes.length, 3);
  });
});
