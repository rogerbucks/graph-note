// A block that holds only a schema, drawn in the note as the schema itself (editor spec §3, schema_drawn). Its kinds of
// thing are boxes and its relationship types are arrows between them. It is read-only, with Source to show its text. A
// block that holds data is drawn as its graph, as before. Drawing the schema writes nothing to the note.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const SCHEMA = `// graph: trip
(trip_schema:GraphMeta {graph: 'trip', schema: 'trip@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(trip_schema)-[:DECLARES]->(kind_place),
(trip_schema)-[:DECLARES]->(link_near)`;
const SHARED = `// graph: places · SCHEMA places
(places_schema:GraphMeta {graph: 'places', schema: 'places@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(places_schema)-[:DECLARES]->(kind_place)`;
const noteOf = (...blocks) => ['# Trip', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));

async function drawn(note, n) {
  const env = await load({ files: { [PATH]: note } });
  env.state.files.set(PATH, note);
  const { el } = await show(env, note, n);
  return { env, el };
}

describe('a schema block in a note', () => {
  test('is drawn as its kinds of thing, joined by its relationship types', async () => {
    const { env, el } = await drawn(noteOf(DATA, SCHEMA), 1);
    try {
      assert.deepEqual(keys(el), ['kind_place']);
      assert.match(el.querySelector('svg').textContent, /Place/);
      assert.match(el.querySelector('svg').textContent, /is near/);
    } finally {
      env.uninstall();
    }
  });

  test('is read-only, with Source to show its text, and drawing it writes nothing', async () => {
    const note = noteOf(DATA, SCHEMA);
    const { env, el } = await drawn(note, 1);
    try {
      assert.ok(labelled(el, 'Show source'), 'Source is offered');
      assert.equal(labelled(el, 'Edit here'), undefined, 'the picture is not edited in place');
      assert.equal(env.state.writes, undefined);
      assert.equal(env.state.files.get(PATH), note);
    } finally {
      env.uninstall();
    }
  });

  test('a shared schema is drawn as its kinds, not shown as code', async () => {
    const { env, el } = await drawn(noteOf(SHARED), 0);
    try {
      assert.deepEqual(keys(el), ['kind_place']);
    } finally {
      env.uninstall();
    }
  });

  test('a data block is still drawn as its graph', async () => {
    const { env, el } = await drawn(noteOf(DATA, SCHEMA), 0);
    try {
      assert.deepEqual(keys(el).sort(), ['home', 'park']);
    } finally {
      env.uninstall();
    }
  });
});
