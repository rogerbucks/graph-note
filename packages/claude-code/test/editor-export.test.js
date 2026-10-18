// The browser editor's export (editor spec §26, workstream C6; test_cc_export). The page makes the files. The server
// writes them (cc_exports_new_only):
// - only as new files in the export folder;
// - never over an existing file, and never outside the vault;
// - never under a name that is more than a name;
// - all of an export or none of it.
// Each case is tried on the real store and a running server. The escapes are laid out in a real vault on disk
// (editor-store-support.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoteStore } from '../server/editor-store.ts';
import { startEditorServer } from '../server/start-server.ts';
import { Exporter, withExport, EXPORT_BODY_LIMIT } from '../server/export-api.ts';
import { NODE_EXPORT_FS } from '../server/export-files.ts';
import { ask } from './editor-threats-support.js';
import { bearer, handWatch, tempVault, writing } from './editor-store-support.js';

/** The first eight bytes of every PNG, and a few more: enough to be one. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n';

/** A store with the plan note open, an exporter over it and a server serving both. */
async function exporting(v, { exportFolder = '', fs } = {}) {
  const store = await NoteStore.create({ vault: v.vault, drafts: v.data, watch: handWatch().watch });
  const opened = await store.open('Notes/plan.md');
  assert.equal(opened.ok, true);
  const exporter = new Exporter({
    vault: store.vault,
    exportFolder,
    notePath: (id) => store.pathOf(id),
    ...(fs ? { fs } : {}),
  });
  const server = await startEditorServer({
    api: withExport(exporter, store.api),
    drain: async () => {
      await store.stop();
      await exporter.stop();
    },
  });
  after(() => server.stop());
  return { store, exporter, server, id: opened.id };
}

const target = (s, id, headers = bearer(s)) => ask(s.port, { path: `/api/export/${id}`, headers });
const send = (s, id, files, headers = { ...writing(s), 'content-type': 'application/json' }) =>
  ask(s.port, { method: 'PUT', path: `/api/export/${id}`, headers, body: JSON.stringify({ files }) });
const svg = (name, text = SVG) => ({ name, text });
const png = (name, bytes = PNG) => ({ name, base64: Buffer.from(bytes).toString('base64') });
const listing = (dir) => readdirSync(dir).sort();

describe('cc_exports_new_only: where an export goes', () => {
  test('with no export folder set, the note’s own folder; the page is told it, and the note’s path', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const got = await target(server, id);
    assert.equal(got.status, 200);
    assert.deepEqual(JSON.parse(got.text), { note: 'Notes/plan.md', folder: 'Notes' });
  });

  test('the export folder set, made if it is not there; the files are new, their bytes the page’s', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v, { exportFolder: 'Exports/Graphs' });
    assert.deepEqual(JSON.parse((await target(server, id)).text).folder, 'Exports/Graphs');
    const made = await send(server, id, [svg('plan.svg'), png('plan.png'), { name: 'plan.csv', text: 'a,b\n' }]);
    assert.equal(made.status, 200, made.text);
    assert.deepEqual(JSON.parse(made.text), { written: ['plan.svg', 'plan.png', 'plan.csv'] });
    const dir = join(v.vault, 'Exports/Graphs');
    assert.deepEqual(listing(dir), ['plan.csv', 'plan.png', 'plan.svg']);
    assert.equal(readFileSync(join(dir, 'plan.svg'), 'utf8'), SVG);
    assert.deepEqual(readFileSync(join(dir, 'plan.png')), PNG);
    assert.equal(lstatSync(join(dir, 'plan.png')).mode & 0o777 & ~0o644, 0, 'no wider than the usual mode');
    assert.equal(existsSync(join(v.vault, 'Notes/plan.svg')), false, 'not beside the note');
  });

  test('an export folder that is a link leading out of the vault is refused, and nothing is written anywhere', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v, { exportFolder: 'Linked' });
    const before = listing(v.outside);
    const made = await send(server, id, [svg('plan.svg')]);
    assert.equal(made.status, 403, made.text);
    assert.match(made.text, /link|outside/i);
    assert.deepEqual(listing(v.outside), before);
  });

  test('an export folder that is a link inside the vault is refused too: a link is never followed', async () => {
    const v = tempVault();
    mkdirSync(join(v.vault, 'Real'));
    symlinkSync(join(v.vault, 'Real'), join(v.vault, 'Alias'));
    const { server, id } = await exporting(v, { exportFolder: 'Alias' });
    assert.equal((await send(server, id, [svg('plan.svg')])).status, 403);
    assert.deepEqual(listing(join(v.vault, 'Real')), []);
  });

  test('a folder part that is a link, deeper down, is refused as well', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v, { exportFolder: 'Linked/Deeper' });
    assert.equal((await send(server, id, [svg('plan.svg')])).status, 403);
    assert.deepEqual(listing(v.outside), ['secret.md']);
  });

  test('an export folder that could not be one (a hidden folder, .., a full path) is refused, never used', async () => {
    const v = tempVault();
    for (const bad of ['.obsidian', '../outside', '/etc', 'a/../..']) {
      const { server, id } = await exporting(v, { exportFolder: bad });
      const made = await send(server, id, [svg('plan.svg')]);
      assert.equal(made.status, 403, `${bad}: ${made.text}`);
    }
    assert.equal(existsSync(join(v.vault, '.obsidian/plan.svg')), false);
    assert.deepEqual(listing(v.outside), ['secret.md']);
  });

  test('an export folder that is a file is refused', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v, { exportFolder: 'readme.txt' });
    assert.equal((await send(server, id, [svg('plan.svg')])).status, 403);
    assert.equal(readFileSync(join(v.vault, 'readme.txt'), 'utf8'), 'Not a note.\n');
  });
});

