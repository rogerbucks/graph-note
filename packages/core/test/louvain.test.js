// Finding groups by how things link (editor spec §53, scale_groups): the Louvain method, in louvain.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { louvain } from '../src/louvain.ts';

/** Every pair of `things`, each linked once. */
const clique = (things) => things.flatMap((a, i) => things.slice(i + 1).map((b) => [a, b]));

/** A random graph like a real one: a tree of random parents, and 30% more links across it, the same for each seed. */
function treeWithCrossLinks(n, seed = 7) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const links = [];
  for (let i = 1; i < n; i++) links.push([Math.floor(next() * i), i]);
  for (let k = 0; k < Math.round(n * 0.3); k++) links.push([Math.floor(next() * n), Math.floor(next() * n)]);
  return links;
}

/** How well `groups` fit `links`: the modularity, from 0 (no better than chance) up to 1. */
function modularity(n, links, groups) {
  const degree = new Array(n).fill(0),
    total = new Map();
  for (const [a, b] of links) (degree[a]++, degree[b]++);
  for (let i = 0; i < n; i++) total.set(groups[i], (total.get(groups[i]) ?? 0) + degree[i]);
  let q = 0;
  for (const [a, b] of links) if (groups[a] === groups[b]) q += 1 / links.length;
  for (const t of total.values()) q -= (t / (2 * links.length)) ** 2;
  return q;
}

test('two tight groups joined by one link are found as two groups', () => {
  const links = [...clique([0, 1, 2, 3, 4]), ...clique([5, 6, 7, 8, 9]), [0, 5]];
  assert.deepEqual(louvain(10, links), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
});

test('groups are numbered in the order of their first thing', () => {
  const links = [...clique([1, 3, 5, 7]), ...clique([0, 2, 4, 6]), [6, 7]];
  assert.deepEqual(louvain(8, links), [0, 1, 0, 1, 0, 1, 0, 1]);
});

test('a thing with no links stays a group of its own', () => {
  assert.deepEqual(louvain(3, []), [0, 1, 2]);
  assert.deepEqual(louvain(4, [[0, 1]]), [0, 0, 1, 2]);
});

test('the same links give the same groups every time', () => {
  const links = treeWithCrossLinks(3000);
  assert.deepEqual(louvain(3000, links), louvain(3000, links));
});

test('the groups of a large real-looking graph fit it well', () => {
  const n = 20_000,
    links = treeWithCrossLinks(n),
    groups = louvain(n, links);
  // well-known tools find about 0.77 on graphs like this one
  assert.ok(modularity(n, links, groups) > 0.7, `modularity ${modularity(n, links, groups)}`);
  const count = new Set(groups).size;
  assert.ok(count > 20 && count < 2000, `${count} groups`);
});
