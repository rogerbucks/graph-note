// The standard schemas a graph can name with its version, so a note needs no schema of its own (editor spec §27,
// standard_schemas), and the warning when a graph names a schema there is none of (schema_named_found).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { STANDARD_SCHEMAS, withStandardSchemas } from '../src/standard-schemas.ts';

const DECISION = `// graph: reader · schema decision@1
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large)`;

const PLACES_1 = `// graph: places · SCHEMA places@1
(places_schema:GraphMeta {graph: 'places', schema: 'places@1'}),
(kind_place:Meta:ElementType {name: 'Place', kind: 'node', origin: 'source'}),
(link_near:Meta:ElementType {name: 'NEAR', kind: 'edge', origin: 'source', reading: 'is near', reverse_name: 'is near'}),
(places_schema)-[:DECLARES]->(kind_place),
(places_schema)-[:DECLARES]->(link_near)`;

const trip = (name) => `// graph: trip · schema ${name}
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;

const missing = (r) => r.problems.filter((p) => /is not in the vault/.test(p.message));

describe('the standard schemas', () => {
  test('each is a shared schema named with its version, read with no problems, its GraphMeta naming the same', () => {
    assert.ok(STANDARD_SCHEMAS.length > 0);
    for (const s of STANDARD_SCHEMAS) {
      const name = /SCHEMA\s+(\S+)/.exec(s)?.[1] ?? '';
      assert.match(name, /^[a-z_]+@\d+$/, s.split('\n')[0]);
      const r = readNote([], -1, [s]);
      assert.deepEqual(r.problems, [], name);
      assert.ok(s.includes(`schema: '${name}'`), `${name}: its GraphMeta names the same schema`);
    }
  });

  test('a graph naming decision@1 is typed by it with no schema in the note or the vault', () => {
    const r = readNote([DECISION], 0, withStandardSchemas([]));
    assert.deepEqual(r.problems, []);
    const links = r.graphs.get('reader').links.map((l) => l.reading);
    assert.deepEqual(links, ['answers', 'favours']);
  });

  test('are read for a graph that names one even when the caller holds no vault, as a host that cannot see one', () => {
    const r = readNote([DECISION]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(
      r.graphs.get('reader').links.map((l) => l.reading),
      ['answers', 'favours'],
    );
  });

  test('a vault schema of the same name and version is used in place of the standard one, never both', () => {
    const own = STANDARD_SCHEMAS.find((s) => s.includes('SCHEMA decision@1')).replace("'favours'", "'speaks for'");
    const shared = withStandardSchemas([own]);
    assert.equal(shared.filter((s) => /SCHEMA\s+decision@1\b/.test(s)).length, 1);
    const r = readNote([DECISION], 0, shared);
    assert.deepEqual(
      r.graphs.get('reader').links.map((l) => l.reading),
      ['answers', 'speaks for'],
    );
  });
});

describe('a graph that names a schema there is none of', () => {
  test('is warned, saying which versions of that schema there are, with the fix to name one', () => {
    const r = readNote([trip('places@2')], 0, [PLACES_1]);
    const [p] = missing(r);
    assert.ok(p, 'a warning');
    assert.equal(p.severity, 'warning');
    assert.equal(p.graph, 'trip');
    assert.equal(p.line, 1);
    assert.match(p.message, /places@2 is not in the vault or the standard schemas/);
    assert.match(p.fix, /places@1/);
    assert.deepEqual(p.replace, { written: 'places@2', with: ['places@1'] });
    assert.deepEqual(p.span, { line: 0, character: 24, end: 32 });
  });

  test('with no version of it anywhere, says how to add it', () => {
    const [p] = missing(readNote([trip('rooms@1')], 0, [PLACES_1]));
    assert.match(p.message, /rooms@1 is not in the vault or the standard schemas/);
    assert.match(p.fix, /SCHEMA rooms@1/);
    assert.equal(p.replace, undefined);
  });

  test('is not warned when the schema it names is there, in the vault or among the standard ones', () => {
    assert.deepEqual(missing(readNote([trip('places@1')], 0, [PLACES_1])), []);
    assert.deepEqual(missing(readNote([DECISION], 0, withStandardSchemas([]))), []);
  });

  test('is not warned by a caller that holds no vault: it cannot know what the vault has', () => {
    assert.deepEqual(missing(readNote([trip('places@2')])), []);
  });

  test('is warned once, on the first block that names it', () => {
    const r = readNote([trip('places@2'), trip('places@2')], 1, [PLACES_1]);
    assert.deepEqual(
      missing(r).map((p) => p.block),
      [0],
    );
  });
});