describe('cc_exports_new_only: never over an existing file', () => {
  test('a name already taken gets the first free number, and the earlier file is as it was', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    writeFileSync(join(v.vault, 'Notes/plan.svg'), 'The first export.\n');
    const made = await send(server, id, [svg('plan.svg')]);
    assert.deepEqual(JSON.parse(made.text), { written: ['plan-2.svg'] });
    assert.equal(readFileSync(join(v.vault, 'Notes/plan.svg'), 'utf8'), 'The first export.\n');
    assert.equal(readFileSync(join(v.vault, 'Notes/plan-2.svg'), 'utf8'), SVG);
    const again = await send(server, id, [svg('plan.svg')]);
    assert.deepEqual(JSON.parse(again.text), { written: ['plan-3.svg'] });
  });

  test('the files of one export share one number, so a clash on any of them moves them all', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    writeFileSync(join(v.vault, 'Notes/plan-page-2-of-2.png'), 'Earlier.\n');
    const made = await send(server, id, [png('plan-page-1-of-2.png'), png('plan-page-2-of-2.png')]);
    assert.deepEqual(JSON.parse(made.text), { written: ['plan-page-1-of-2-2.png', 'plan-page-2-of-2-2.png'] });
    assert.equal(readFileSync(join(v.vault, 'Notes/plan-page-2-of-2.png'), 'utf8'), 'Earlier.\n');
    assert.equal(existsSync(join(v.vault, 'Notes/plan-page-1-of-2.png')), false, 'none written under the first names');
  });

  test('a link at the name is never written through, even to a file in the vault or one outside it', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    symlinkSync(join(v.outside, 'secret.md'), join(v.vault, 'Notes/out.svg'));
    symlinkSync(join(v.vault, 'readme.txt'), join(v.vault, 'Notes/in.svg'));
    symlinkSync(join(v.outside, 'not-yet.svg'), join(v.vault, 'Notes/dangling.svg'));
    const made = await send(server, id, [svg('out.svg'), svg('in.svg'), svg('dangling.svg')]);
    assert.deepEqual(JSON.parse(made.text), { written: ['out-2.svg', 'in-2.svg', 'dangling-2.svg'] });
    assert.equal(readFileSync(join(v.outside, 'secret.md'), 'utf8'), 'Outside the vault.\n');
    assert.equal(readFileSync(join(v.vault, 'readme.txt'), 'utf8'), 'Not a note.\n');
    assert.equal(existsSync(join(v.outside, 'not-yet.svg')), false);
  });

  test('a file that appears between the check and the write is still not written over: the create is exclusive', async () => {
    const v = tempVault();
    let raced = false;
    const fs = {
      ...NODE_EXPORT_FS,
      async open(path, flags, mode) {
        if (!raced && path.endsWith('plan.svg')) {
          raced = true;
          writeFileSync(path, 'Made by another program.\n');
        }
        return NODE_EXPORT_FS.open(path, flags, mode);
      },
    };
    const { server, id } = await exporting(v, { fs });
    const made = await send(server, id, [svg('plan.svg'), svg('plan.csv')]);
    assert.deepEqual(JSON.parse(made.text), { written: ['plan-2.svg', 'plan-2.csv'] });
    assert.equal(readFileSync(join(v.vault, 'Notes/plan.svg'), 'utf8'), 'Made by another program.\n');
    assert.equal(existsSync(join(v.vault, 'Notes/plan.csv')), false, 'the others moved with it');
  });

  test('the writer opens files only to create them: no truncate, no append, no write-over', () => {
    const source = readFileSync(fileURLToPath(new URL('../server/export-files.ts', import.meta.url)), 'utf8');
    assert.match(source, /O_EXCL/);
    assert.match(source, /O_NOFOLLOW/);
    assert.doesNotMatch(source, /O_TRUNC|O_APPEND|writeFile|appendFile|rename|copyFile|'w'|"w"|'a'|'r\+'/);
  });

  test('a write that fails part way takes away the files it made, and no earlier file is touched', async () => {
    const v = tempVault();
    writeFileSync(join(v.vault, 'Notes/earlier.svg'), 'Earlier.\n');
    let opens = 0;
    const fs = {
      ...NODE_EXPORT_FS,
      async open(path, flags, mode) {
        if (++opens === 2) throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
        return NODE_EXPORT_FS.open(path, flags, mode);
      },
    };
    const { server, id } = await exporting(v, { fs });
    const made = await send(server, id, [svg('a.svg'), svg('b.svg')]);
    assert.equal(made.status, 500, made.text);
    assert.match(made.text, /disk is full|Nothing was saved/);
    assert.deepEqual(
      listing(join(v.vault, 'Notes')).filter((n) => n.endsWith('.svg')),
      ['earlier.svg'],
    );
    assert.equal(readFileSync(join(v.vault, 'Notes/earlier.svg'), 'utf8'), 'Earlier.\n');
  });
});

