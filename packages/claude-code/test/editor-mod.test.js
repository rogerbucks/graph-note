// The browser editor from the Claude Code mod (editor spec §26, slice 4; workstream C2; test_cc_mod, partial until C3 and
// C7 add their cases at the end of this file): `/graph edit` starts
// the session's server on the shipped process, as the host starts one, and hands back an address only the pane may draw;
// a start that fails says why; one session, one server; and the server stops on every trigger the rules name. The
// launcher is tried over real processes started the way `$.process.spawn` starts them. A test asserts the work done,
// never the time taken: no fixed sleep, no clock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ask, reachable } from './editor-threats-support.js';
import { COMPOSER, PLAN, launcherFor, modVault, opens, partsOf, writeNote } from './editor-mod-support.js';
import * as launch from '../src/editor-launch.ts';

const { editArgs, sayEdit, sayStopped } = launch;
const confirmArgs = (args) => launch.confirmArgs(args);

/** The page's own first call: the note by the id and token the address carries. */
const readNote = (link) => {
  const { port, token, note } = partsOf(link);
  return ask(port, { path: `/api/notes/${note}`, headers: { authorization: `Bearer ${token}` } });
};

describe('/graph edit opens the editor (cc_editor_opens)', () => {
  test('the address carries the token and the note’s id in its fragment, and the note is served by that id', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const outcome = await launcher.edit(where.plan);
    assert.deepEqual(outcome, { ok: true, title: 'plan.md', reused: false });
    const { url, token, note, port } = partsOf(launcher.link);
    assert.deepEqual([url.hostname, url.pathname, url.search], ['127.0.0.1', '/', '']);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(note, /^[0-9a-f]{32}$/);
    const page = await ask(port, { path: '/' });
    assert.equal(page.status, 200);
    const got = await readNote(launcher.link);
    assert.equal(got.status, 200);
    assert.equal(JSON.parse(got.text).text, PLAN);
  });

  test('a path relative to the session’s folder is the same note, and the folder holding .obsidian is its vault', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    await opens(launcher, 'vault/Notes/plan.md');
    assert.equal((await readNote(launcher.link)).status, 200);
    // a note beside it in the vault opens (the vault is the folder with .obsidian), though it is not in the note's folder
    const other = launcherFor(where);
    assert.equal((await other.launcher.edit('vault/Notes/../Notes/other.md')).ok, true);
  });

  test('a note with no vault above it is its own folder’s, and only it can be opened by the page', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    await opens(launcher, 'loose/solo.md');
    const { port, token, note } = partsOf(launcher.link);
    const guess = await ask(port, {
      path: '/api/notes/0123456789abcdef0123456789abcdef',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(guess.status, 404, 'an id never given is no note');
    assert.equal((await ask(port, { path: `/api/notes/${note}` })).status, 401, 'no token, no note');
  });

  test('the server is handed its vault and note by the environment, never an argument', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    const [request] = host.requests;
    assert.deepEqual(
      request.argv.slice(1).filter((a) => !a.endsWith('editor-server.ts')),
      [],
    );
    assert.equal(request.env.THOUGHTKNOT_EDITOR_VAULT, where.vault);
    assert.equal(request.env.THOUGHTKNOT_EDITOR_NOTE, where.plan);
    assert.equal(request.env.THOUGHTKNOT_EDITOR_DRAFTS, where.data);
    assert.equal(request.env.THOUGHTKNOT_EDITOR_INPUT, 'ignore');
  });

  test('a server whose input the host closed at once keeps serving', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    await launcher.edit(where.plan);
    // the host closes the child's input when it starts it; the session's end is its kill, not that close
    for (let i = 0; i < 20; i++) assert.equal((await readNote(launcher.link)).status, 200);
  });

  test('/graph edit and its note are read from the command line, and /graph stop', () => {
    assert.equal(editArgs('edit Notes/plan.md'), 'Notes/plan.md');
    assert.equal(editArgs('  edit   "My notes/plan.md" '), 'My notes/plan.md');
    assert.equal(editArgs("edit 'plan.md'"), 'plan.md');
    assert.equal(editArgs('edit'), '');
    assert.equal(editArgs('Notes/plan.md'), null, 'a note named alone is /graph’s own drawing');
    assert.equal(editArgs('editor/plan.md'), null, 'a folder that starts with the word is not the command');
  });
});

