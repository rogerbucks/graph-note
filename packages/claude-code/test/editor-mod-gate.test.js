// The gate's hardening from the security review of #475 (editor spec §26, cc_classified_asks). Only the person typing
// in the composer can say yes. The yes goes to the server for the content it was given about. The gate's own cases are
// in editor-mod.test.js (test_cc_mod): asking, the highest classification and credentials. These are kept apart so that
// file stays short, and run in the same suite.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSER, launcherFor, modVault, partsOf, writeNote } from './editor-mod-support.js';
import { sayEdit } from '../src/editor-launch.ts';
import { ask } from './editor-threats-support.js';

/** Whether a server was started: the host was asked for a process. */
const started = (host) => host.requests.length > 0;

/** The page's own first call: the note by the id and token the address carries. */
const readNote = (link) => {
  const { port, token, note } = partsOf(link);
  return ask(port, { path: `/api/notes/${note}`, headers: { authorization: `Bearer ${token}` } });
};

describe('only the person typing can say yes (cc_classified_asks)', () => {
  // everything that is not the composer, and what a host might send that is not known to be one of these
  const NOT_THE_PERSON = [
    { kind: 'plugin' },
    { kind: 'peer-send-message' },
    { kind: 'channel' },
    { kind: 'coordinator' },
    { kind: 'scheduled-trigger' },
    { kind: 'bridge' },
    { kind: 'something-new' },
    { kind: 'Composer' },
    { kind: ['composer'] },
    { kind: 'composer ' },
    {},
    null,
    undefined,
    'composer',
    42,
  ];
  const label = (origin) => JSON.stringify(origin) ?? 'undefined';

  test('a command from anything but the composer cannot confirm, and opens nothing', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where, { raw: true });
    await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'), undefined, COMPOSER);
    for (const origin of NOT_THE_PERSON) {
      const outcome = await launcher.confirm(origin);
      assert.equal(outcome.ok, false, label(origin));
      assert.equal(outcome.held, 'refused', label(origin));
      assert.match(outcome.why, /person/i, label(origin));
      assert.equal(started(host), false, label(origin));
    }
    assert.equal((await launcher.confirm(COMPOSER)).ok, true, 'the question is still waiting for the person');
  });

  test('a command from anything but the composer cannot open a note above the level, and leaves no question to confirm', async () => {
    const where = modVault();
    for (const origin of NOT_THE_PERSON) {
      const { launcher, host } = launcherFor(where, { raw: true });
      const outcome = await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'), undefined, origin);
      assert.equal(outcome.ok, false, label(origin));
      assert.equal(outcome.held, 'refused', label(origin));
      assert.match(outcome.why, /person/i, label(origin));
      assert.equal(started(host), false, label(origin));
      assert.equal(
        (await launcher.confirm(COMPOSER)).ok,
        false,
        'nothing was asked, so the person has nothing to confirm',
      );
      assert.equal(started(host), false);
    }
  });

  test('any origin may still open a note at or below the level: only the yes needs the person', async () => {
    const where = modVault();
    for (const origin of NOT_THE_PERSON) {
      const { launcher } = launcherFor(where, { raw: true });
      assert.equal(
        (await launcher.edit(writeNote(where, 'ok.md', 'Internal'), undefined, origin)).ok,
        true,
        label(origin),
      );
    }
  });

  test('a launcher given no origin at all fails closed', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where, { raw: true });
    assert.equal((await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'))).held, 'refused');
    assert.equal((await launcher.confirm()).held, 'refused');
    assert.equal(started(host), false);
  });

  test('the composer is the one origin that asks, and its yes opens the note', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where, { raw: true });
    const asked = await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'), undefined, { kind: 'composer' });
    assert.equal(asked.held, 'asks');
    assert.equal((await launcher.confirm({ kind: 'composer' })).ok, true);
  });

  test('the refusal says in plain words that only the person typing can say yes', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where, { raw: true });
    const outcome = await launcher.confirm({ kind: 'bridge' });
    assert.match(sayEdit(outcome), /only the person typing/i);
  });
});

describe('the yes goes to the server, for the content it was given about (cc_classified_asks)', () => {
  const NEVER = 'The hidden plan.';

  test('the server is handed the settings and the digest of what was confirmed, never the note’s text', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(writeNote(where, 'plan2.md', 'Confidential', `${NEVER}\n`));
    await launcher.confirm();
    const [request] = host.requests;
    assert.match(request.env.THOUGHTKNOT_EDITOR_CONFIRMED, /^[0-9a-f]{64}$/);
    assert.deepEqual(JSON.parse(request.env.THOUGHTKNOT_EDITOR_SETTINGS).classifications, [
      'Public',
      'Internal',
      'Confidential',
      'Restricted',
    ]);
    assert.ok(!JSON.stringify(request).includes(NEVER));
  });

  test('a note opened with no question is handed no confirmation', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(writeNote(where, 'ok.md', 'Internal'));
    assert.equal(host.requests[0].env.THOUGHTKNOT_EDITOR_CONFIRMED, '');
  });

  test('a note changed after the question was asked asks again, rather than carrying the yes over', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Confidential', 'Asked about.\n');
    await launcher.edit(path);
    writeNote(where, 'plan2.md', 'Confidential', `${NEVER}\n`);
    const outcome = await launcher.confirm();
    assert.equal(outcome.held, 'asks');
    assert.equal(started(host), false);
    assert.equal(
      (await launcher.confirm()).ok,
      true,
      'the question asked about the new content is now the one waiting',
    );
  });

  test('once confirmed, a change of the note on disk is not served by the server', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Confidential', 'Asked about.\n');
    await launcher.edit(path);
    await launcher.confirm();
    assert.equal((await readNote(launcher.link)).status, 200);
    writeNote(where, 'plan2.md', 'Confidential', `${NEVER}\n`);
    const got = await readNote(launcher.link);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes(NEVER));
  });

  test('a note raised to the highest, or given a credential, after it opened is not served', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Internal');
    await launcher.edit(path);
    assert.equal((await readNote(launcher.link)).status, 200);
    writeNote(where, 'plan2.md', 'Restricted', `${NEVER}\n`);
    const got = await readNote(launcher.link);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes(NEVER));
  });
});
