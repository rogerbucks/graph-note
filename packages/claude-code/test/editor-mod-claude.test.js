// Proposals from Claude (editor spec §26, slice 4; workstream C7; test_cc_mod, with editor-mod.test.js). Claude is the
// only AI the browser editor offers (cc_claude_only). What Claude changes in the note open in the pane reaches it
// through the mod as a proposal. That is a checked change set the user accepts or rejects on the card. It never comes
// through the server's write (cc_claude_proposes). Tried over real server processes, started as the host starts them.
// The page's own review is run on the note as the server wrote it. A test asserts the work done, never the time taken.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { gqlSpans, readNote } from '@thoughtknot/core';
import { ask } from './editor-threats-support.js';
import { PLAN, launcherFor, modVault, opens, partsOf, writeNote } from './editor-mod-support.js';

const EXTRA = {
  op: 'add-thing',
  name: 'extra',
  kind: 'Task',
  properties: { name: 'Extra' },
  reason: 'a step is missing',
};
const RENAME = { op: 'set', thing: 'start', key: 'name', value: 'Begin' };
const say = (outcome) => import('../src/editor-launch.ts').then((m) => m.sayProposed(outcome));

/** The graph's own things, as the note reads them with every change set left out. */
const things = (note) => {
  const own = gqlSpans(note)
    .map((s) => s.text)
    .filter((t) => !/CHANGE SET|^\/\/ graph: judgements/m.test(t));
  return [...(readNote(own).world.plan?.nodes.keys() ?? [])].sort();
};

/** An editor open on the plan, one proposal made to it; the requests the sender was handed are kept in `sent`. */
async function opened(settings, where = modVault(), path = where.plan) {
  const sent = [];
  const { launcher, host } = launcherFor(where, { sent, settings });
  await opens(launcher, path);
  return { where, launcher, host, sent, page: partsOf(launcher.link) };
}

/** A request to the server's proposal route, as the sender makes it, with the key it is given. */
const toRoute = (page, key, body, over = {}) =>
  ask(page.port, {
    method: 'PUT',
    path: `/api/notes/${page.note}/proposal`,
    headers: {
      authorization: `Bearer ${key}`,
      origin: `http://127.0.0.1:${page.port}`,
      'sec-fetch-site': 'same-origin',
      ...over,
    },
    body,
  });

