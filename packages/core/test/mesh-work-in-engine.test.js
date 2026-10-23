// The mesh's work runs in the engine (editor spec §27, mesh_work_in_engine). Pathfinding, centroids, altitude and a
// process's transitions are each offered by the host-free engine: the graph library or the core. No host computes
// them itself. A host's source is read, and none declares a function or value named for that work. So a host that
// wants a path, a centroid, a level or a transition asks the engine for it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import gs from '@thoughtknot/graph-spec';
import { shortestPath } from '../src/untangle.ts';

const ROOT = new URL('../../../', import.meta.url);
const ENGINE = new Set(['core', 'graph-spec']);
// what a host must never compute itself: a path search, a centroid, an altitude or a transition
const WORK =
  /\b(?:function|const|let|class)\s+\w*(?:[Ss]hortest|[Pp]athsBetween|[Cc]entroid|[Aa]ltitude|[Tt]ransition)\w*/;

/** Each source file of each host, as a path from the repository's root. */
function hostSources() {
  return readdirSync(new URL('packages/', ROOT), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !ENGINE.has(d.name))
    .flatMap((d) => {
      const src = new URL(`packages/${d.name}/src/`, ROOT);
      let files = [];
      try {
        files = readdirSync(src, { recursive: true }).map(String);
      } catch {
        return [];
      }
      return files
        .filter((f) => /\.(?:ts|tsx|js|mjs)$/.test(f))
        .map((f) => `packages/${d.name}/src/${f.replaceAll('\\', '/')}`);
    });
}

describe('mesh_work_in_engine', () => {
  test('the engine offers pathfinding, centroids, altitude and the join of transitions', () => {
    for (const name of ['centroidsOf', 'viewAt', 'below', 'meshJoin']) assert.equal(typeof gs[name], 'function', name);
    const edges = [
      { from: 'a', to: 'b', key: 'ab' },
      { from: 'b', to: 'c', key: 'bc' },
    ];
    assert.deepEqual(shortestPath(edges, 'a', 'c')?.things, ['a', 'b', 'c']);
  });

  test('no host computes that work itself', () => {
    const sources = hostSources();
    assert.ok(sources.length > 50, 'the hosts were read');
    const found = sources.filter((f) => WORK.test(readFileSync(new URL(f, ROOT), 'utf8')));
    assert.deepEqual(found, []);
  });

  test('the check finds a host that does', () => {
    assert.ok(WORK.test('function shortestRoute(edges) {}'));
    assert.ok(WORK.test('const centroidOf = (cluster) => cluster;'));
    assert.ok(!WORK.test("import { shortestPath } from '@thoughtknot/core';"));
  });
});
