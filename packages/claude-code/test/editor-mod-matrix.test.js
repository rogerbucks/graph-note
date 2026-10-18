// Claude's level from the destination matrix, in the mod and in the server (editor spec §26, cc_classified_asks;
// §19, model_ceiling). The mod reads the matrix note named in the settings, inside the vault only. It hands the server
// the row, the switches, the class names and the rows read. So both gates give the same answer on the same inputs. A
// matrix note that cannot be read, or lies outside the vault, fails both closed. The core's rule is tested in
// packages/core/test/claude-gate.test.js and packages/core/test/ai-matrix.test.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { claudeGate } from '@thoughtknot/core';
import { launcherFor, modVault, writeNote } from './editor-mod-support.js';
import { settingsForServer } from '../src/editor-launch.ts';
import { storeGate } from '../server/editor-gate.ts';
import { gateSettings as serverSettings } from '../server/editor-main.ts';

const MATRIX = [
  '# Matrix',
  '',
  '| | Public | Internal | Confidential |',
  '|---|---|---|---|',
  '| Claude chat | ✅ | ⚠️ history off | ❌ |',
  '',
].join('\n');
const claude = (extra = {}) => ({
  name: 'Claude',
  purpose: '',
  ceiling: 'Restricted',
  endpoint: '',
  model: '',
  keyName: '',
  matrixRow: 'Claude chat',
  ...extra,
});
const settingsWith = (model = claude(), extra = {}) => ({
  ceiling: null,
  aiModels: [model],
  aiMatrixNote: 'Policy/Matrix.md',
  aiClassMap: {},
  ...extra,
});
function withMatrix(where, text = MATRIX) {
  mkdirSync(join(where.vault, 'Policy'), { recursive: true });
  writeFileSync(join(where.vault, 'Policy', 'Matrix.md'), text);
}
const kind = (gate) => Object.keys(gate)[0];

describe('the mod reads the matrix note for Claude’s row', () => {
  test('a yes opens, a conditional asks until switched on, a no asks', async () => {
    const where = modVault();
    withMatrix(where);
    const { launcher } = launcherFor(where, { settings: settingsWith() });
    assert.deepEqual(await launcher.gate(writeNote(where, 'p.md', 'Public')), { open: true });
    assert.equal(kind(await launcher.gate(writeNote(where, 'i.md', 'Internal'))), 'ask');
    assert.equal(kind(await launcher.gate(writeNote(where, 'c.md', 'Confidential'))), 'ask');
    const on = launcherFor(where, {
      settings: settingsWith(claude({ matrixOn: [{ class: 'Internal', condition: 'history off' }] })),
    });
    assert.deepEqual(await on.launcher.gate(writeNote(where, 'i.md', 'Internal')), { open: true });
  });

  test('a matrix note that cannot be read, or has no such row, fails closed', async () => {
    const where = modVault();
    const missing = launcherFor(where, { settings: settingsWith() });
    assert.equal(kind(await missing.launcher.gate(writeNote(where, 'p.md', 'Public'))), 'ask');
    withMatrix(where);
    const gone = launcherFor(where, { settings: settingsWith(claude({ matrixRow: 'Nowhere' })) });
    assert.equal(kind(await gone.launcher.gate(writeNote(where, 'p.md', 'Public'))), 'ask');
  });

  test('a path outside the vault is refused, however it is written, and never read', async () => {
    const where = modVault();
    withMatrix(where);
    writeFileSync(join(where.top, 'Outside.md'), MATRIX);
    for (const aiMatrixNote of [
      '../../Outside.md',
      '../Outside.md',
      join(where.top, 'Outside.md'),
      '/etc/hosts',
      '~/x.md',
      '',
    ]) {
      const reads = [];
      const { launcher } = launcherFor(where, {
        settings: settingsWith(claude(), { aiMatrixNote }),
        ports: { read: async (path) => (reads.push(path), (await import('node:fs')).readFileSync(path, 'utf8')) },
      });
      assert.equal(kind(await launcher.gate(writeNote(where, 'p.md', 'Public'))), 'ask', aiMatrixNote);
      assert.ok(!reads.some((p) => p.endsWith('Outside.md') || p === '/etc/hosts'), aiMatrixNote);
    }
  });

  test('with no row picked, the matrix note is not read and the ceiling stands', async () => {
    const where = modVault();
    const reads = [];
    const { launcher } = launcherFor(where, {
      settings: settingsWith(claude({ matrixRow: undefined, ceiling: 'Internal' })),
      ports: { read: async (path) => (reads.push(path), (await import('node:fs')).readFileSync(path, 'utf8')) },
    });
    assert.deepEqual(await launcher.gate(writeNote(where, 'i.md', 'Internal')), { open: true });
    assert.ok(!reads.some((p) => p.includes('Matrix')));
  });
});

