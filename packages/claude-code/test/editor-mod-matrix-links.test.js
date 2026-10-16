// The matrix note and links (editor spec §26, cc_classified_asks; §19, model_ceiling): the mod resolves the note's real
// path and the vault's, and refuses a note whose real path is outside the vault, whether the note or a folder above it is
// a link; with no real-path call to ask, it refuses the note too. A refused note gives no matrix, so the row clears
// nothing and both gates fail closed, saying why. The vault-only path check is in editor-mod-matrix.test.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeGate } from '@graph-note/core';
import { hostSpawn, launcherFor, modVault, writeNote } from './editor-mod-support.js';
import { realPathVia } from '../src/editor-realpath.ts';
import { settingsForServer } from '../src/editor-launch.ts';
import { storeGate } from '../server/editor-gate.ts';
import { gateSettings as serverSettings } from '../server/editor-main.ts';

const MATRIX = '| | Public | Internal |\n|---|---|---|\n| Claude chat | ✅ | ❌ |\n';
const model = {
  name: 'Claude',
  purpose: '',
  ceiling: 'Restricted',
  endpoint: '',
  model: '',
  keyName: '',
  matrixRow: 'Claude chat',
};
const settings = { ceiling: null, aiModels: [model], aiMatrixNote: 'Policy/Matrix.md', aiClassMap: {} };
const kind = (gate) => Object.keys(gate)[0];

/** A vault whose Policy folder holds a link to a matrix note kept outside it, or inside it. */
function linked(where, into) {
  const real = into === 'outside' ? join(where.top, 'elsewhere') : join(where.vault, 'Kept');
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'Matrix.md'), MATRIX);
  mkdirSync(join(where.vault, 'Policy'));
  return real;
}

/** A launcher that records every path it is asked to read. */
function watched(where, over = {}) {
  const reads = [];
  const made = launcherFor(where, {
    settings,
    ports: { read: async (path) => (reads.push(path), readFileSync(path, 'utf8')), ...over },
  });
  return { ...made, reads };
}

describe('a matrix note whose real path is outside the vault is refused', () => {
  test('a link to a file outside is not read, and the gate asks, saying why', async () => {
    const where = modVault();
    linked(where, 'outside');
    symlinkSync(join(where.top, 'elsewhere', 'Matrix.md'), join(where.vault, 'Policy', 'Matrix.md'));
    const { launcher, reads } = watched(where);
    const gate = await launcher.gate(writeNote(where, 'p.md', 'Public'));
    assert.equal(kind(gate), 'ask');
    assert.match(gate.ask, /matrix note.*outside the vault/i);
    assert.ok(!reads.some((p) => p.endsWith('Matrix.md')), 'the linked note was never read');
  });

  test('a folder above the note that is a link out is refused the same', async () => {
    const where = modVault();
    const real = linked(where, 'outside');
    mkdirSync(join(where.vault, 'Via'));
    symlinkSync(real, join(where.vault, 'Via', 'Policy'));
    const reads = [];
    const made = launcherFor(where, {
      settings: { ...settings, aiMatrixNote: 'Via/Policy/Matrix.md' },
      ports: { read: async (path) => (reads.push(path), readFileSync(path, 'utf8')) },
    });
    assert.match((await made.launcher.gate(writeNote(where, 'p.md', 'Public'))).ask, /outside the vault/i);
    assert.ok(!reads.some((p) => p.endsWith('Matrix.md')));
  });

  test('a link to a file inside the vault is read, and the row applies', async () => {
    const where = modVault();
    linked(where, 'inside');
    symlinkSync(join(where.vault, 'Kept', 'Matrix.md'), join(where.vault, 'Policy', 'Matrix.md'));
    const { launcher } = watched(where);
    assert.deepEqual(await launcher.gate(writeNote(where, 'p.md', 'Public')), { open: true });
  });

  test('a host with no real-path call cannot tell, so the note is refused, and the gate says so', async () => {
    const where = modVault();
    mkdirSync(join(where.vault, 'Policy'));
    writeFileSync(join(where.vault, 'Policy', 'Matrix.md'), MATRIX);
    const { launcher, reads } = watched(where, { realPath: undefined });
    const gate = await launcher.gate(writeNote(where, 'p.md', 'Public'));
    assert.equal(kind(gate), 'ask');
    assert.match(gate.ask, /cannot tell whether the matrix note is inside the vault/i);
    assert.ok(!reads.some((p) => p.endsWith('Matrix.md')));
  });

  test('a real-path call that fails refuses the note too', async () => {
    const where = modVault();
    mkdirSync(join(where.vault, 'Policy'));
    writeFileSync(join(where.vault, 'Policy', 'Matrix.md'), MATRIX);
    const { launcher } = watched(where, {
      realPath: async () => {
        throw new Error('no');
      },
    });
    assert.equal(kind(await launcher.gate(writeNote(where, 'p.md', 'Public'))), 'ask');
  });

  test('the server is handed the same refusal, and its gate says the same', async () => {
    const where = modVault();
    linked(where, 'outside');
    symlinkSync(join(where.top, 'elsewhere', 'Matrix.md'), join(where.vault, 'Policy', 'Matrix.md'));
    const { launcher } = watched(where);
    const path = writeNote(where, 'p.md', 'Public');
    const used = await launcher.gateSettings(path);
    const text = readFileSync(path, 'utf8');
    const mod = claudeGate(text, used);
    const server = storeGate(serverSettings(settingsForServer(used)), null).note(text, null);
    assert.ok(server?.startsWith(mod.ask));
    assert.match(server, /outside the vault/);
  });
});

describe('the real path asked of a host that can only start a process', () => {
  test('a file’s real path, through a link too, and a failure for a file that is not there', async () => {
    const where = modVault();
    const host = hostSpawn();
    const realPath = realPathVia(host.spawn);
    writeFileSync(join(where.top, 'real.md'), 'x');
    symlinkSync(join(where.top, 'real.md'), join(where.top, 'link.md'));
    const real = await realPath(join(where.top, 'real.md'));
    assert.equal(await realPath(join(where.top, 'link.md')), real);
    assert.ok(real.endsWith('real.md'));
    await assert.rejects(realPath(join(where.top, 'missing.md')));
  });

  test('the path is an argument of the command, never part of the script', async () => {
    const where = modVault();
    const host = hostSpawn();
    const odd = join(where.top, "it's $(x) `y`.md");
    writeFileSync(odd, 'x');
    assert.ok((await realPathVia(host.spawn)(odd)).endsWith("it's $(x) `y`.md"));
    assert.ok(host.requests[0].argv.includes(odd));
    assert.ok(!host.requests[0].argv[2].includes('$(x)'), 'the script holds none of the path');
  });
});
