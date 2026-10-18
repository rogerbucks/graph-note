// The gate inside the editor's server (spec §26, cc_classified_asks, cc_credential_never): the note is checked before
// every send, not only when it is opened, so a note changed on disk after the check, a draft, a conflict's copy and the
// change stream never carry what Claude may not read. A refusal sends "gone" and no text, and a yes is for the content
// it was given about, never for what the note has become.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { sha256 } from '@thoughtknot/core';
import { storeGate } from '../server/editor-gate.ts';
import { ask } from './editor-threats-support.js';
import { bearer, follow, handWatch, served, tempVault, writing } from './editor-store-support.js';

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const claude = { name: 'Claude', purpose: '', ceiling: 'Internal', endpoint: '', model: '', keyName: '' };
const SETTINGS = { classifications: LEVELS, aiUnlabelled: 'Restricted', aiModels: [claude] };
const noted = (level, body = 'Some text.\n') => `---\nclassification: ${level}\n---\n${body}`;
// built here, so no line of this file has the shape of a secret
const value = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);

/** A store with the gate in, over a vault whose plan note holds `text`, opened. */
async function gated(text, confirmed = null) {
  const v = tempVault();
  writeFileSync(v.plan, text);
  const w = handWatch();
  const { store, server } = await served(v, { watch: w.watch, gate: storeGate(SETTINGS, confirmed) });
  const opened = await store.open('Notes/plan.md');
  assert.equal(opened.ok, true, opened.why);
  return { v, w, s: server, id: opened.id };
}

const get = (s, id, tail = '') => ask(s.port, { path: `/api/notes/${id}${tail}`, headers: bearer(s) });

describe('every send is checked again (cc_classified_asks, cc_credential_never)', () => {
  test('a note that may open is served as before', async () => {
    const { s, id } = await gated(noted('Internal'));
    const got = await get(s, id);
    assert.equal(got.status, 200);
    assert.match(JSON.parse(got.text).text, /Some text/);
  });

  test('a note raised on disk after it opened is no longer served: gone, and none of its text', async () => {
    const { v, s, id } = await gated(noted('Internal'));
    writeFileSync(v.plan, noted('Restricted', 'The hidden plan.\n'));
    const got = await get(s, id);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes('hidden plan'));
    assert.match(JSON.parse(got.text).why, /highest/);
  });

  test('a note above Claude’s level that was never confirmed is not served', async () => {
    const { s, id } = await gated(noted('Confidential', 'The hidden plan.\n'));
    const got = await get(s, id);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes('hidden plan'));
  });

  test('a credential that appears in the note is not served, at any classification', async () => {
    const { v, s, id } = await gated(noted('Public'));
    writeFileSync(v.plan, noted('Public', `db_password: "${value}"\n`));
    const got = await get(s, id);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes(value));
  });

  test('the change stream starts with gone for a note that may not be sent, and sends no text', async () => {
    const { v, s, id } = await gated(noted('Internal'));
    writeFileSync(v.plan, noted('Restricted', 'The hidden plan.\n'));
    const stream = follow(s, id);
    assert.equal(await stream.status, 200);
    const first = await stream.next();
    assert.deepEqual(Object.keys(first), ['gone']);
    assert.ok(!JSON.stringify(first).includes('hidden plan'));
  });

  test('a change on disk that makes the note unsendable sends gone to the stream, then nothing of it', async () => {
    const { v, w, s, id } = await gated(noted('Internal', 'First.\n'));
    const stream = follow(s, id);
    assert.match((await stream.next()).text, /First/);
    writeFileSync(v.plan, noted('Restricted', 'The hidden plan.\n'));
    w.fire('plan.md');
    const event = await stream.next();
    assert.deepEqual(Object.keys(event), ['gone']);
    assert.ok(!JSON.stringify(event).includes('hidden plan'));
    assert.equal((await get(s, id)).status, 410, 'and the note is no longer served');
  });

  test('a draft holding a credential is not sent with the note, and nor is one the note’s own check would refuse', async () => {
    const { s, id } = await gated(noted('Internal'));
    const got = JSON.parse((await get(s, id)).text);
    const put = await ask(s.port, {
      method: 'PUT',
      path: `/api/notes/${id}/draft`,
      headers: writing(s, got.version),
      body: `${noted('Internal')}db_password: "${value}"\n`,
    });
    assert.equal(put.status, 204);
    const again = await get(s, id);
    assert.equal(again.status, 200);
    const body = JSON.parse(again.text);
    assert.equal(body.draft, null, 'the draft is withheld');
    assert.ok(!again.text.includes(value));
  });

  test('a stale write’s answer, which carries the note as it is, is gated too', async () => {
    const { v, s, id } = await gated(noted('Internal'));
    const got = JSON.parse((await get(s, id)).text);
    writeFileSync(v.plan, noted('Restricted', 'The hidden plan.\n'));
    const put = await ask(s.port, {
      method: 'PUT',
      path: `/api/notes/${id}`,
      headers: writing(s, got.version),
      body: 'x',
    });
    assert.ok(!put.text.includes('hidden plan'));
    assert.equal(put.status, 410);
  });
});

describe('a yes is for the content it was given about', () => {
  test('a note above the level opens when the digest of its content was confirmed', async () => {
    const text = noted('Confidential', 'Agreed text.\n');
    const { s, id } = await gated(text, sha256(text));
    assert.equal((await get(s, id)).status, 200);
  });

  test('once the content has changed, the yes no longer holds: gone, none of the new text', async () => {
    const text = noted('Confidential', 'Agreed text.\n');
    const { v, s, id } = await gated(text, sha256(text));
    writeFileSync(v.plan, noted('Confidential', 'Something else, never agreed.\n'));
    const got = await get(s, id);
    assert.equal(got.status, 410);
    assert.ok(!got.text.includes('never agreed'));
  });

  test('a yes never opens the highest classification, nor a credential', async () => {
    const top = noted('Restricted');
    const a = await gated(top, sha256(top));
    assert.equal((await get(a.s, a.id)).status, 410);
    const cred = noted('Confidential', `db_password: "${value}"\n`);
    const b = await gated(cred, sha256(cred));
    assert.equal((await get(b.s, b.id)).status, 410);
  });
});
