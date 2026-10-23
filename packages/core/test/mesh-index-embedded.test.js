// The derived store is embedded (editor spec §40, embedded_backends): SQLite inside the process, one file, never a
// server and never a JVM. So an install on a locked-down machine runs it as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { MeshIndex, sqliteBackend } from '../src/mesh-index.ts';
import { sqlEngine } from './mesh-test-sql.js';

const NOTE = [
  '```gql',
  '// graph: g',
  "(a:Thing {name: 'A'}),",
  "(b:Thing {name: 'B'}),",
  '(a)-[:LINKS]->(b)',
  '```',
].join('\n');

test('the store is built and read with no process started and no connection made', async (t) => {
  const refuse = (what) => () => {
    throw new Error(`the store tried to ${what}`);
  };
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
    t.mock.method(childProcess, name, refuse(`start a process (${name})`));
  t.mock.method(net, 'connect', refuse('connect to a server'));
  t.mock.method(net, 'createConnection', refuse('connect to a server'));
  const ix = new MeshIndex(sqliteBackend(await sqlEngine()));
  ix.update('g.md', NOTE);
  assert.equal(ix.find('g.md', { name: 'A' })[0]?.key, 'a');
});

test('the store is one SQLite file, held in the process', async () => {
  const engine = await sqlEngine();
  new MeshIndex(sqliteBackend(engine)).update('g.md', NOTE);
  const file = engine.db.export();
  assert.equal(new TextDecoder().decode(file.slice(0, 15)), 'SQLite format 3');
});

test('the core needs no database server, driver or JVM to run it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies });
  const servers = /^(pg|mysql2?|mssql|tedious|oracledb|neo4j-driver|java|node-java|jdbc)$/;
  assert.deepEqual(
    deps.filter((d) => servers.test(d)),
    [],
  );
});
