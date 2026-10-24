// The short guide for AI sessions, AGENTS.md, and its handbook (spec §13, test_cheap_checks). AGENTS.md is loaded
// into every session, so it holds only the rules; docs/agents/HANDBOOK.md holds the detail. Moved here from
// cheap-checks.test.js to keep each test file short.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { path, read, walk } from './repository/repo.js';
import { ignoreEntries } from '../scripts/ignore-entries.mjs';

describe('a short guide for AI sessions', () => {
  // AGENTS.md is loaded into every session, so it holds only the rules; the handbook holds the detail.
  const guide = () => `${read('AGENTS.md')}\n${read('docs/agents/HANDBOOK.md')}`;

  test('AGENTS.md stays slim: the rules only, and a link to the handbook for the rest', () => {
    const agents = read('AGENTS.md');
    assert.ok(agents.split('\n').length <= 35, 'about 30 lines');
    assert.ok(agents.length <= 2600, 'about 2.5 KB, read by every session');
    assert.ok(agents.includes('(docs/agents/HANDBOOK.md)'));
    for (const rule of [
      '## Guards',
      'Sign off as Roger',
      'never squash',
      '--log-failed',
      'bare `node --test`',
      '.ignore',
    ])
      assert.ok(agents.includes(rule), rule);
  });

  test('the guide and its handbook give the cheap commands and the full ones', () => {
    for (const cmd of [
      'npm run test:ai',
      'npm run test:changed',
      'npm run test:ai:py',
      'npm test',
      'npm run typecheck',
    ])
      assert.ok(guide().includes(cmd), cmd);
  });

  test('it says to read only the failed job’s log on a CI failure', () => {
    assert.ok(guide().includes('gh run view <id> --log-failed'));
  });

  test('it links CONTRIBUTING.md and the guide of every package', () => {
    assert.ok(read('AGENTS.md').includes('(CONTRIBUTING.md)'));
    const handbook = read('docs/agents/HANDBOOK.md');
    const guides = walk('packages')
      .concat(walk('python'))
      .filter((f) => /^(packages|python)\/[^/]+\/GUIDE\.md$/.test(f));
    assert.ok(guides.length >= 4);
    for (const g of guides) assert.ok(handbook.includes(`(../../${g})`), g);
  });

  test('it says which files never to read, and names each file the search ignores', () => {
    assert.match(guide(), /never to read/i);
    for (const entry of ignoreEntries(path('.'))) assert.ok(guide().includes(`\`${entry}\``), entry);
  });

  test('it tells a session to stop and ask when a guard or hook refuses, with the one exception', () => {
    assert.match(guide(), /^## Guards$/m);
    const flat = guide().replace(/\s+/g, ' ');
    assert.match(flat, /guard or hook that refuses a command means stop and ask the owner/);
    assert.match(flat, /Never reach the same result by another tool, wording or route/);
    assert.match(flat, /when the refusal itself says how to do it allowably, do exactly that and say so/);
  });

  test('it names the script that resets the test vault, and has no wording from before the vault was here', () => {
    assert.match(guide(), /scripts\/reset-test-vault\.mjs[^\n]*before and after/);
    assert.doesNotMatch(guide(), /once the vault is in the repository/);
    assert.doesNotMatch(read('.ignore'), /arrives with its own branch/);
  });

  test('it says test:changed follows the naming and the imports, so the full suite still runs before a merge', () => {
    const flat = guide().replace(/\s+/g, ' ');
    assert.match(flat, /every test that imports it, directly or through other modules/);
    assert.match(flat, /run the full suite before a merge/);
  });

  test('CLAUDE.md holds only the line that points to AGENTS.md; anything more needs the owner’s own word', () => {
    assert.equal(read('CLAUDE.md'), '@AGENTS.md\n');
  });

  test('CONTRIBUTING.md lists this test and mentions the cheap commands', () => {
    const c = read('CONTRIBUTING.md');
    assert.match(c, /^- `test\/cheap-checks\.test\.js` — /m);
    for (const cmd of ['test:ai', 'test:changed', 'AGENTS.md']) assert.ok(c.includes(cmd), cmd);
  });
});