describe('a start that fails is shown plainly (cc_start_failure)', () => {
  test('a note that may not be opened says why, and starts no server', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    for (const [given, why] of [
      [where.plan.replace('plan.md', 'missing.md'), /./],
      [join(where.vault, 'Notes', 'readme.txt'), /\.md/],
      [join(where.top, 'loose', 'solo.md').replace('solo', 'none'), /./],
    ]) {
      const outcome = await launcher.edit(given);
      assert.equal(outcome.ok, false);
      assert.match(outcome.why, why);
      assert.equal(launcher.link, null);
    }
  });

  test('a node that is not there is said in words with what to do', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where, { ports: { server: ['/no/such/node', 'server.mjs'] } });
    const outcome = await launcher.edit(where.plan);
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /node/i);
    assert.match(outcome.why, /install|path/i);
    assert.match(sayEdit(outcome), /not started/i);
    assert.equal(launcher.link, null);
  });

  test('a server that stops before it is ready says what it said, and the next try starts afresh', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where, { ports: { drafts: where.vault + '/Notes' } });
    const outcome = await launcher.edit(where.plan);
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /drafts/i, 'the reason is the server’s own, drafts inside the vault being refused');
    assert.equal(launcher.link, null);
    assert.equal(host.requests.length, 1);
    const again = await launcher.edit(where.plan);
    assert.equal(again.ok, false);
    assert.equal(host.requests.length, 2, 'a failure is not remembered as a server');
  });

  test('a server that hands over no address is killed, and gone before the failure is said', async () => {
    const where = modVault();
    const silly = [process.execPath, '-e', "console.log('not an address'); setInterval(() => {}, 1e6);"];
    const { launcher, host } = launcherFor(where, { ports: { server: silly } });
    const outcome = await launcher.edit(where.plan);
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /address/);
    const [child] = host.children;
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'the child has exited, not been left running');
    assert.equal(launcher.link, null);
  });

  test('a server never ready is killed at the start timeout, driven by hand, and the failure is said', async () => {
    const where = modVault();
    // never prints; its own exit after a while is only a safety net, so a launcher with no timeout fails instead of hanging
    const quiet = [process.execPath, '-e', 'setInterval(() => {}, 1e6); setTimeout(() => process.exit(3), 4000);'];
    let fire = () => {};
    let asked;
    const registered = new Promise((resolve) => (asked = resolve));
    const after = (ms, fn) => {
      fire = fn;
      asked(ms);
      return { cancel: () => {} };
    };
    const { launcher, host } = launcherFor(where, { ports: { server: quiet, after } });
    const pending = launcher.edit(where.plan);
    const ms = await Promise.race([registered, pending]);
    assert.equal(typeof ms, 'number', 'the launcher asked for a start timeout');
    assert.ok(ms >= 5000 && ms <= 60000, 'a wait of seconds, not an instant or for ever');
    fire();
    const outcome = await pending;
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /did not become ready/);
    const [child] = host.children;
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'the child has exited');
    assert.equal(launcher.link, null);
  });

  test('a start that fails still leaves /graph’s drawing to be shown: the words for it name the drawing', () => {
    const words = sayEdit({ ok: false, why: 'The note is not inside the vault.' });
    assert.match(words, /^The editor was not started: The note is not inside the vault\./);
    assert.match(words, /drawing/i);
  });
});