describe('cc_exports_new_only: a name is only a name', () => {
  const BAD = [
    '../escape.svg',
    '..',
    'a/../b.svg',
    'sub/plan.svg',
    '/etc/plan.svg',
    'sub\\plan.svg',
    'plan..svg',
    '.hidden.svg',
    'plan.svg.',
    'plan.svg ',
    'plan\0.svg',
    'plan\n.svg',
    'C:plan.svg',
    'plan?.svg',
    'plan.exe',
    'plan.md.sh',
    'plan',
    '',
    `${'x'.repeat(300)}.svg`,
  ];
  for (const name of BAD) {
    test(`${JSON.stringify(name).slice(0, 40)} is refused, and nothing is written`, async () => {
      const v = tempVault();
      const { server, id } = await exporting(v);
      const before = [listing(join(v.vault, 'Notes')), listing(v.vault), listing(v.outside), listing(v.top)];
      const made = await send(server, id, [svg('fine.svg'), svg(name)]);
      assert.equal(made.status, 400, made.text);
      assert.deepEqual(
        [listing(join(v.vault, 'Notes')), listing(v.vault), listing(v.outside), listing(v.top)],
        before,
        'the good file beside it is not written either',
      );
    });
  }

  test('the same name twice, no files, too many files, and a file that is neither text nor base64 are refused', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const before = listing(join(v.vault, 'Notes'));
    for (const files of [
      [svg('a.svg'), svg('a.svg')],
      [],
      Array.from({ length: 101 }, (_, i) => svg(`p${i}.svg`)),
      [{ name: 'a.svg' }],
      [{ name: 'a.svg', text: 'x', base64: 'eA==' }],
      [{ name: 'a.svg', text: 5 }],
      [{ name: 'a.png', text: 'not base64 and not a PNG' }],
      [{ name: 'a.png', base64: 'not base64!' }],
      [png('a.png', Buffer.from('not a png at all'))],
      [{ name: 'a.svg', base64: Buffer.from('x').toString('base64') }],
      'files',
    ]) {
      const made = await send(server, id, files);
      assert.equal(made.status, 400, JSON.stringify(files).slice(0, 80));
    }
    assert.deepEqual(listing(join(v.vault, 'Notes')), before);
  });

  test('a body that is not JSON of the right shape is refused', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const headers = { ...writing(server), 'content-type': 'application/json' };
    for (const body of ['', 'nope', '[]', '{"files":{}}', '{"path":"../x","files":[]}']) {
      const made = await ask(server.port, { method: 'PUT', path: `/api/export/${id}`, headers, body });
      assert.equal(made.status, 400, body);
    }
  });
});

