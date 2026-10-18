// gh checks the token's scopes before any `gh project …` verb (read:org, read:discussion), and PROJECT_TOKEN holds the
// project scope alone, by design. So the scripts reach the project through GraphQL only. No script may build a gh
// argument list that starts with 'project'. The first live run of the mirror failed on `gh project item-edit`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { path } from './repository/repo.js';

const SCRIPTS = path('scripts');
const GH_PROJECT_ARGS = /\[\s*['"`]project['"`]\s*[,\]]/;
const ITEM_EDIT = /['"`]item-edit['"`]/;

describe('no script runs a gh project verb', () => {
  const files = readdirSync(SCRIPTS, { recursive: true }).filter((f) => /\.(mjs|js|cjs)$/.test(String(f)));

  test('there are scripts to look at', () => {
    assert.ok(files.length > 20, `${files.length}`);
  });

  test('none builds an argument list that begins with project, or names item-edit', () => {
    const found = [];
    for (const file of files) {
      const text = readFileSync(join(SCRIPTS, String(file)), 'utf8');
      if (GH_PROJECT_ARGS.test(text) || ITEM_EDIT.test(text)) found.push(String(file));
    }
    assert.deepEqual(found, []);
  });

  test('the check sees the shape it forbids', () => {
    assert.ok(GH_PROJECT_ARGS.test("act(['project', 'item-edit', '--id', id])"));
    assert.ok(GH_PROJECT_ARGS.test('run(["project","list"])'));
    assert.ok(ITEM_EDIT.test("['project', 'item-edit']"));
    assert.equal(GH_PROJECT_ARGS.test("run(['issue', 'create', '--label', 'project'])"), false);
  });
});