describe('nothing secret reaches the conversation (cc_transcript_clean)', () => {
  test('neither the token, the address nor the note’s text is in anything the launcher says', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const outcome = await launcher.edit(where.plan);
    const reused = await launcher.edit(where.plan);
    const { token, note } = partsOf(launcher.link);
    const said = [
      JSON.stringify(outcome),
      sayEdit(outcome),
      sayEdit(reused),
      JSON.stringify(launcher),
      sayStopped('idle'),
    ];
    said.push(...host.requests.map((r) => JSON.stringify(r)), String(launcher.ended));
    for (const text of said) {
      assert.ok(!text.includes(token), 'no token');
      assert.ok(!text.includes(note), 'no note id');
      assert.ok(!text.includes(launcher.link), 'no address');
      assert.ok(!text.includes('What comes first'), 'no note text');
    }
    assert.match(sayEdit(outcome), /plan\.md/, 'it does say which note');
  });

  test('a failed start repeats neither the token nor the note’s text, though the server wrote on stderr', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where, { ports: { drafts: where.vault + '/Notes' } });
    const outcome = await launcher.edit(where.plan);
    assert.equal(outcome.ok, false);
    assert.ok(!JSON.stringify(outcome).includes('What comes first'));
  });

  test('the address is held by the launcher alone: the module’s hooks never pass it into a command’s answer', () => {
    const register = readFileSync(new URL('../mod/hooks/register.tsx', import.meta.url), 'utf8');
    const uses = register.split('\n').filter((line) => /\.link\b/.test(line));
    assert.equal(uses.length, 1, `the address is read in one place, to draw: ${uses.join(' | ')}`);
    assert.match(uses[0], /href/, 'and that place is the link the pane draws');
  });

  test('the server’s output is read by the launcher alone and its first line is the only one it uses', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    assert.equal(host.requests.length, 1);
    assert.deepEqual(readdirSync(where.top).sort(), ['data', 'loose', 'vault'], 'no file written beside the vault');
  });
});

describe('one server for each session (cc_one_server)', () => {
  test('a second /graph edit of the same note reuses the server, address and all', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    const first = launcher.link;
    assert.deepEqual(await launcher.edit(where.plan), { ok: true, title: 'plan.md', reused: true });
    assert.equal(launcher.link, first);
    assert.equal(host.requests.length, 1);
  });

  test('edits begun together share one start', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const [a, b, c] = await Promise.all([
      launcher.edit(where.plan),
      launcher.edit(where.plan),
      launcher.edit(where.plan),
    ]);
    assert.deepEqual([a.ok, b.ok, c.ok], [true, true, true]);
    assert.equal(host.requests.length, 1);
    assert.equal(host.children.filter((p) => p.exitCode === null && p.signalCode === null).length, 1);
  });

  test('another note replaces the session’s server: the first is stopped before the second is served', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    const first = partsOf(launcher.link);
    assert.deepEqual(await launcher.edit(where.other), { ok: true, title: 'other.md', reused: false });
    const second = partsOf(launcher.link);
    assert.equal(host.requests.length, 2);
    assert.notEqual(second.token, first.token);
    assert.equal(await reachable('127.0.0.1', first.port), false, 'the first server is gone');
    assert.equal((await readNote(launcher.link)).status, 200);
  });

  test('two sessions each have a server of their own, and neither token opens the other', async () => {
    const where = modVault();
    const a = launcherFor(where).launcher;
    const b = launcherFor(where).launcher;
    await Promise.all([a.edit(where.plan), b.edit(where.plan)]);
    const [one, two] = [partsOf(a.link), partsOf(b.link)];
    assert.notEqual(one.port, two.port);
    assert.notEqual(one.token, two.token);
    assert.notEqual(one.note, two.note);
    const crossed = await ask(two.port, {
      path: `/api/notes/${two.note}`,
      headers: { authorization: `Bearer ${one.token}` },
    });
    assert.equal(crossed.status, 401);
    await a.stop('one session ended');
    assert.equal(await reachable('127.0.0.1', one.port), false);
    assert.equal((await readNote(b.link)).status, 200, 'the other session’s server stays');
  });
});