describe('the server is handed the same row, switches, class names and rows', () => {
  test('the settings given to the server hold them, and no key', async () => {
    const where = modVault();
    withMatrix(where);
    const model = claude({ keyName: 'secret-name', matrixOn: [{ class: 'Internal', condition: 'history off' }] });
    const { launcher, host } = launcherFor(where, {
      settings: settingsWith(model, { aiClassMap: { Open: 'Public' } }),
    });
    await launcher.edit(writeNote(where, 'p.md', 'Public'));
    const given = JSON.parse(host.requests[0].env.THOUGHTKNOT_EDITOR_SETTINGS);
    assert.equal(given.aiModels[0].matrixRow, 'Claude chat');
    assert.deepEqual(given.aiModels[0].matrixOn, [{ class: 'Internal', condition: 'history off' }]);
    assert.deepEqual(given.aiClassMap, { Open: 'Public' });
    assert.equal(given.matrix[0].name, 'Claude chat');
    assert.ok(!JSON.stringify(given).includes('secret-name'));
  });

  test('rows that are not rows, or none, are no rows: a row picked then clears nothing', () => {
    for (const matrix of [
      undefined,
      'x',
      [{ name: 5 }],
      [{ name: 'Claude chat', cells: [{ class: 'Public', mark: 'maybe' }] }],
    ]) {
      const raw = JSON.stringify({ ...JSON.parse(settingsForServer(settingsWith(claude()))), matrix });
      const s = serverSettings(raw);
      assert.equal(kind(claudeGate('---\nclassification: Public\n---\nText', s)), 'ask');
    }
  });
});

describe('the mod’s gate and the server’s give the same answer on the same inputs', () => {
  const NOTES = ['Public', 'Internal', 'Confidential', 'Restricted', 'Nonsense', null];
  const CASES = {
    'a row, nothing switched on': settingsWith(),
    'the conditional switched on under its condition': settingsWith(
      claude({ matrixOn: [{ class: 'Internal', condition: 'history off' }] }),
    ),
    'a switch under another condition': settingsWith(
      claude({ matrixOn: [{ class: 'Internal', condition: 'old words' }] }),
    ),
    'a row that is not in the note': settingsWith(claude({ matrixRow: 'Nowhere' })),
    'no row, a ceiling': settingsWith(claude({ matrixRow: undefined, ceiling: 'Internal' })),
    'a path outside the vault': settingsWith(claude(), { aiMatrixNote: '../Outside.md' }),
  };

  for (const [name, over] of Object.entries(CASES))
    test(name, async () => {
      const where = modVault();
      withMatrix(where);
      const { launcher } = launcherFor(where, { settings: over });
      for (const level of NOTES) {
        const path = writeNote(where, 'n.md', level);
        const text = (await import('node:fs')).readFileSync(path, 'utf8');
        const used = await launcher.gateSettings(path);
        const mod = claudeGate(text, used);
        const server = storeGate(serverSettings(settingsForServer(used)), null).note(text, null);
        assert.equal(kind(await launcher.gate(path)), kind(mod), `${level}: the launcher uses the same settings`);
        if ('open' in mod) assert.equal(server, null, `${name} / ${level}`);
        else assert.ok(server?.startsWith('ask' in mod ? mod.ask : mod.refuse), `${name} / ${level}: ${server}`);
      }
    });
});
