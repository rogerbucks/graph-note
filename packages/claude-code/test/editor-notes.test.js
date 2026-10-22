// The Claude Code server reads and writes every note through the one storage interface (editor spec §41,
// storage_contract). Only the folder's backend (folder-storage.ts) reads or writes a note's file itself. So a layer, such
// as encryption or history, plugs in at one place and sees every note. A file that is not a note is named here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server', import.meta.url));

/** The reads and writes of a file's text that a note's backend is made of (note-file.ts). */
const FILE_TEXT = /\b(readNoteFile|writeAtomically)\s*\(/g;

/** Files that read or write a file's text that is not a note, or that are the backend itself, and why. */
const NOT_NOTES = {
  'note-file.ts': 'the reads and writes themselves',
  'folder-storage.ts': "the folder's note storage",
  'note-drafts.ts': 'a draft, kept outside the vault',
};

test('no file but the folder’s note storage reads or writes a note’s file itself', () => {
  const found = [];
  for (const name of readdirSync(SERVER).filter((f) => f.endsWith('.ts'))) {
    if (name in NOT_NOTES) continue;
    for (const m of readFileSync(join(SERVER, name), 'utf8').matchAll(FILE_TEXT)) found.push(`${name}: ${m[1]}`);
  }
  assert.deepEqual(found, [], 'read and write notes through folder-storage.ts');
});

test('each file let read or write what is not a note still does, so none is let off for nothing', () => {
  for (const name of Object.keys(NOT_NOTES))
    assert.match(
      readFileSync(join(SERVER, name), 'utf8'),
      new RegExp(FILE_TEXT.source),
      `${name} no longer needs naming here`,
    );
});
