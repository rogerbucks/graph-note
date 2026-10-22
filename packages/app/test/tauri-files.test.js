// The desktop app's notes pass the one storage contract (spec §41, standalone_app; storage_contract). The app reaches
// the disk only through its seven commands (src-tauri/src/place.rs). Here a stand-in answers them over a real folder.
// It answers as the Rust does: entries as [name, is a folder], and the text `ENOENT` when there is no file
// (app-window.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { storageContract } from '../../core/src/storage-contract.ts';
import { tauriFiles, tauriStorage } from '../src/tauri-files.ts';
import { cleanUpApp, emptyFolder, fakeInvoke } from './app-window.js';

test.after(cleanUpApp);

describe("notes kept in the desktop app's folder pass the storage contract", () => {
  for (const check of storageContract(() => tauriStorage(fakeInvoke(emptyFolder())))) test(check.name, check.run);
});

test('the app\'s "no file" is read as no note, and any other failure is said as it came', async () => {
  const files = tauriFiles(async (command) => Promise.reject(command === 'read_text' ? 'ENOENT' : 'disk full'));
  await assert.rejects(files.readText('a.md'), (e) => e.code === 'ENOENT');
  await assert.rejects(files.writeText('a.md', 'x'), (e) => e.message === 'disk full' && e.code === undefined);
  assert.equal(await tauriStorage(async (c) => Promise.reject(c === 'read_text' ? 'ENOENT' : 'x')).read('a.md'), null);
});

test('hidden folders such as .git are left out of the list of notes', async () => {
  const root = emptyFolder();
  await fs.mkdir(join(root, '.git'));
  await fs.writeFile(join(root, '.git', 'x.md'), 'no');
  await fs.writeFile(join(root, 'a.md'), 'yes');
  assert.deepEqual(await tauriStorage(fakeInvoke(root)).list(), ['a.md']);
});
