// Obsidian, VS Code and the app's web view read the same notes (editor spec §27, mesh_surfaces_share_data). Each host
// keeps notes through its own storage: the vault's API, the workspace's file system and the app's Tauri commands. Here
// all three sit over one folder of notes. An edit made through one shows in the other two, and the mesh index each
// builds from what it reads answers alike.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTORY, workspaceStorage } from '../src/index.ts';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { vaultStorage } from '../../obsidian/src/storage/vault-storage.ts';
import { fakeObsidian } from '../../obsidian/test/host/fake-obsidian.js';
import { tauriStorage } from '../../app/src/tauri-files.ts';

const note = (body) => ['# Shop', '', '```gql', '// graph: shop', ...body, '```', ''].join('\n');
const SHOP = note([
  "(widget:Product {name: 'Widget', price: 10}),",
  "(bolt:Part {name: 'Bolt'}),",
  '(widget)-[:USES]->(bolt)',
]);

/** The folders above each note in `disk`, and the entries of one folder, as a file system lists them. */
function entries(disk, folder) {
  const names = new Map();
  for (const path of disk.keys()) {
    if (folder && !path.startsWith(`${folder}/`)) continue;
    const [name, ...deeper] = (folder ? path.slice(folder.length + 1) : path).split('/');
    names.set(name, names.get(name) || deeper.length > 0);
  }
  return [...names];
}

/** VS Code's `workspace.fs` over the folder. */
const workspaceFiles = (disk) => ({
  readText: async (path) => {
    if (!disk.has(path)) throw Object.assign(new Error('file not found'), { code: 'FileNotFound' });
    return disk.get(path);
  },
  writeText: async (path, text) => void disk.set(path, text),
  delete: async (path) => void disk.delete(path),
  readDirectory: async (folder) => entries(disk, folder).map(([name, isFolder]) => [name, isFolder ? DIRECTORY : 1]),
  createDirectory: async () => {},
});

/** The app's Tauri commands over the folder, refusing as the app does with `ENOENT`. */
const invoke = (disk) => async (command, args) => {
  const { path, text } = args;
  if (command === 'read_text') {
    if (!disk.has(path)) throw 'ENOENT';
    return disk.get(path);
  }
  if (command === 'write_text') return void disk.set(path, text);
  if (command === 'remove_file') return void disk.delete(path);
  if (command === 'read_dir') return entries(disk, path);
  if (command === 'make_dir') return undefined;
  throw new Error(`no command ${command}`);
};

/** The three hosts, each through its own storage, over one folder holding the shop note. */
function hosts() {
  const disk = new Map([['parts/shop.md', SHOP]]);
  return {
    Obsidian: vaultStorage(fakeObsidian({ files: disk }).app),
    'VS Code': workspaceStorage(workspaceFiles(disk)),
    'the web view': tauriStorage(invoke(disk)),
  };
}

/** The mesh index a host builds from the notes it reads. */
async function indexOf(storage) {
  const ix = new MeshIndex(memoryBackend());
  for (const path of await storage.list()) ix.update(path, (await storage.read(path)).text);
  return ix;
}

describe('mesh_surfaces_share_data', () => {
  test('the three hosts list and read the same notes, byte for byte', async () => {
    const all = Object.values(hosts());
    for (const storage of all) {
      assert.deepEqual(await storage.list(), ['parts/shop.md']);
      assert.equal((await storage.read('parts/shop.md')).text, SHOP);
    }
  });

  for (const editor of ['Obsidian', 'VS Code', 'the web view']) {
    test(`an edit made in ${editor} shows in the other two from the same data`, async () => {
      const all = hosts();
      const at = all[editor];
      const edited = SHOP.replace('price: 10', 'price: 12');
      const done = await at.write('parts/shop.md', edited, { expected: (await at.read('parts/shop.md')).version });
      assert.equal(done.ok, true);
      for (const [name, storage] of Object.entries(all)) {
        assert.equal((await storage.read('parts/shop.md')).text, edited, name);
        const found = (await indexOf(storage)).find('parts/shop.md', { property: 'price', value: 12 });
        assert.deepEqual(
          found.map((f) => f.key),
          ['widget'],
          `${name}: its index reads the new price`,
        );
      }
    });
  }
});
