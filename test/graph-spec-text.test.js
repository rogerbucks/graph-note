// The graph spec's text is in the repository. So a reader of the code can follow its section numbers
// (spec §13, graph_spec_in_repo; ARCH-11 of the expert panel):
// - requirements/graph-spec.gql is the frozen export of the graph spec, with its sections and each rule's own words.
// - Every § the two libraries cite names a section in it. A citation of the editor's spec says "editor spec".
// - The library's guide and the developers' wiki page link to it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './repository/repo.js';

const SPEC = 'requirements/graph-spec.gql';

/** Every file under `dir` whose name ends with one of `ends`, from the repository's root. */
function filesUnder(dir, ends) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return filesUnder(path, ends);
    return ends.some((end) => e.name.endsWith(end)) ? [path] : [];
  });
}

describe('the graph spec, in the repository', () => {
  test('it holds the sections, each rule with its own words and its section', () => {
    const text = read(SPEC);
    const sections = [...text.matchAll(/:Section \{id: 'spec:§(\d+)', num: '(\d+)'/g)];
    assert.ok(sections.length >= 20, `${sections.length} sections`);
    for (const [, id, num] of sections) assert.equal(id, num);
    const rules = [...text.matchAll(/\((\w+):Requirement \{[^\n]*?quote: '/g)].map((m) => m[1]);
    assert.ok(rules.length >= 100, `${rules.length} rules with their words`);
    for (const rule of rules) assert.ok(text.includes(`(${rule})-[:PART_OF]->(s`), `${rule} names its section`);
  });

  test('every section the two libraries cite is in it', () => {
    const nums = new Set([...read(SPEC).matchAll(/num: '(\d+)'/g)].map((m) => m[1]));
    const missing = [];
    const files = [
      ...filesUnder('packages/graph-spec/src', ['.js', '.ts', '.json']),
      ...filesUnder('python/graph_spec/src', ['.py']),
    ];
    for (const file of files) {
      const text = read(file);
      for (const m of text.matchAll(/§ ?(\d+)/g)) {
        if (/editor spec\s*$/i.test(text.slice(Math.max(0, m.index - 14), m.index))) continue;
        if (!nums.has(m[1])) missing.push(`${file}:${text.slice(0, m.index).split('\n').length} §${m[1]}`);
      }
    }
    assert.deepEqual(missing, [], 'a § no section of the spec has: say "editor spec" if it is the editor\'s');
  });

  test("the library's guide and the developers' page link to it", () => {
    assert.ok(read('packages/graph-spec/GUIDE.md').includes(SPEC));
    assert.ok(read('wiki/For-developers.md').includes(SPEC));
  });
});