describe('the server stops (cc_server_stops)', () => {
  test('when the session ends, the process is killed and the address is no more', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    const { port } = partsOf(launcher.link);
    assert.equal(await launcher.stop('the session ended'), true);
    assert.equal(launcher.link, null);
    assert.equal(launcher.ended, 'the session ended');
    assert.equal(await reachable('127.0.0.1', port), false);
    assert.equal(host.children[0].exitCode !== null || host.children[0].signalCode !== null, true);
  });

  test('at once on /graph stop, with no page open, and a second stop has nothing to stop', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    assert.equal(await launcher.stop('/graph stop'), false, 'nothing running, nothing said to have stopped');
    await launcher.edit(where.plan);
    const { port } = partsOf(launcher.link);
    assert.equal(await launcher.stop('/graph stop'), true);
    assert.equal(await reachable('127.0.0.1', port), false);
    assert.equal(await launcher.stop('/graph stop'), false);
    assert.match(sayStopped('/graph stop'), /stopped/i);
  });

  test('when the server ends by itself (idle, or its parent gone), the launcher forgets it and the next edit starts one', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(where.plan);
    const first = partsOf(launcher.link);
    const ended = launcher.waitForEnd();
    host.children[0].kill('SIGTERM');
    await ended;
    assert.equal(launcher.link, null);
    assert.match(launcher.ended, /SIGTERM/);
    assert.equal(await reachable('127.0.0.1', first.port), false);
    assert.deepEqual(await launcher.edit(where.plan), { ok: true, title: 'plan.md', reused: false });
    assert.equal(host.requests.length, 2);
    assert.notEqual(partsOf(launcher.link).token, first.token);
  });

  test('a stop waits for the writes the server has under way, then the process is gone', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    await launcher.edit(where.plan);
    const { port, token, note } = partsOf(launcher.link);
    const got = await readNote(launcher.link);
    const { version } = JSON.parse(got.text);
    const put = await ask(port, {
      method: 'PUT',
      path: `/api/notes/${note}`,
      headers: {
        authorization: `Bearer ${token}`,
        'if-match': version,
        origin: `http://127.0.0.1:${port}`,
        'sec-fetch-site': 'same-origin',
      },
      body: PLAN.replace('Finish', 'Done'),
    });
    assert.equal(put.status, 200);
    await launcher.stop('the session ended');
    assert.equal(readFileSync(where.plan, 'utf8'), PLAN.replace('Finish', 'Done'), 'the write that was made is whole');
  });
});

/** Whether a server was started: the host was asked for a process. */
const started = (host) => host.requests.length > 0;