describe('cc_exports_new_only: the request carries the server’s checks', () => {
  test('no token is 401, a wrong Host or Origin is 403, and nothing is written', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const files = [svg('plan.svg')];
    const own = { ...writing(server), 'content-type': 'application/json' };
    const { authorization, ...noToken } = own;
    assert.ok(authorization);
    assert.equal((await send(server, id, files, noToken)).status, 401);
    assert.equal((await send(server, id, files, { ...own, authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await send(server, id, files, { ...own, origin: 'http://evil.example' })).status, 403);
    assert.equal((await send(server, id, files, { ...own, 'sec-fetch-site': 'cross-site' })).status, 403);
    const { origin, ...noOrigin } = own;
    assert.ok(origin);
    assert.equal((await send(server, id, files, noOrigin)).status, 403, 'a change needs the server’s own origin');
    assert.equal((await send(server, id, files, { ...own, host: 'evil.example' })).status, 403);
    assert.equal((await target(server, id, {})).status, 401);
    assert.equal(existsSync(join(v.vault, 'Notes/plan.svg')), false);
  });

  test('a note that was never opened has no export, and a path never comes from the request', async () => {
    const v = tempVault();
    const { server } = await exporting(v);
    assert.equal((await target(server, '0'.repeat(32))).status, 404);
    assert.equal((await send(server, '0'.repeat(32), [svg('plan.svg')])).status, 404);
    assert.equal((await send(server, '../../outside', [svg('plan.svg')])).status, 404);
    assert.equal((await send(server, 'Notes%2Fplan.md', [svg('plan.svg')])).status, 404);
  });

  test('the body is held to a limit of its own, refused before it is read', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const headers = { ...writing(server), 'content-type': 'application/json' };
    const over = await ask(server.port, {
      method: 'PUT',
      path: `/api/export/${id}`,
      headers: { ...headers, 'content-length': String(EXPORT_BODY_LIMIT + 1) },
      body: '{',
    });
    assert.equal(over.status, 413);
    assert.deepEqual(
      listing(join(v.vault, 'Notes')).filter((n) => n.endsWith('.csv')),
      [],
    );
    // larger than a note may be, smaller than an export may
    const image = await send(server, id, [{ name: 'big.csv', text: 'x'.repeat(600_000) }]);
    assert.equal(image.status, 200);
  });

  test('a note’s own routes keep the note’s limit: the export’s larger one is for the export alone', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const headers = { ...writing(server), 'if-match': 'x' };
    const put = await ask(server.port, {
      method: 'PUT',
      path: `/api/notes/${id}`,
      headers,
      body: 'x'.repeat(600_000),
    });
    assert.equal(put.status, 413);
  });

  test('a stopped server writes nothing', async () => {
    const v = tempVault();
    const { server, id, exporter } = await exporting(v);
    await exporter.stop();
    const made = await send(server, id, [svg('plan.svg')]);
    assert.equal(made.status, 503);
    assert.equal(existsSync(join(v.vault, 'Notes/plan.svg')), false);
  });

  test('the export is the only thing the new route does: settings and notes answer as before', async () => {
    const v = tempVault();
    const { server, id } = await exporting(v);
    const note = await ask(server.port, { path: `/api/notes/${id}`, headers: bearer(server) });
    assert.equal(note.status, 200);
    assert.equal(
      (await ask(server.port, { method: 'POST', path: `/api/export/${id}`, headers: writing(server) })).status,
      405,
    );
    assert.equal(
      (await ask(server.port, { method: 'DELETE', path: `/api/export/${id}`, headers: writing(server) })).status,
      405,
    );
  });
});
