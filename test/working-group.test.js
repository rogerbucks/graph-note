// The working group's agreement (Roger, 20 Oct 2026): Roger, Claude, Antigravity and graph-note, a Grok bot. Each tool
// reads AGENTS.md, so AGENTS.md points to the agreement in docs/agents/ROLES.md.
import { execFileSync } from 'node:child_process';
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

test('the agreement sets a weekly web review of the tools and of best practice, with its owner (Roger, 20 Oct 2026)', () => {
  const roles = read(ROLES);
  assert.match(roles, /^## The weekly review$/m);
  const section = roles.slice(roles.indexOf('## The weekly review'));
  assert.match(section, /every Monday/i);
  assert.match(section, /graph-note/);
  assert.match(section, /https:\/\//, 'it names the sources the last review used');
});

test('a tool stuck on the same error three times stops and hands the item on', () => {
  assert.match(read(ROLES).replace(/\s+/g, ' '), /same error three times/);
});

test('each person keeps their own plans in a local file git never takes, and the agreement says where', () => {
  const ignored = execFileSync('git', ['check-ignore', '--no-index', 'docs/agents/plans.local.md'], {
    encoding: 'utf8',
  });
  assert.equal(ignored.trim(), 'docs/agents/plans.local.md');
  assert.ok(read(ROLES).includes('`docs/agents/plans.local.md`'));
});

test('each tool has a name and a personality suited to its job, and the jokes keep out of the way (Roger, 20 Oct 2026)', () => {
  const roles = read(ROLES);
  assert.match(roles, /^## Personalities$/m);
  const section = roles.slice(
    roles.indexOf('## Personalities'),
    roles.indexOf('\n## ', roles.indexOf('## Personalities') + 1),
  );
  for (const [name, tool] of [
    ['Sara', 'Claude'],
    ['Charles', 'Antigravity'],
    ['Eve', 'graph-note'],
  ])
    assert.ok(section.includes(`**${name}** (${tool})`), `${name} is ${tool}`);
  const flat = section.replace(/\s+/g, ' ');
  assert.match(flat, /The answer comes first/);
  assert.match(flat, /never in code, a commit/i);
  assert.match(flat, /never at anyone's expense/i);
});

test('the humour is dry, understated and kind: Terry Pratchett, not a shouting comic (Roger, 20 Oct 2026)', () => {
  const roles = read(ROLES);
  const section = roles.slice(
    roles.indexOf('## Personalities'),
    roles.indexOf('\n## ', roles.indexOf('## Personalities') + 1),
  );
  const flat = section.replace(/\s+/g, ' ');
  assert.match(flat, /dry, understated, subtle and kind/i);
  assert.match(flat, /Terry Pratchett/);
  assert.doesNotMatch(flat, /glee|irreverent|crash-test/i, 'no loud or sharp voices');
});

test('all three speak plainly: little jargon, and a term explained when it is needed (Roger, 20 Oct 2026)', () => {
  const flat = read(ROLES).replace(/\s+/g, ' ');
  assert.match(flat, /\*\*All three speak plainly\.\*\*/);
  assert.match(flat, /explain it in a few everyday words/);
});

const PANEL_CHARACTERS = ['Morgan', 'Dot', 'Bram', 'Wren', 'Pip', 'Juno', 'Tam', 'Rory', 'Nell'];

test('each of the review panel’s nine roles is its own named character (Roger, 20 Oct 2026)', () => {
  const roles = read(ROLES);
  assert.match(roles, /^## The review panel’s characters$/m);
  const at = roles.indexOf('## The review panel’s characters');
  const section = roles.slice(at, roles.indexOf('\n## ', at + 1));
  for (const name of PANEL_CHARACTERS) assert.ok(section.includes(`**${name}**`), name);
  assert.match(section.replace(/\s+/g, ' '), /The risks themselves stay plain/);
});

test('the risk panel workflow speaks as those characters, and keeps its findings plain', () => {
  const prompt = read('.github/workflows/risk-panel.yml').replace(/\s+/g, ' ');
  assert.match(prompt, /docs\/agents\/ROLES\.md, section "The review panel’s characters"/);
  for (const name of PANEL_CHARACTERS) assert.ok(prompt.includes(name), name);
  assert.match(prompt, /the risks table and the JSON stay plain/i);
});
