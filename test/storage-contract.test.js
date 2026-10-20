// Every note storage backend passes the one storage contract (editor spec §41, storage_contract). The backends are an
// Obsidian vault, a plain folder and a VS Code workspace, each run against its real code. Memory is one too. A backend
// with layers on is still a backend: encryption and history each plug in, and the contract still holds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historyLayer, layered, memoryStorage, storageContract, workspaceStorage } from '../packages/core/src/index.ts';
import { folderStorage } from '../packages/claude-code/server/folder-storage.ts';
import { vaultStorage } from '../packages/obsidian/src/storage/vault-storage.ts';
import { fakeObsidian } from '../packages/obsidian/test/host/fake-obsidian.js';

/** A stand-in for `vscode.workspace.fs` over files in memory, each by its path; folders are kept as made. */
function fakeWorkspace() {
  const files = new Map(),
    folders = new Set(['']);
  const missing = () => Object.assign(new Error('file not found'), { code: 'FileNotFound' });
  const parentsOf = (path) => path.split('/').map((_, i, parts) => parts.slice(0, i).join('/'));
  return {
    // the bytes kept as VS Code keeps them, read and written as UTF-8 as the plugin hands them in
    readText: async (path) => {
      if (!files.has(path)) throw missing();
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(files.get(path));
    },
    writeText: async (path, text) => {
      if (!parentsOf(path).every((p) => folders.has(p))) throw missing();
      files.set(path, new TextEncoder().encode(text));
    },
    delete: async (path) => {
      if (!files.delete(path)) throw missing();
    },
    readDirectory: async (folder) => {
      const inside = (p) => (folder ? p.startsWith(`${folder}/`) : true) && p !== folder;
      const names = new Map();
      for (const p of [...files.keys(), ...folders].filter((p) => p && inside(p))) {
        const rest = folder ? p.slice(folder.length + 1) : p;
        const [name, ...deeper] = rest.split('/');
        const type = deeper.length || folders.has(p) ? 2 : 1;
        names.set(name, Math.max(names.get(name) ?? 0, type));
      }
      return [...names];
    },
    createDirectory: async (path) => {
      for (const p of [...parentsOf(path), path]) folders.add(p);
    },
  };
}

/** A toy encryption layer: each text kept reversed and marked, read back as written. Real encryption plugs in alike. */
const reversing = (inner) => {
  const seal = (text) => `sealed:${[...text].reverse().join('')}`;
  const open = (note) => note && { ...note, text: [...note.text.slice('sealed:'.length)].reverse().join('') };
  return {
    list: () => inner.list(),
    read: async (path) => open(await inner.read(path)),
    write: async (path, text, options) => {
      const done = await inner.write(path, seal(text), options);
      return done.ok ? done : { ...done, current: open(done.current) };
    },
    remove: async (path, options) => {
      const done = await inner.remove(path, options);
      return done.ok ? done : { ...done, current: open(done.current) };
    },
  };
};

const folders = [];
/** A new, empty folder with no link along its path. */
function emptyFolder() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'thoughtknot-store-')));
  folders.push(dir);
  return dir;
}

const BACKENDS = {
  memory: () => memoryStorage(),
  'a plain folder': () => folderStorage(emptyFolder()),
  'an Obsidian vault': () => vaultStorage(fakeObsidian({}).app),
  'a VS Code workspace': () => workspaceStorage(fakeWorkspace()),
  'memory, encrypted': () => layered(memoryStorage(), reversing),
  'a plain folder, with its history kept': () => layered(folderStorage(emptyFolder()), historyLayer({ record() {} })),
};

for (const [name, make] of Object.entries(BACKENDS)) {
  describe(`notes kept in ${name} pass the storage contract`, () => {
    for (const check of storageContract(make)) test(check.name, check.run);
  });
}

test.after(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

describe('the layers plug in at the storage interface', () => {
  test('an encryption layer keeps no text in the clear in the store below it', async () => {
    const below = memoryStorage();
    const store = layered(below, reversing);
    await store.write('secret.md', 'the plan');
    assert.equal((await below.read('secret.md')).text, 'sealed:nalp eht');
    assert.equal((await store.read('secret.md')).text, 'the plan');
  });

  test('the history layer keeps each change made, with who made it, and none that was refused', async () => {
    const changes = [];
    const store = layered(
      memoryStorage(),
      historyLayer({ record: (c) => changes.push(c) }, () => '2026-10-20T16:00:00Z'),
    );
    const { version } = await store.write('n.md', 'one', { author: 'ada' });
    await store.write('n.md', 'lost', { expected: 'an old version', author: 'bob' });
    await store.write('n.md', 'two', { expected: version, author: 'cy' });
    await store.remove('n.md');
    assert.deepEqual(changes, [
      { path: 'n.md', before: null, after: 'one', author: 'ada', at: '2026-10-20T16:00:00Z' },
      { path: 'n.md', before: 'one', after: 'two', author: 'cy', at: '2026-10-20T16:00:00Z' },
      { path: 'n.md', before: 'two', after: null, at: '2026-10-20T16:00:00Z' },
    ]);
  });

  test('a store with layers on is still a store: the core cannot tell them apart', async () => {
    const plain = memoryStorage(),
      both = layered(memoryStorage(), reversing, historyLayer({ record() {} }));
    for (const s of [plain, both]) await s.write('a/b.md', 'text');
    assert.deepEqual(await both.list(), await plain.list());
    assert.equal((await both.read('a/b.md')).text, (await plain.read('a/b.md')).text);
  });
});