describe('a note above the level set for Claude is asked about first (cc_classified_asks)', () => {
  test('a note at or below Claude’s ceiling opens with no question', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    for (const level of ['Public', 'Internal']) {
      const outcome = await launcher.edit(writeNote(where, `${level}.md`, level));
      assert.equal(outcome.ok, true, level);
    }
    assert.equal(host.requests.length, 2);
  });

  test('a note above it starts no server, shows nothing, and says which note and which levels, not its text', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Confidential', 'The hidden plan.\n');
    const outcome = await launcher.edit(path);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.held, 'asks');
    assert.match(outcome.why, /plan2\.md/);
    assert.match(outcome.why, /Confidential/);
    assert.match(outcome.why, /Internal/);
    assert.equal(started(host), false, 'no process was started, so nothing can be read');
    assert.equal(launcher.link, null);
    const words = sayEdit(outcome);
    assert.match(words, /confirm/i, 'it says how to say yes');
    assert.ok(!/drawing/i.test(words), 'the note is not drawn instead');
    assert.ok(!JSON.stringify(outcome).includes('hidden plan'));
  });

  test('/graph confirm opens the note that was asked about, once', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'));
    const opened = await launcher.confirm();
    assert.deepEqual(opened, { ok: true, title: 'plan2.md', reused: false });
    assert.equal(host.requests.length, 1);
    assert.equal((await readNote(launcher.link)).status, 200);
    const again = await launcher.confirm();
    assert.equal(again.ok, false, 'one yes is for one question');
    assert.match(again.why, /nothing/i);
    assert.equal(host.requests.length, 1);
  });

  test('with nothing asked, /graph confirm opens nothing', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const outcome = await launcher.confirm();
    assert.equal(outcome.ok, false);
    assert.match(outcome.why, /nothing/i);
    assert.equal(started(host), false);
  });

  test('a question is forgotten when another note is named or the editor is stopped', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    await launcher.edit(writeNote(where, 'plan2.md', 'Confidential'));
    await launcher.edit(where.plan);
    assert.equal((await launcher.confirm()).ok, false, 'asking about another note drops the first question');
    assert.equal(host.requests.length, 1, 'only the plan was opened');
    await launcher.stop('x');
    await launcher.edit(writeNote(where, 'plan3.md', 'Confidential'));
    await launcher.stop('/graph stop');
    assert.equal((await launcher.confirm()).ok, false, 'a stop drops it');
  });

  test('the yes is checked again: a note raised to the highest meanwhile is refused', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Confidential');
    await launcher.edit(path);
    writeNote(where, 'plan2.md', 'Restricted');
    const outcome = await launcher.confirm();
    assert.equal(outcome.ok, false);
    assert.equal(outcome.held, 'refused');
    assert.equal(started(host), false);
  });

  test('a note whose classification is raised after it opened is refused when named again, and its server stops', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const path = writeNote(where, 'plan2.md', 'Internal');
    await opens(launcher, path);
    const { port } = partsOf(launcher.link);
    writeNote(where, 'plan2.md', 'Confidential');
    const outcome = await launcher.edit(path);
    assert.equal(outcome.held, 'asks');
    assert.equal(launcher.link, null, 'the editor open for it was stopped');
    assert.equal(await reachable('127.0.0.1', port), false);
    assert.equal(host.requests.length, 1);
  });

  test('without a Claude set up, or with its ceiling gone, the ceiling is the lowest classification', async () => {
    const where = modVault();
    const a = launcherFor(where, { settings: { ceiling: null } });
    assert.equal((await a.launcher.edit(writeNote(where, 'i.md', 'Internal'))).held, 'asks');
    assert.equal((await a.launcher.edit(writeNote(where, 'p.md', 'Public'))).ok, true);
    const b = launcherFor(where, { settings: { ceiling: 'Gone' } });
    assert.equal((await b.launcher.edit(writeNote(where, 'i.md', 'Internal'))).held, 'asks');
  });

  test('/graph confirm is read from the command line', () => {
    assert.equal(confirmArgs('confirm'), true);
    assert.equal(confirmArgs('  confirm  '), true);
    assert.equal(confirmArgs('confirm plan.md'), false);
    assert.equal(confirmArgs('confirmed.md'), false);
    assert.equal(confirmArgs('edit confirm'), false);
  });

  test('/graph’s own drawing of a note is held to the same gate, so a pane never shows what the editor would not', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    assert.deepEqual(await launcher.gate(writeNote(where, 'a.md', 'Internal')), { open: true });
    assert.ok('ask' in (await launcher.gate(writeNote(where, 'b.md', 'Confidential'))));
    assert.ok('refuse' in (await launcher.gate(writeNote(where, 'c.md', 'Restricted'))));
    assert.equal(started(host), false);
  });
});

