// The working group's agreement (Roger, 20 Oct 2026): Roger, Claude, Antigravity and graph-note, a Grok bot. Each tool
// reads AGENTS.md, so AGENTS.md points to the agreement in docs/agents/ROLES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

const ROLES = 'docs/agents/ROLES.md';

test('AGENTS.md sends every AI tool to the working group’s agreement', () => {
  assert.ok(read('AGENTS.md').includes(`[${ROLES}](${ROLES})`));
});

test('the agreement gives each tool its work and label, and says which tools may push branches', () => {
  const roles = read(ROLES);
  assert.match(roles, /^## Who does what$/m);
  for (const tool of ['claude', 'antigravity', 'graph-note']) assert.ok(roles.includes(`\`agent:${tool}\``), tool);
  for (const prefix of ['claude/', 'antigravity/']) assert.ok(roles.includes(`\`${prefix}\``), prefix);
  assert.match(roles, /graph-note pushes no code/);
});

test('the agreement repeats the rules every tool keeps: sign-off, approval, security fixes and no Copilot credits', () => {
  const flat = read(ROLES).replace(/\s+/g, ' ');
  assert.ok(flat.includes('Signed-off-by: Roger Bucks <264575592+rogerbucks@users.noreply.github.com>'));
  assert.match(flat, /all good/);
  assert.match(flat, /merge commit/i);
  assert.match(flat, /prevented_by/);
  assert.match(flat, /`security\/`/);
  assert.match(flat, /Copilot/);
  assert.match(flat, /## Reviewing each other/);
});