describe('Claude is the only AI the browser editor offers (cc_claude_only)', () => {
  test('the page is told no model of the mod’s settings, whoever is set up, and no address or key', async () => {
    const other = {
      name: 'Other',
      purpose: '',
      ceiling: 'Public',
      endpoint: 'https://models.example/v1',
      keyName: 'k',
    };
    const { page } = await opened({ aiModels: [other] });
    const got = await ask(page.port, { path: '/api/settings', headers: { authorization: `Bearer ${page.token}` } });
    assert.equal(got.status, 200);
    assert.deepEqual(JSON.parse(got.text).aiModels, []);
    assert.ok(!/Other|models\.example/.test(got.text));
  });

  test('the page’s source offers no model: it holds no model choice and reaches no address but the server’s', () => {
    const folder = new URL('../page/', import.meta.url);
    const source = readdirSync(folder)
      .filter((n) => /\.ts$/.test(n))
      .map((n) => readFileSync(new URL(n, folder), 'utf8'))
      .join('\n');
    assert.ok(!/aiModels|endpoint|requestBody|chat\/completions/i.test(source));
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(source.replace(/\/\/ .*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  });

  test('a proposal can name no proposer: Claude is the one, and a body that names another is refused', async () => {
    const { where, page, launcher, sent } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const key = sent[0].key;
    const before = readFileSync(where.plan, 'utf8');
    for (const extra of [{ by: 'Other' }, { author: 'Other' }, { model: 'Other' }, { proposer: 'Other' }]) {
      const body = JSON.stringify({ changes: [RENAME], ...extra });
      const reply = await toRoute(page, key, body);
      assert.equal(reply.status, 422, JSON.stringify(extra));
      assert.match(JSON.parse(reply.text).why, /only changes/);
    }
    assert.equal(readFileSync(where.plan, 'utf8'), before, 'nothing was written');
  });

  test('a change that adds a Person, a Model or a Step is refused: no text of Claude’s declares an author', async () => {
    const { where, launcher } = await opened();
    for (const kind of ['Model', 'Person', 'Step']) {
      const outcome = await launcher.propose({ changes: [{ op: 'add-thing', name: 'someone', kind, properties: {} }] });
      assert.equal(outcome.ok, false, kind);
      assert.match(outcome.why, /cannot add a Person, an Organization, a SoftwareAgent, a Model or a Step/);
    }
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN, 'nothing was written');
    assert.equal((await launcher.propose({ changes: [EXTRA] })).ok, true);
    const note = readFileSync(where.plan, 'utf8');
    assert.equal((note.match(/:Model\b/g) ?? []).length, 1, 'the only Model is the one the editor declared');
  });

  test('the proposer is the Model named Claude in the settings, declared first among the additions', async () => {
    const { where, launcher } = await opened();
    assert.equal((await launcher.propose({ changes: [EXTRA] })).ok, true);
    const block = gqlSpans(readFileSync(where.plan, 'utf8')).find((s) => /CHANGE SET/.test(s.text)).text;
    assert.match(block, /^\/\/ graph: plan · CHANGE SET \S+ · against sha-256-64:[0-9a-f]{16} · by Claude$/m);
    const lines = block.split('\n').filter((l) => !l.startsWith('//'));
    assert.match(lines[0], /^\(Claude:Model \{name: 'Claude'\}\),$/);
  });
});

describe('Claude proposes through the mod, and only accept applies it (cc_claude_proposes)', () => {
  test('a proposal lands as a checked change set beside the graph, with the graph and prose as they were', async () => {
    const { where, launcher } = await opened();
    const outcome = await launcher.propose({ changes: [EXTRA, RENAME], read: ['plan.md'] });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.count, 2);
    const after = readFileSync(where.plan, 'utf8');
    const spans = gqlSpans(after);
    assert.equal(spans.length, 2);
    assert.equal(spans[0].text, gqlSpans(PLAN)[0].text, 'the graph’s block is as it was');
    assert.ok(after.startsWith('# Plan\nWhat comes first.\n```gql\n'));
    assert.ok(after.endsWith('```\nThe end.\n'));
    const { checkProposal } = await import('../../core/src/proposals-check.ts');
    const check = checkProposal(after, spans[1].text);
    assert.equal(check.passed, true, JSON.stringify(check.results));
    assert.match(spans[1].text, /\/\/ read: plan\.md/);
    assert.match(spans[1].text, /\/\/@ reason: a step is missing/);
  });

  test('the graph is not changed by the proposal: the thing is nowhere in it until it is accepted', async () => {
    const { where, launcher } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    assert.deepEqual(things(readFileSync(where.plan, 'utf8')), ['finish', 'start']);
  });

  test('accept applies the change and records who decided, the settings’ text or you; reject leaves the graph', async () => {
    const { proposalsIn, decide } = await import('../page/proposal-review.ts');
    const { where, launcher } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const text = readFileSync(where.plan, 'utf8');
    const [card] = proposalsIn(text);
    assert.equal(card.by, 'Claude');
    assert.deepEqual(
      card.rows.map((r) => [r.state, r.mark]),
      [
        ['pending', 'add'],
        ['pending', 'add'],
      ],
    );
    const rejected = decide(text, card.id, 'reject', { all: true }, 'Roger', false);
    assert.equal(rejected.ok, true);
    assert.deepEqual(things(rejected.note), ['finish', 'start'], 'a rejected change is nowhere in the graph');
    assert.match(rejected.note, /state: 'rejected'.*decided_by: 'Roger'/s);
    const accepted = decide(text, card.id, 'accept', { all: true }, '  ', false);
    assert.equal(accepted.ok, true, accepted.reason);
    assert.deepEqual(
      things(accepted.note),
      ['Claude', 'extra', 'finish', 'start'],
      'Claude is declared with the first accept',
    );
    assert.match(accepted.note, /state: 'accepted'.*decided_by: 'you'/s);
    assert.equal(proposalsIn(accepted.note).length, 0, 'what is decided leaves the change set');
  });

  test('a second proposal from Claude is not blocked by the Model the first declared; another node of that name still is', async () => {
    const { proposalsIn, decide } = await import('../page/proposal-review.ts');
    const { where, launcher } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    await launcher.propose({ changes: [RENAME] });
    let text = readFileSync(where.plan, 'utf8');
    const [first, second] = proposalsIn(text);
    assert.equal(decide(text, first.id, 'accept', { all: true }, 'Roger', false).ok, true);
    text = decide(text, first.id, 'accept', { all: true }, 'Roger', false).note;
    const [left] = proposalsIn(text);
    assert.equal(left.id, second.id);
    assert.deepEqual(
      left.rows.map((r) => r.blocked),
      [null, null],
      'the declaration already in the graph blocks nothing',
    );
    // the graph moved with the first accept, which the user has read
    const done = decide(text, second.id, 'accept', { all: true }, 'Roger', true);
    assert.equal(done.ok, true, done.reason);
    const graphText = gqlSpans(done.note)
      .map((s) => s.text)
      .filter((t) => /^\/\/ graph: plan$/m.test(t))
      .join('\n');
    assert.equal((graphText.match(/\(Claude:Model/g) ?? []).length, 1, 'Claude is declared once, not twice');
    assert.match(done.note, /\(start:Step \{name: 'Begin'\}\)|name: 'Begin'/);
    // a different node by that name is not the declaration, and the proposal is still refused
    const other = modVault();
    const two = await opened({}, other);
    await two.launcher.propose({ changes: [EXTRA] });
    const proposed = readFileSync(other.plan, 'utf8');
    // another program then names a node Claude, which is not the declaration
    const note = proposed.replace(
      "(start:Step {name: 'Start'}),",
      "(Claude:Step {name: 'Start'}),(start:Step {name: 'S'}),",
    );
    assert.notEqual(note, proposed);
    const refused = decide(note, proposalsIn(note)[0].id, 'accept', { all: true }, 'Roger', true);
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /already a name/);
  });

  test('the card shows the proposal in words, with a named button for each choice, and passes the choice on (WCAG 2.2 AA)', async () => {
    const { proposalsIn } = await import('../page/proposal-review.ts');
    const { showCards } = await import('../page/proposal-card.ts');
    const { where, launcher } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    // a document of just enough: elements that hold text, attributes, children and listeners
    const make = (tag) => ({
      tag,
      textContent: '',
      attrs: {},
      kids: [],
      listeners: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      append(...k) {
        this.kids.push(...k);
      },
      replaceChildren(...k) {
        this.kids = k;
      },
      addEventListener(name, fn) {
        this.listeners[name] = fn;
      },
    });
    const root = make('div');
    root.ownerDocument = { createElement: make };
    const walk = (e) => [e, ...e.kids.flatMap(walk)];
    const chosen = [];
    const said = [];
    const cards = proposalsIn(readFileSync(where.plan, 'utf8'));
    showCards(
      root,
      cards,
      async (...args) => (chosen.push(args), 'Done.'),
      (t) => said.push(t),
    );
    const all = walk(root);
    const words = all.map((e) => e.textContent).join(' ');
    assert.match(words, /Proposed by Claude/);
    assert.match(words, /Added/);
    assert.match(words, /Waiting for your decision/, 'a state is a word, not a colour');
    const buttons = all.filter((e) => e.tag === 'button');
    assert.ok(buttons.length >= 4, 'accept and reject for each change, and for all');
    for (const b of buttons) {
      assert.equal(b.attrs.type, 'button');
      assert.ok(b.attrs['aria-label'].startsWith(b.textContent), `${b.attrs['aria-label']} contains its visible label`);
    }
    buttons.find((b) => b.textContent === 'Accept all').listeners.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(chosen, [[cards[0].id, 'accept', { all: true }, false]]);
    assert.deepEqual(said, ['Done.'], 'the answer goes to the status region');
  });

  test('the page accepts only a proposal it can read, and a person decides: a name is needed, and Claude is not one', async () => {
    const { proposalsIn, decide } = await import('../page/proposal-review.ts');
    const { where, launcher } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const text = readFileSync(where.plan, 'utf8');
    const [card] = proposalsIn(text);
    const byClaude = decide(text, card.id, 'accept', { all: true }, 'Claude', false);
    assert.equal(byClaude.ok, false);
    assert.match(byClaude.reason, /not a person/);
    assert.equal(decide(text, 'nothing', 'accept', { all: true }, 'Roger', false).ok, false);
  });

  test('an accept is written by the page’s own write, version-checked, and the proposal key cannot make one', async () => {
    const { proposalsIn, decide } = await import('../page/proposal-review.ts');
    const { where, launcher, sent, page } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const got = JSON.parse(
      (await ask(page.port, { path: `/api/notes/${page.note}`, headers: { authorization: `Bearer ${page.token}` } }))
        .text,
    );
    const decided = decide(got.text, proposalsIn(got.text)[0].id, 'accept', { all: true }, 'Roger', false);
    const put = (token, version, body) =>
      ask(page.port, {
        method: 'PUT',
        path: `/api/notes/${page.note}`,
        headers: {
          authorization: `Bearer ${token}`,
          'if-match': version,
          origin: `http://127.0.0.1:${page.port}`,
          'sec-fetch-site': 'same-origin',
        },
        body,
      });
    const before = readFileSync(where.plan, 'utf8');
    const refused = await put(sent[0].key, got.version, decided.note);
    assert.ok([401, 403].includes(refused.status), `Claude’s key writes nothing: ${refused.status}`);
    assert.equal(readFileSync(where.plan, 'utf8'), before);
    assert.equal(
      (await put(page.token, 'a-stale-version', decided.note)).status,
      409,
      'the page’s write is version-checked',
    );
    assert.equal(readFileSync(where.plan, 'utf8'), before);
    assert.equal((await put(page.token, got.version, decided.note)).status, 200);
    assert.deepEqual(things(readFileSync(where.plan, 'utf8')), ['Claude', 'extra', 'finish', 'start']);
  });

  test('the page sees the proposal land: the change stream sends the note with it', async () => {
    const { launcher, page } = await opened();
    const lines = [];
    const reply = await fetch(`http://127.0.0.1:${page.port}/api/notes/${page.note}/events`, {
      headers: { authorization: `Bearer ${page.token}` },
    });
    const reader = reply.body.getReader();
    const next = async () => {
      let line = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return line;
        line += new TextDecoder().decode(value);
        if (line.endsWith('\n')) return line;
      }
    };
    lines.push(JSON.parse(await next()));
    assert.ok(!/CHANGE SET/.test(lines[0].text));
    await launcher.propose({ changes: [EXTRA] });
    lines.push(JSON.parse(await next()));
    assert.match(lines[1].text, /CHANGE SET/);
    assert.notEqual(lines[1].version, lines[0].version);
    await reader.cancel();
  });
});