describe('the highest classification never opens, and a credential never reaches Claude (cc_credential_never)', () => {
  test('a note at the highest classification is refused with no question, whatever Claude’s ceiling is', async () => {
    const where = modVault();
    for (const ceiling of ['Internal', 'Restricted']) {
      const { launcher, host } = launcherFor(where, { settings: { ceiling } });
      const outcome = await launcher.edit(writeNote(where, 'top.md', 'Restricted'));
      assert.equal(outcome.ok, false);
      assert.equal(outcome.held, 'refused', ceiling);
      assert.match(outcome.why, /highest/);
      assert.equal(started(host), false);
      assert.equal(launcher.link, null);
      const words = sayEdit(outcome);
      assert.ok(!/confirm/i.test(words), 'there is no yes that opens it');
      assert.equal((await launcher.confirm()).ok, false, '/graph confirm cannot open it');
      assert.equal(started(host), false);
    }
  });

  test('a note with no classification counts as the level set for unlabelled notes, the highest until chosen', async () => {
    const where = modVault();
    const path = writeNote(where, 'none.md', null);
    const strict = launcherFor(where, { settings: { aiUnlabelled: 'Restricted' } });
    const refused = await strict.launcher.edit(path);
    assert.equal(refused.held, 'refused');
    assert.match(refused.why, /no classification/);
    assert.equal(started(strict.host), false);
    const asking = launcherFor(where, { settings: { aiUnlabelled: 'Confidential' } });
    assert.equal((await asking.launcher.edit(path)).held, 'asks');
    const open = launcherFor(where, { settings: { aiUnlabelled: 'Internal' } });
    assert.equal((await open.launcher.edit(path)).ok, true);
  });

  test('a classification that is not one of those set is refused', async () => {
    const where = modVault();
    const { launcher, host } = launcherFor(where);
    const outcome = await launcher.edit(writeNote(where, 'odd.md', 'Top Secret'));
    assert.equal(outcome.held, 'refused');
    assert.equal(started(host), false);
  });

  test('a credential in a note of any classification is refused, named by kind, never quoted, with no yes', async () => {
    const where = modVault();
    const secret = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);
    for (const level of ['Public', 'Internal', 'Confidential']) {
      const { launcher, host } = launcherFor(where);
      const outcome = await launcher.edit(writeNote(where, 'cred.md', level, `db_password: "${secret}"\n`));
      assert.equal(outcome.ok, false, level);
      assert.equal(outcome.held, 'refused', level);
      assert.match(outcome.why, /password or secret/);
      assert.ok(!JSON.stringify(outcome).includes(secret), 'the value is not said');
      assert.equal(started(host), false);
      assert.equal((await launcher.confirm()).ok, false);
    }
  });

  test('settings that cannot be read, or a note that cannot, fail closed: nothing opens', async () => {
    const where = modVault();
    const broken = launcherFor(where, {
      ports: {
        settings: async () => {
          throw new Error('no settings');
        },
      },
    });
    const a = await broken.launcher.edit(where.plan);
    assert.equal(a.ok, false);
    assert.equal(a.held, 'refused');
    assert.equal(started(broken.host), false);
    const noRead = launcherFor(where, {
      ports: {
        read: async () => {
          throw new Error('no such file');
        },
      },
    });
    const b = await noRead.launcher.edit(where.plan);
    assert.equal(b.ok, false);
    assert.equal(started(noRead.host), false);
  });

  test('a refusal says nothing of the note’s text, the address or a token', async () => {
    const where = modVault();
    const { launcher } = launcherFor(where);
    const outcome = await launcher.edit(writeNote(where, 'top.md', 'Restricted', 'The hidden plan.\n'));
    for (const text of [JSON.stringify(outcome), sayEdit(outcome), JSON.stringify(launcher)])
      assert.ok(!text.includes('hidden plan'));
  });
});

// C7's cases, Claude as the only AI and its proposals (cc_claude_only, cc_claude_proposes), are in
// editor-mod-claude.test.js, kept apart so this file stays under the length the conventions allow; both are test_cc_mod.
