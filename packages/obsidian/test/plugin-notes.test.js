// The plug-in reads and writes every note through the one storage interface (editor spec §41, storage_contract). Only
// the vault's backend (src/storage/) calls the vault's own reads and writes of a note. So a layer, such as encryption or
// history, plugs in at one place and sees every note. A file that is not a note is still the vault's, each named here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** The vault's own reads and writes of a file's text. */
const VAULT_TEXT = /\bvault\s*\.\s*(read|cachedRead|process|modify|create|append)\s*\(/g;

/** Files that read or write through the vault what is not a note, and why. */
const NOT_NOTES = {
  'export/vault-write.ts': 'an export, such as a picture or a data file',
  'outside/outside-plugins.ts': "a plug-in's code, a .js file",
  'sources/source-read.ts': 'a .gql file a graph reads from',
};

/** Every TypeScript file under `dir`, by its path from src/. */
const sources = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

test('no file outside the vault’s note storage reads or writes a note through the vault’s own API', () => {
  const found = [];
  for (const path of sources(SRC)) {
    const name = relative(SRC, path).split('\\').join('/');
    if (name.startsWith('storage/') || name in NOT_NOTES) continue;
    for (const m of readFileSync(path, 'utf8').matchAll(VAULT_TEXT)) found.push(`${name}: vault.${m[1]}`);
  }
  assert.deepEqual(found, [], 'read and write notes through storage/plugin-notes.ts');
});

test('each file let read or write what is not a note still does, so none is let off for nothing', () => {
  for (const name of Object.keys(NOT_NOTES))
    assert.match(
      readFileSync(join(SRC, name), 'utf8'),
      new RegExp(VAULT_TEXT.source),
      `${name} no longer needs naming here`,
    );
});
