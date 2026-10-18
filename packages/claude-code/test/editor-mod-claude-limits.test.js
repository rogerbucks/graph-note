// What a proposal from Claude may not do to the note or the session (editor spec §26, cc_claude_proposes; the security
// review of #483): it cannot grow the note without limit (the size it may reach, the length of a value or a reason, how
// many proposals wait), its key is passed on standard input and never in the environment, its own text never carries the
// user's yes to the note, and what it says it read is one line of plain text. Tried over real server processes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { READ_LIMITS } from '@thoughtknot/core';
import { ask } from './editor-threats-support.js';
import { PLAN, launcherFor, modVault, opens, partsOf, writeNote } from './editor-mod-support.js';

const thing = (name, extra = {}) => ({ op: 'add-thing', name, kind: 'Task', properties: { name }, ...extra });

/** An editor open on the plan; the requests the sender was handed are kept in `sent`. */
async function opened(where = modVault(), path = where.plan) {
  const sent = [];
  const { launcher, host } = launcherFor(where, { sent });
  await opens(launcher, path);
  return { where, launcher, host, sent, page: partsOf(launcher.link) };
}

describe('a proposal cannot make the note grow without limit (cc_claude_proposes)', () => {
  test('a value and a reason have a length, and one past it is refused with why', async () => {
    const { where, launcher } = await opened();
    const long = 'x'.repeat(5000);
    for (const change of [
      { op: 'add-thing', name: 'a', kind: 'Task', properties: { name: long } },
      { op: 'set', thing: 'start', key: 'name', value: long },
      thing('b', { reason: long }),
    ]) {
      const outcome = await launcher.propose({ changes: [change] });
      assert.equal(outcome.ok, false);
      assert.match(outcome.why, /too long/);
    }
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
    assert.equal((await launcher.propose({ changes: [thing('c', { reason: 'y'.repeat(400) })] })).ok, true);
  });

  test('only so many proposals wait for a decision, and one more is refused', async () => {
    const { launcher } = await opened();
    for (let i = 0; i < 10; i++) assert.equal((await launcher.propose({ changes: [thing(`t${i}`)] })).ok, true, i);
    const outcome = await launcher.propose({ changes: [thing('t10')] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /proposals are waiting/);
  });

  test('a note too near the read limit takes none, in bytes or in lines, leaving room for a judgement block', async () => {
    const where = modVault();
    const { launcher } = await opened(where);
    for (const filler of ['x'.repeat(READ_LIMITS.bytes - 3000), 'a\n'.repeat(READ_LIMITS.lines - 40)]) {
      const text = `${PLAN}${filler}\n`;
      writeFileSync(where.plan, text);
      const outcome = await launcher.propose({ changes: [thing('late')] });
      assert.equal(outcome.ok, false);
      assert.match(outcome.why, /too large|room/);
      assert.equal(readFileSync(where.plan, 'utf8'), text, 'nothing was written');
    }
  });
});

describe('the key and the yes are not Claude’s to carry (cc_claude_proposes)', () => {
  test('the key is passed on standard input, and the environment names no key', async () => {
    const { launcher, host, sent } = await opened();
    await launcher.propose({ changes: [thing('t')] });
    const [request] = host.requests;
    assert.ok(!JSON.stringify(request.env).includes(sent[0].key), 'no key in the environment');
    assert.equal(request.input, `${sent[0].key}\n`);
    assert.ok(!request.argv.join(' ').includes(sent[0].key));
  });

  test('Claude’s own text never carries the user’s yes: a confirmed note asks again after a proposal, and takes no more', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const path = writeNote(where, 'ask.md', 'Confidential', PLAN);
    await launcher.edit(path);
    assert.equal((await launcher.confirm()).ok, true);
    const page = partsOf(launcher.link);
    const read = () =>
      ask(page.port, { path: `/api/notes/${page.note}`, headers: { authorization: `Bearer ${page.token}` } });
    assert.equal((await read()).status, 200);
    assert.equal((await launcher.propose({ changes: [thing('t')] })).ok, true);
    const after = await read();
    assert.equal(after.status, 410);
    assert.match(JSON.parse(after.text).why, /does not cover/);
    assert.equal((await launcher.propose({ changes: [thing('u')] })).ok, false);
  });

  test('a note under Claude’s ceiling stays readable after a proposal', async () => {
    const { launcher, page } = await opened();
    assert.equal((await launcher.propose({ changes: [thing('t')] })).ok, true);
    const got = await ask(page.port, {
      path: `/api/notes/${page.note}`,
      headers: { authorization: `Bearer ${page.token}` },
    });
    assert.equal(got.status, 200);
  });
});

describe('what Claude says it read, and why, is one line of plain text (cc_claude_proposes)', () => {
  test('every kind of line break and space is one space, in what it read and in a reason', async () => {
    const { where, launcher } = await opened();
    // line separator, next line, vertical tab, form feed, paragraph separator, and a carriage return with a line feed
    const breaks = [0x2028, 0x85, 0x0b, 0x0c, 0x2029].map((n) => String.fromCharCode(n));
    const odd = ['a', 'b', 'c', 'd', 'e'].map((w, i) => w + breaks[i]).join('') + 'f\r\ng';
    const outcome = await launcher.propose({ changes: [thing('t', { reason: odd })], read: [odd] });
    assert.equal(outcome.ok, true);
    const note = readFileSync(where.plan, 'utf8');
    assert.ok(!breaks.some((c) => note.includes(c)), 'no such character reaches the note');
    assert.match(note, /^\/\/ read: a b c d e f g$/m);
    assert.match(note, /reason: a b c d e f g/);
  });
});