describe('Claude’s direct writes through the editor are refused (cc_claude_proposes)', () => {
  test('the proposal key reads no note, writes no note or draft, and reads no settings', async () => {
    const { where, launcher, sent, page } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const key = sent[0].key;
    const before = readFileSync(where.plan, 'utf8');
    const headers = {
      authorization: `Bearer ${key}`,
      origin: `http://127.0.0.1:${page.port}`,
      'sec-fetch-site': 'same-origin',
      'if-match': 'x',
    };
    for (const [method, path] of [
      ['GET', `/api/notes/${page.note}`],
      ['GET', `/api/notes/${page.note}/events`],
      ['GET', '/api/settings'],
      ['PUT', `/api/notes/${page.note}`],
      ['PUT', `/api/notes/${page.note}/draft`],
    ]) {
      const reply = await ask(page.port, {
        method,
        path,
        headers,
        body: method === 'PUT' ? 'Overwritten.\n' : undefined,
      });
      assert.ok([401, 403].includes(reply.status), `${method} ${path}: ${reply.status}`);
    }
    assert.equal(readFileSync(where.plan, 'utf8'), before);
    assert.deepEqual(readdirSync(dirname(where.plan)).sort(), ['other.md', 'plan.md', 'readme.txt']);
  });

  test('the session’s token, the page’s, makes no proposal: a proposal reaches the note only through the mod', async () => {
    const { where, page } = await opened();
    const before = readFileSync(where.plan, 'utf8');
    const reply = await toRoute(page, page.token, JSON.stringify({ changes: [EXTRA] }));
    assert.equal(reply.status, 401);
    assert.equal(readFileSync(where.plan, 'utf8'), before);
  });

  test('a proposal takes changes alone: a note’s text, version or path in it is refused, and nothing is written', async () => {
    const { where, launcher, sent, page } = await opened();
    await launcher.propose({ changes: [EXTRA] });
    const key = sent[0].key;
    const before = readFileSync(where.plan, 'utf8');
    for (const extra of [{ text: 'Overwritten.\n' }, { note: 'x.md' }, { version: 'v' }, { path: '/etc/passwd' }]) {
      const reply = await toRoute(page, key, JSON.stringify({ changes: [RENAME], ...extra }));
      assert.equal(reply.status, 422);
    }
    assert.equal((await toRoute(page, key, 'not json')).status, 422);
    assert.equal(readFileSync(where.plan, 'utf8'), before);
    const outcome = await launcher.propose({ changes: [RENAME], text: 'Overwritten.\n' });
    assert.equal(outcome.ok, false);
    assert.equal(readFileSync(where.plan, 'utf8'), before);
  });

  test('the mod gives Claude one tool, to propose, and its wiring writes no file and sends no text of a note', () => {
    const register = readFileSync(new URL('../mod/hooks/register.tsx', import.meta.url), 'utf8');
    assert.match(register, /tool\.register\(/);
    assert.equal((register.match(/tool\.register\(/g) ?? []).length, 1);
    assert.match(register, /'tool\.call'/);
    assert.match(register, /mcp__thoughtknot__propose/);
    assert.ok(!/\$\.fs\.write|fs\.write\(|\$\.tool\.call\(/.test(register), 'the mod writes no file itself');
  });

  test('a proposal says nothing of the key, the token, the address or the note in what Claude is told', async () => {
    const { launcher, sent, page } = await opened();
    const outcome = await launcher.propose({ changes: [EXTRA] });
    const refused = await launcher.propose({ changes: [{ op: 'nonsense' }] });
    for (const text of [JSON.stringify(outcome), JSON.stringify(refused), await say(outcome), await say(refused)]) {
      assert.ok(![sent[0].key, page.token, page.note, launcher.link, 'What comes first'].some((s) => text.includes(s)));
    }
    assert.match(await say(outcome), /proposed/i);
    assert.match(await say(outcome), /not applied|accept/i);
  });

  test('with no editor open there is nothing to propose to, and the words say so', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const outcome = await launcher.propose({ changes: [EXTRA] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /no editor is open/i);
  });

  test('a mod with no way to make a key opens the editor and proposes nothing', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where, { proposals: false });
    await opens(launcher, where.plan);
    const outcome = await launcher.propose({ changes: [EXTRA] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /not available/i);
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
  });
});

describe('a proposal is written by the store, whole and in turn (cc_claude_proposes)', () => {
  /** A store over the vault, with the file steps handed in, and a proposal as the server's proposer route hands it. */
  async function storeOver(where, files) {
    const { NoteStore } = await import('../server/editor-store.ts');
    const store = await NoteStore.create({ vault: where.vault, drafts: where.data, ...(files ? { files } : {}) });
    const opened = await store.open(where.plan);
    const propose = (changes) =>
      store.api({
        method: 'PUT',
        path: `notes/${opened.id}/proposal`,
        body: JSON.stringify({ changes }),
        headers: {},
        as: 'proposer',
      });
    return { store, propose, id: opened.id };
  }

  test('a write that fails leaves the note as it was and no temporary file beside it', async () => {
    const { NODE_FILES } = await import('../server/note-file.ts');
    const where = modVault();
    const { store, propose } = await storeOver(where, {
      ...NODE_FILES,
      rename: async () => {
        throw new Error('the disk is full');
      },
    });
    const folder = readdirSync(dirname(where.plan)).sort();
    const reply = await propose([EXTRA]);
    assert.equal(reply.status, 500);
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
    assert.deepEqual(readdirSync(dirname(where.plan)).sort(), folder);
    await store.stop();
  });

  test('two proposals made together are both kept, one after the other, and neither overwrites the other', async () => {
    const where = modVault();
    const { store, propose } = await storeOver(where);
    const [a, b] = await Promise.all([propose([EXTRA]), propose([RENAME])]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    const note = readFileSync(where.plan, 'utf8');
    assert.equal((note.match(/CHANGE SET/g) ?? []).length, 2);
    assert.equal(gqlSpans(note)[0].text, gqlSpans(PLAN)[0].text);
    await store.stop();
  });

  test('the note’s mode is kept, and the same proposal twice is one change set, the second refused', async () => {
    const where = modVault();
    const { store, propose } = await storeOver(where);
    const mode = statSync(where.plan).mode;
    assert.equal((await propose([EXTRA])).status, 200);
    assert.equal(statSync(where.plan).mode, mode);
    const again = await propose([EXTRA]);
    assert.equal(again.status, 409);
    assert.match(JSON.parse(again.text).why, /already/);
    assert.equal((readFileSync(where.plan, 'utf8').match(/CHANGE SET/g) ?? []).length, 1);
    await store.stop();
  });

  test('a stopped store writes no proposal', async () => {
    const where = modVault();
    const { store, propose } = await storeOver(where);
    await store.stop();
    assert.equal((await propose([EXTRA])).status, 503);
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
  });
});

describe('a proposal touching content above Claude’s clearance is refused (cc_claude_proposes, cc_classified_asks)', () => {
  test('a note raised above Claude’s ceiling after it opened takes no proposal, and says which levels, not its text', async () => {
    const { where, launcher } = await opened();
    writeNote(where, 'plan.md', 'Confidential', PLAN);
    const raised = readFileSync(where.plan, 'utf8');
    const outcome = await launcher.propose({ changes: [EXTRA] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /Confidential/);
    assert.match(outcome.why, /Internal/);
    assert.ok(!outcome.why.includes('What comes first'));
    assert.equal(readFileSync(where.plan, 'utf8'), raised, 'nothing was written');
  });

  test('a note raised to the highest classification takes none, whatever the ceiling', async () => {
    const where = modVault();
    const { launcher } = await opened({ ceiling: 'Restricted' }, where);
    writeNote(where, 'plan.md', 'Restricted', PLAN);
    const raised = readFileSync(where.plan, 'utf8');
    const outcome = await launcher.propose({ changes: [EXTRA] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /highest/);
    assert.equal(readFileSync(where.plan, 'utf8'), raised);
  });

  test('a note the user said yes to takes one, but a note changed by another program since needs a new yes', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const path = writeNote(where, 'ask.md', 'Confidential', PLAN);
    assert.equal((await launcher.edit(path)).held, 'asks');
    assert.equal((await launcher.confirm()).ok, true);
    assert.equal((await launcher.propose({ changes: [EXTRA] })).ok, true, 'the yes covers the note it was given about');
    writeNote(where, 'ask.md', 'Confidential', `${PLAN}Changed by another program.\n`);
    const refused = await launcher.propose({ changes: [RENAME] });
    assert.equal(refused.ok, false);
    assert.match(refused.why, /does not cover/);
  });

  test('a change that carries a credential is refused, named by kind and never quoted, and nothing is written', async () => {
    const { where, launcher } = await opened();
    const secret = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);
    const outcome = await launcher.propose({
      changes: [{ op: 'add-thing', name: 'vault', kind: 'Task', properties: { db_password: secret } }],
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /password or secret/);
    assert.ok(!JSON.stringify(outcome).includes(secret));
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
  });

  test('a note that cannot be read for its classification takes none: an unknown label is above every ceiling', async () => {
    const where = modVault();
    const { launcher } = await opened({}, where);
    writeNote(where, 'plan.md', 'Top Secret', PLAN);
    const outcome = await launcher.propose({ changes: [EXTRA] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /unknown classification/);
  });

  test('a proposal that makes no sense is refused with its reason and writes nothing', async () => {
    const { where, launcher } = await opened();
    for (const changes of [[], [{ op: 'nonsense' }], [{ op: 'set', thing: 'start' }], 'x']) {
      const outcome = await launcher.propose({ changes });
      assert.equal(outcome.ok, false);
      assert.match(outcome.why, /./);
    }
    assert.equal((await launcher.propose({ changes: [{ op: 'remove-thing', thing: 'nobody' }] })).ok, false);
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN);
  });
});
