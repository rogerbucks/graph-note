// Importing from a database (editor spec §20, db_import_on_request; §21, settings_db_connections): which vault files
// are databases, and the block an import writes. The host runs the query; these are the core's decisions.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { importedBlock, isDbFile, withImport } from '../src/db-import.ts';

const INFO = { file: 'Sales', date: '2026-10-20' };

describe('a database is a SQLite file in the vault (settings_db_connections)', () => {
  test('a file ending .sqlite, .sqlite3 or .db is one, in any case; nothing else is', () => {
    for (const path of ['Data/sales.sqlite', 'sales.SQLITE3', 'a/b/shop.db']) assert.equal(isDbFile(path), true, path);
    for (const path of ['sales.md', 'db', 'sales.sqlite.md', 'notes/db.txt', 'sales.csv'])
      assert.equal(isDbFile(path), false, path);
  });
});

describe('an import is a copy written as text (db_import_on_request)', () => {
  test('each row is a thing and each link row a link, read back as the same graph', () => {
    const things = [
      { id: 'acme', kind: 'Customer', name: 'Acme', since: new Date('2024-01-02T00:00:00Z'), owes: null },
      { id: 'bolt', kind: 'Customer', name: 'Bolt', spend: 12n },
    ];
    const links = [{ from: 'acme', type: 'REFERRED', to: 'bolt', weight: 2 }];
    const r = importedBlock('sales', things, links, INFO);
    assert.ok('block' in r, JSON.stringify(r));
    assert.match(r.block, /^```gql\n\/\/ graph: sales\n/);
    assert.match(
      r.block,
      /\/\/ Imported from Sales on 20 Oct 2026: 2 things and 1 link, a copy that is not kept in step\./,
    );
    assert.match(r.block, /\n```$/);
    const read = gs.read([r.block.replace(/^```gql\n|```$/g, '')]);
    const g = read.graph('sales');
    const named = (name) => [...g.nodes].find(([, n]) => n.props.name === name);
    const [acme, bolt] = [named('Acme'), named('Bolt')];
    assert.ok(acme[1].labels.has('Customer'), 'the kind column as its kind');
    assert.equal(acme[1].props.since, '2024-01-02T00:00:00.000Z', 'a date as its ISO text');
    assert.equal(bolt[1].props.spend, 12, 'a whole number from the database as a number');
    assert.ok(!('owes' in acme[1].props), 'a column with no value is left out');
    assert.ok(
      [...g.edges].some(([from, type, to]) => from === acme[0] && type === 'REFERRED' && to === bolt[0]),
      'the link',
    );
  });

  test('a blob, such as an image, is left out: a note holds text', () => {
    const r = importedBlock('sales', [{ id: 'a', logo: new Uint8Array([137, 80, 78, 71]), name: 'A' }], [], INFO);
    assert.ok('block' in r);
    assert.doesNotMatch(r.block, /logo|137/);
    assert.match(r.block, /name: 'A'/);
  });

  test('rows it cannot write are refused, with the reason, and nothing is written', () => {
    const cases = [
      [[{ name: 'no id' }], [], /Row 1 of the things has no id column/],
      [[{ id: 'a' }, { id: 'a' }], [], /Two rows of the things have the id a/],
      [[{ id: 'a', kind: 'not a name' }], [], /kind not a name of a is not a name/],
      [[{ id: 'a' }], [{ from: 'a', to: 'a' }], /Row 1 of the links needs from, type and to/],
      [[{ id: 'a' }], [{ from: 'a', type: 'X', to: 'b' }], /names b, which the things query did not return/],
    ];
    for (const [things, links, why] of cases) {
      const r = importedBlock('sales', things, links, INFO);
      assert.ok('refused' in r && why.test(r.refused), JSON.stringify(r));
    }
    assert.match(importedBlock('two words', [], [], INFO).refused, /not a graph name/);
  });

  test('the block goes at the end of the note, after a blank line', () => {
    assert.equal(withImport('# Sales\n\n', 'B'), '# Sales\n\nB\n');
    assert.equal(withImport('', 'B'), 'B\n');
  });
});
